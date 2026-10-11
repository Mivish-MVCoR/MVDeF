package com.mvdef.plugin.players

import io.papermc.paper.event.player.AsyncChatEvent
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer
import org.bukkit.Bukkit
import org.bukkit.entity.Player
import org.bukkit.event.EventHandler
import org.bukkit.event.EventPriority
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerQuitEvent
import org.bukkit.plugin.java.JavaPlugin
import org.bukkit.scheduler.BukkitTask
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.logging.Level

class RemovalManager(
    private val plugin: JavaPlugin,
    private val service: PlayerService
) : Listener {

    private enum class Step { NICK, CONFIRM }

    private class Pending(val target: PlayerEntry, var step: Step, var timeout: BukkitTask)

    private val pending = ConcurrentHashMap<UUID, Pending>()

    companion object {
        private const val TIMEOUT_TICKS = 30L * 20L // 30 секунд
    }

    /** Запускає процес видалення. Нова команда скасовує попередню незавершену. */
    fun start(admin: Player, target: PlayerEntry) {
        cancel(admin.uniqueId)
        pending[admin.uniqueId] = Pending(target, Step.NICK, scheduleTimeout(admin.uniqueId))
        send(admin, "Ви хочете повністю видалити дані гравця ${target.name}, для підтвердження напишіть: ${target.name}")
    }

    @EventHandler(priority = EventPriority.LOWEST)
    fun onChat(event: AsyncChatEvent) {
        val adminId = event.player.uniqueId
        if (!pending.containsKey(adminId)) return

        // Повідомлення не має потрапити в загальний чат
        event.isCancelled = true
        val text = PlainTextComponentSerializer.plainText().serialize(event.message()).trim()

        // Далі працюємо в основному потоці
        plugin.server.scheduler.runTask(plugin, Runnable { handleAnswer(adminId, text) })
    }

    @EventHandler
    fun onQuit(event: PlayerQuitEvent) {
        cancel(event.player.uniqueId)
    }

    private fun handleAnswer(adminId: UUID, text: String) {
        val admin = Bukkit.getPlayer(adminId)
        val current = pending[adminId]
        if (admin == null || current == null) {
            cancel(adminId)
            return
        }

        when (current.step) {
            Step.NICK -> {
                if (text != current.target.name) {
                    cancel(adminId)
                    send(admin, "Нік не збігся. Видалення скасовано.", NamedTextColor.RED)
                    return
                }
                current.timeout.cancel()
                current.timeout = scheduleTimeout(adminId)
                current.step = Step.CONFIRM
                send(admin, "Ви точно хочете остаточно видалити дані того гравця? (y/n)")
            }

            Step.CONFIRM -> {
                cancel(adminId)
                if (!text.equals("y", ignoreCase = true)) {
                    send(admin, "Видалення скасовано.", NamedTextColor.RED)
                    return
                }
                execute(admin, current.target)
            }
        }
    }

    private fun execute(admin: Player, target: PlayerEntry) {
        // Гравець міг зайти на сервер, поки йшло підтвердження
        if (Bukkit.getPlayer(target.uuid) != null) {
            send(admin, "Гравець ${target.name} зайшов на сервер. Видалення скасовано.", NamedTextColor.RED)
            return
        }

        try {
            val moved = service.removeToTrash(target, admin)
            send(
                admin,
                "Дані гравця ${target.name} перенесено в trash/${target.uuid} (файлів: ${moved.size}).",
                NamedTextColor.GREEN
            )
        } catch (e: IOException) {
            plugin.logger.log(Level.SEVERE, "Помилка при видаленні даних гравця ${target.name}", e)
            send(admin, "Помилка при видаленні. Деталі в консолі.", NamedTextColor.RED)
        }
    }

    private fun scheduleTimeout(adminId: UUID): BukkitTask =
        plugin.server.scheduler.runTaskLater(plugin, Runnable {
            pending.remove(adminId) ?: return@Runnable
            Bukkit.getPlayer(adminId)?.let {
                send(it, "Час очікування вийшов. Видалення скасовано.", NamedTextColor.RED)
            }
        }, TIMEOUT_TICKS)

    private fun cancel(adminId: UUID) {
        pending.remove(adminId)?.timeout?.cancel()
    }

    private fun send(player: Player, text: String, color: NamedTextColor = NamedTextColor.YELLOW) {
        player.sendMessage(
            Component.text("[Сервер]: ", NamedTextColor.GOLD)
                .append(Component.text(text, color))
        )
    }
}