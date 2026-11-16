package com.mvdef.plugin.rulet

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.mvdef.plugin.MVDeFPlugin
import com.mvdef.plugin.token.TokenService
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.event.ClickEvent
import net.kyori.adventure.text.format.NamedTextColor
import net.kyori.adventure.text.format.TextDecoration
import org.bukkit.Material
import org.bukkit.entity.Player
import org.bukkit.inventory.ItemStack
import java.util.UUID

class RuletManager(
    private val plugin: MVDeFPlugin,
    private val tokens: TokenService
) {
    val api = RuletApi(plugin, tokens)
    private val store = RuletStore(plugin)

    private val duels = HashMap<String, Duel>()
    private val busy = HashSet<UUID>()
    private var polling = false

    private val inviteSeconds: Long
        get() = plugin.config.getLong("rulet-invite-seconds", 120)

    // ------------------------------------------------------------------
    // Запуск
    // ------------------------------------------------------------------

    fun start() {
        recoverEscrows()
        val ticks = plugin.config.getLong("rulet-poll-ticks", 40)
        plugin.server.scheduler.runTaskTimer(plugin, Runnable { poll() }, 60L, ticks)
    }

    /** Після перезапуску сервера повертаємо ставки всіх незавершених дуелей. */
    private fun recoverEscrows() {
        for (e in store.allEscrows()) {
            refund(e.a, e.stake)
            refund(e.b, e.stake)
            store.removeEscrow(e.duelId)
            api.postAsync("/api/rulet/duel/${e.duelId}/cancel", JsonObject())
            plugin.logger.info("Рулетка: повернуто ставки дуелі ${e.duelId} після перезапуску.")
        }
    }

    fun isBusy(uuid: UUID): Boolean = uuid in busy

    fun sendGameLink(player: Player) {
        player.sendMessage(Component.text("Створюємо посилання на рулетку...", NamedTextColor.GRAY))
        tokens.createSessionAsync(player.uniqueId, player.name) { token ->
            if (token == null) {
                player.sendMessage(
                    Component.text(
                        "Не вдалося з'єднатись із сайтом MVDeF. Спробуй пізніше.",
                        NamedTextColor.RED
                    )
                )
                return@createSessionAsync
            }

            val page = plugin.config.getString("rulet-page", "/rolet.html").orEmpty()
            player.sendMessage(button("[ >>> Відкрити рулетку <<< ]", tokens.buildLoginUrl(token, page)))
        }
    }

    // ------------------------------------------------------------------
    // Мембрани
    // ------------------------------------------------------------------

    fun countMembranes(player: Player): Int =
        player.inventory.contents
            .filterNotNull()
            .filter { it.type == Material.PHANTOM_MEMBRANE }
            .sumOf { it.amount }

    private fun takeMembranes(player: Player, amount: Int) {
        var left = amount
        val inv = player.inventory
        for (slot in 0 until inv.size) {
            val item = inv.getItem(slot) ?: continue
            if (item.type != Material.PHANTOM_MEMBRANE) continue
            if (item.amount <= left) {
                left -= item.amount
                inv.setItem(slot, null)
            } else {
                item.amount = item.amount - left
                left = 0
            }
            if (left == 0) break
        }
    }

    private fun giveMembranes(player: Player, amount: Int) {
        var left = amount
        while (left > 0) {
            val n = minOf(left, 64)
            val leftover = player.inventory.addItem(ItemStack(Material.PHANTOM_MEMBRANE, n))
            leftover.values.forEach { player.world.dropItemNaturally(player.location, it) }
            left -= n
        }
    }

    /** Повертає мембрани гравцю; якщо він офлайн, відкладаємо до входу. */
    private fun refund(uuid: UUID, amount: Int) {
        if (amount <= 0) return
        val player = plugin.server.getPlayer(uuid)
        if (player != null) {
            giveMembranes(player, amount)
            player.sendMessage(Component.text("Тобі повернуто $amount мембран.", NamedTextColor.YELLOW))
        } else {
            store.addPendingItems(uuid, amount)
        }
    }

    private fun refundEscrow(duelId: String) {
        val e = store.getEscrow(duelId) ?: return
        store.removeEscrow(duelId)
        refund(e.a, e.stake)
        refund(e.b, e.stake)
    }

    // ------------------------------------------------------------------
    // Створення дуелі
    // ------------------------------------------------------------------

    fun invite(challenger: Player, target: Player, stake: Int) {
        val duel = Duel(
            id = UUID.randomUUID().toString().replace("-", "").take(12),
            challenger = challenger.uniqueId,
            challengerName = challenger.name,
            target = target.uniqueId,
            targetName = target.name,
            stake = stake
        )
        duels[duel.id] = duel
        busy += challenger.uniqueId
        busy += target.uniqueId

        challenger.sendMessage(Component.text("Створюємо дуель...", NamedTextColor.GRAY))

        tokens.createSessionAsync(challenger.uniqueId, challenger.name) { challengerToken ->
            if (challengerToken == null) {
                fail(duel, "не вдалося з'єднатись із сайтом")
            } else {
                tokens.createSessionAsync(target.uniqueId, target.name) { targetToken ->
                    if (targetToken == null) {
                        fail(duel, "не вдалося з'єднатись із сайтом")
                    } else {
                        createOnWorker(duel, challengerToken, targetToken)
                    }
                }
            }
        }
    }

    private fun createOnWorker(duel: Duel, challengerToken: String, targetToken: String) {
        val body = JsonObject().apply {
            addProperty("duelId", duel.id)
            addProperty("challenger", duel.challenger.toString())
            addProperty("target", duel.target.toString())
            addProperty("challengerName", duel.challengerName)
            addProperty("targetName", duel.targetName)
            addProperty("stake", duel.stake)
        }
        api.postAsync("/api/rulet/duel", body) { ok ->
            if (!ok) {
                fail(duel, "сайт не прийняв дуель")
            } else {
                sendInvites(duel, challengerToken, targetToken)
                scheduleExpiry(duel)
            }
        }
    }

    private fun sendInvites(duel: Duel, challengerToken: String, targetToken: String) {
        plugin.server.getPlayer(duel.challenger)?.let { challenger ->
            challenger.sendMessage(Component.text("MVDeF/рулетка", NamedTextColor.GOLD))
            challenger.sendMessage(
                Component.text("Запрошення надіслано гравцю ${duel.targetName}.", NamedTextColor.YELLOW)
            )
            challenger.sendMessage(button("[ >>> Відкрити дуель <<< ]", loginUrl(challengerToken, duel)))
        }

        plugin.server.getPlayer(duel.target)?.let { target ->
            target.sendMessage(Component.text("MVDeF/рулетка", NamedTextColor.GOLD))
            target.sendMessage(
                Component.text("Гравець ${duel.challengerName} запрошує вас на дуель!", NamedTextColor.YELLOW)
            )
            target.sendMessage(
                Component.text(
                    if (duel.stake > 0) "Ставка: ${duel.stake} мембран" else "Без ставки",
                    NamedTextColor.WHITE
                )
            )
            if (duel.stake > 0) {
                target.sendMessage(
                    Component.text(
                        "Перед початком переконайтесь, що мембрани в інвентарі, інакше буде штраф.",
                        NamedTextColor.RED
                    )
                )
            }
            target.sendMessage(
                Component.text("Запрошення діє $inviteSeconds секунд. Гарної гри!", NamedTextColor.GRAY)
            )
            target.sendMessage(button("[ >>> Прийняти дуель <<< ]", loginUrl(targetToken, duel)))
        }
    }

    private fun loginUrl(token: String, duel: Duel): String {
        val page = plugin.config.getString("rulet-page", "/rolet.html")
        return tokens.buildLoginUrl(token, "$page?duel=${duel.id}")
    }

    private fun button(text: String, url: String): Component =
        Component.text(text, NamedTextColor.AQUA)
            .decorate(TextDecoration.UNDERLINED)
            .clickEvent(ClickEvent.openUrl(url))
            .hoverEvent(Component.text("Натисни, щоб відкрити гру"))

    private fun scheduleExpiry(duel: Duel) {
        plugin.server.scheduler.runTaskLater(plugin, Runnable {
            val current = duels[duel.id]
            if (current != null && current.state == Duel.State.INVITED) {
                cancel(current, "час запрошення вийшов")
            }
        }, inviteSeconds * 20L)
    }

    fun cancel(duel: Duel, reason: String) {
        api.postAsync("/api/rulet/duel/${duel.id}/cancel", JsonObject())
        close(duel)
        notifyBoth(duel, "Дуель скасовано: $reason.", NamedTextColor.RED)
    }

    private fun fail(duel: Duel, reason: String) {
        close(duel)
        plugin.server.getPlayer(duel.challenger)?.sendMessage(
            Component.text("Дуель не створено: $reason.", NamedTextColor.RED)
        )
    }

    private fun close(duel: Duel) {
        duels.remove(duel.id)
        busy.remove(duel.challenger)
        busy.remove(duel.target)
    }

    private fun notifyBoth(duel: Duel, text: String, color: NamedTextColor) {
        listOf(duel.challenger, duel.target).forEach { uuid ->
            plugin.server.getPlayer(uuid)?.sendMessage(Component.text(text, color))
        }
    }

    // ------------------------------------------------------------------
    // Опитування подій Worker
    // ------------------------------------------------------------------

    private fun poll() {
        if (polling) return
        polling = true
        api.getAsync("/api/rulet/events?after=${store.lastEventId}") { json ->
            try {
                if (json != null) handleEvents(json)
            } finally {
                polling = false
            }
        }
    }

    private fun handleEvents(json: JsonElement) {
        val array: JsonArray = when {
            json.isJsonArray -> json.asJsonArray
            json.isJsonObject && json.asJsonObject.get("events")?.isJsonArray == true ->
                json.asJsonObject.getAsJsonArray("events")
            else -> return
        }
        for (element in array) {
            val event = element.asJsonObject
            val id = event.get("id")?.asLong ?: continue
            if (id <= store.lastEventId) continue
            try {
                handleEvent(event)
            } catch (e: Exception) {
                plugin.logger.severe("Рулетка: помилка обробки події $id: ${e.message}")
            }
            store.lastEventId = id
        }
    }

    private fun JsonObject.str(name: String): String? =
        get(name)?.takeIf { !it.isJsonNull }?.asString

    private fun handleEvent(event: JsonObject) {
        val duelId = event.str("duelId") ?: return
        when (event.str("type")) {
            "both_accepted" -> onBothAccepted(duelId)
            "finished" -> onFinished(duelId, event)
            "expired" -> onClosedByWorker(duelId, "час запрошення вийшов")
            "cancelled" -> onClosedByWorker(duelId, "запрошення відхилено")
        }
    }

    private fun onBothAccepted(duelId: String) {
        val duel = duels[duelId]
        if (duel == null) {
            // Дуелі не знаємо (наприклад, після перезапуску): закриваємо на сайті.
            api.postAsync("/api/rulet/duel/$duelId/cancel", JsonObject())
            return
        }
        if (duel.state != Duel.State.INVITED) return

        val a = plugin.server.getPlayer(duel.challenger)
        val b = plugin.server.getPlayer(duel.target)
        if (a == null || b == null) {
            cancel(duel, "один із гравців вийшов із сервера")
            return
        }

        if (duel.stake > 0) {
            val shortPlayer = when {
                countMembranes(a) < duel.stake -> a
                countMembranes(b) < duel.stake -> b
                else -> null
            }
            if (shortPlayer != null) {
                val body = JsonObject().apply {
                    addProperty("ok", false)
                    addProperty("failedPlayer", shortPlayer.uniqueId.toString())
                }
                api.postAsync("/api/rulet/duel/$duelId/stakes", body)
                close(duel)
                notifyBoth(
                    duel,
                    "Дуель скасовано: у ${shortPlayer.name} не вистачило мембран. Штраф: 100 монет сайту.",
                    NamedTextColor.RED
                )
                return
            }
            takeMembranes(a, duel.stake)
            takeMembranes(b, duel.stake)
            store.putEscrow(RuletStore.Escrow(duelId, a.uniqueId, b.uniqueId, duel.stake))
        }

        duel.state = Duel.State.ACTIVE
        val body = JsonObject().apply { addProperty("ok", true) }
        api.postAsync("/api/rulet/duel/$duelId/stakes", body) { ok ->
            if (!ok) {
                refundEscrow(duelId)
                close(duel)
                notifyBoth(duel, "Дуель скасовано через помилку сайту. Ставки повернуто.", NamedTextColor.RED)
            }
        }
    }

    private fun onFinished(duelId: String, event: JsonObject) {
        val winnerId = UUID.fromString(event.str("winner") ?: return)
        val loserId = UUID.fromString(event.str("loser") ?: return)

        val duel = duels[duelId]
        val escrow = store.getEscrow(duelId)
        if (duel == null && escrow == null) return // уже оброблено

        val pot = (escrow?.stake ?: 0) * 2
        if (escrow != null) store.removeEscrow(duelId) // спершу прибираємо, щоб не виплатити двічі

        val winner = plugin.server.getPlayer(winnerId)
        if (pot > 0) {
            if (winner != null) giveMembranes(winner, pot) else store.addPendingItems(winnerId, pot)
        }
        winner?.sendMessage(
            Component.text(
                if (pot > 0) "Ти виграв дуель! Банк: $pot мембран." else "Ти виграв дуель!",
                NamedTextColor.GREEN
            )
        )

        val loser = plugin.server.getPlayer(loserId)
        if (loser != null) {
            loser.sendMessage(Component.text("Ти програв дуель.", NamedTextColor.RED))
            loser.health = 0.0
        } else {
            store.setPendingTrick(loserId)
        }

        duel?.let { close(it) }
    }

    private fun onClosedByWorker(duelId: String, reason: String) {
        val duel = duels[duelId] ?: return
        if (duel.state == Duel.State.ACTIVE) refundEscrow(duelId)
        close(duel)
        notifyBoth(duel, "Дуель скасовано: $reason.", NamedTextColor.RED)
    }

    // ------------------------------------------------------------------
    // Вхід гравця: відкладені виплати та "Хітрюга!"
    // ------------------------------------------------------------------

    fun onJoin(player: Player) {
        val items = store.takePendingItems(player.uniqueId)
        val trick = store.takePendingTrick(player.uniqueId)
        if (items == 0 && !trick) return

        if (items > 0) giveMembranes(player, items)

        plugin.server.scheduler.runTaskLater(plugin, Runnable {
            if (items > 0) {
                player.sendMessage(
                    Component.text("MVDeF/рулетка: тобі видано $items мембран.", NamedTextColor.GREEN)
                )
            }
            if (trick) {
                player.sendMessage(Component.text("MVDeF/рулетка - Хітрюга!", NamedTextColor.GOLD))
            }
        }, 20L)
    }
}