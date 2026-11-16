package com.mvdef.plugin.rulet

import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.TabCompleter
import org.bukkit.entity.Player

class RuletCommand(private val manager: RuletManager) : CommandExecutor, TabCompleter {

    private fun err(player: Player, text: String) =
        player.sendMessage(Component.text(text, NamedTextColor.RED))

    override fun onCommand(
        sender: CommandSender,
        command: Command,
        label: String,
        args: Array<out String>
    ): Boolean {
        val player = sender as? Player ?: run {
            sender.sendMessage("Цю команду можна використовувати тільки в грі.")
            return true
        }

        if (!player.hasPermission("rulet.use")) {
            err(player, "У тебе немає доступу до рулетки.")
            return true
        }
        if (args.isEmpty()) {
            player.sendMessage(
                Component.text("Використання: /rulet <нік> [ставка]", NamedTextColor.YELLOW)
            )
            manager.sendGameLink(player)
            return true
        }

        val target = player.server.getPlayerExact(args[0])
        if (target == null) {
            err(player, "Гравець ${args[0]} не в мережі.")
            return true
        }
        if (target.uniqueId == player.uniqueId) {
            err(player, "Не можна викликати самого себе.")
            return true
        }

        val stake = if (args.size > 1) args[1].toIntOrNull() else 0
        if (stake == null || stake < 0) {
            err(player, "Ставка має бути цілим числом від 0.")
            return true
        }

        if (manager.isBusy(player.uniqueId)) {
            err(player, "${target.name} вже бере участь у дуелі.")
            return true
        }
        if (manager.isBusy(target.uniqueId)) {
            err(player, "${target.name} вже береш участь у дуелі.")
            return true
        }

        if (stake > 0 && manager.countMembranes(player) < stake) {
            err(player, "У тебе немає $stake мембран фантома в інвентарі.")
            return true
        }
        if (stake > 0 && manager.countMembranes(target) < stake) {
            err(player, "У ${target.name} не вистачає мембран для такої ставки.")
            return true
        }

        manager.invite(player, target, stake)
        return true
    }

    override fun onTabComplete(
        sender: CommandSender,
        command: Command,
        alias: String,
        args: Array<out String>
    ): List<String> {
        val player = sender as? Player ?: return emptyList()
        if (!player.hasPermission("rulet.use") || args.size != 1) return emptyList()

        val prefix = args[0]
        return player.server.onlinePlayers
            .asSequence()
            .filter { it.uniqueId != player.uniqueId && !manager.isBusy(it.uniqueId) }
            .map { it.name }
            .filter { it.startsWith(prefix, ignoreCase = true) }
            .sorted()
            .toList()
    }
}