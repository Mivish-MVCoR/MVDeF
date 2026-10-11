package com.mvdef.plugin.players

import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import org.bukkit.Bukkit
import org.bukkit.command.Command
import org.bukkit.command.CommandSender
import org.bukkit.command.TabExecutor
import org.bukkit.entity.Player
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class PlayerCommand(
    private val service: PlayerService,
    private val removal: RemovalManager
) : TabExecutor {

    companion object {
        private const val PAGE_SIZE = 10
        private const val PERM_LIST = "mvdef.players.list"
        private const val PERM_REMOVE = "mvdef.players.remove"
    }

    private val dateFormat = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
        .withZone(ZoneId.systemDefault())

    override fun onCommand(
        sender: CommandSender,
        command: Command,
        label: String,
        args: Array<out String>
    ): Boolean {
        return if (args.isNotEmpty() && args[0].equals("remove", ignoreCase = true)) {
            handleRemove(sender, args)
        } else {
            handleList(sender, args)
        }
    }

    private fun handleList(sender: CommandSender, args: Array<out String>): Boolean {
        if (!sender.hasPermission(PERM_LIST)) {
            sender.sendMessage(Component.text("Немає прав.", NamedTextColor.RED))
            return true
        }

        val page = if (args.isEmpty()) 1 else args[0].toIntOrNull() ?: run {
            sender.sendMessage(
                Component.text("Використання: //listallplayer [сторінка] або //listallplayer remove <нік>", NamedTextColor.YELLOW)
            )
            return true
        }

        val all = service.listAll()
        if (all.isEmpty()) {
            sender.sendMessage(Component.text("Гравців не знайдено.", NamedTextColor.YELLOW))
            return true
        }

        val pages = (all.size + PAGE_SIZE - 1) / PAGE_SIZE
        val current = page.coerceIn(1, pages)
        val offset = (current - 1) * PAGE_SIZE

        sender.sendMessage(Component.text("=== Гравці (сторінка $current/$pages) ===", NamedTextColor.GOLD))
        all.drop(offset).take(PAGE_SIZE).forEachIndexed { i, entry ->
            sender.sendMessage(formatLine(offset + i + 1, entry))
        }
        if (current < pages) {
            sender.sendMessage(
                Component.text("Наступна сторінка: //listallplayer ${current + 1}", NamedTextColor.GRAY)
            )
        }
        return true
    }

    private fun formatLine(index: Int, entry: PlayerEntry): Component {
        val statuses = mutableListOf<String>()
        if (entry.banned) statuses.add("Забанений")
        statuses.add(if (entry.whitelisted) "У білому списку" else "Не в білому списку")

        // Бан має пріоритет у кольорі
        val color = when {
            entry.banned -> NamedTextColor.RED
            entry.whitelisted -> NamedTextColor.GREEN
            else -> NamedTextColor.YELLOW
        }

        val lastSeen = if (entry.lastPlayed <= 0L) {
            "ніколи"
        } else {
            dateFormat.format(Instant.ofEpochMilli(entry.lastPlayed))
        }

        return Component.text(
            "$index. ${entry.name} — ${statuses.joinToString(", ")} — $lastSeen",
            color
        )
    }

    private fun handleRemove(sender: CommandSender, args: Array<out String>): Boolean {
        if (!sender.hasPermission(PERM_REMOVE)) {
            sender.sendMessage(Component.text("Немає прав.", NamedTextColor.RED))
            return true
        }

        val admin = sender as? Player ?: run {
            sender.sendMessage("Видалення даних гравців працює тільки в грі.")
            return true
        }

        if (args.size != 2) {
            admin.sendMessage(Component.text("Використання: //listallplayer remove <нік>", NamedTextColor.YELLOW))
            return true
        }

        val target = service.findByName(args[1]) ?: run {
            admin.sendMessage(Component.text("Гравця ${args[1]} не знайдено.", NamedTextColor.RED))
            return true
        }

        if (Bukkit.getPlayer(target.uuid) != null) {
            admin.sendMessage(
                Component.text("Гравець ${target.name} зараз онлайн. Видалити дані можна тільки офлайн-гравця.", NamedTextColor.RED)
            )
            return true
        }

        removal.start(admin, target)
        return true
    }

    override fun onTabComplete(
        sender: CommandSender,
        command: Command,
        alias: String,
        args: Array<out String>
    ): MutableList<String> {
        if (!sender.hasPermission(PERM_REMOVE)) return mutableListOf()

        if (args.size == 1) {
            return listOf("remove").filter { it.startsWith(args[0], ignoreCase = true) }.toMutableList()
        }
        if (args.size == 2 && args[0].equals("remove", ignoreCase = true)) {
            return service.listAll().map { it.name }
                .filter { it.startsWith(args[1], ignoreCase = true) }
                .toMutableList()
        }
        return mutableListOf()
    }
}