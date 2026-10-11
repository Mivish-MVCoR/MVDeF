package com.mvdef.plugin.commands

import com.mvdef.plugin.MVDeFPlugin
import com.mvdef.plugin.token.TokenService
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.event.ClickEvent
import net.kyori.adventure.text.format.NamedTextColor
import net.kyori.adventure.text.format.TextDecoration
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.entity.Player

class EmpireCommand(
    private val plugin: MVDeFPlugin,
    private val tokenService: TokenService
) : CommandExecutor {

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

        player.sendMessage(Component.text("Створюємо посилання на MVDeF...", NamedTextColor.GRAY))

        tokenService.createSessionAsync(player.uniqueId, player.name) { token ->
            if (token == null) {
                player.sendMessage(
                    Component.text(
                        "Не вдалося з'єднатись з сайтом MVDeF. Спробуй пізніше.",
                        NamedTextColor.RED
                    )
                )
                return@createSessionAsync
            }

            val loginUrl = tokenService.buildLoginUrl(token)

            val message = Component.text("Відкрити MVDeF", NamedTextColor.AQUA)
                .decorate(TextDecoration.UNDERLINED)
                .clickEvent(ClickEvent.openUrl(loginUrl))
                .hoverEvent(Component.text("Натисни, щоб відкрити сайт"))

            player.sendMessage(message)
        }

        return true
    }
}