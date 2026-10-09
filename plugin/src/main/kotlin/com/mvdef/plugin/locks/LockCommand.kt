package com.mvdef.plugin.locks

import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.entity.Player

class LockCommand(private val lockService: LockService) : CommandExecutor {

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

        if (args.isEmpty()) {
            player.sendMessage(
                Component.text("Використання: //${command.name.removePrefix("/")} <кодове_слово>", NamedTextColor.YELLOW)
            )
            return true
        }

        val codeword = args.joinToString(" ")

        val targetBlock = player.getTargetBlockExact(5) ?: run {
            player.sendMessage(Component.text("Подивись на двері, скриню, хвіртку або бочку.", NamedTextColor.RED))
            return true
        }

        if (!LockUtil.isLockable(targetBlock.type)) {
            player.sendMessage(Component.text("Цей об'єкт не можна замкнути.", NamedTextColor.RED))
            return true
        }

        val location = LockUtil.canonicalLocation(targetBlock)
        val objectName = LockUtil.describeMaterial(targetBlock.type)

        return when (command.name) {
            "/ckey" -> {
                if (lockService.isLocked(location)) {
                    player.sendMessage(Component.text("Цей об'єкт вже замкнено.", NamedTextColor.RED))
                    return true
                }

                lockService.lock(location, codeword, player.uniqueId)
                player.sendMessage(
                    Component.text(
                        "Ви замкнули $objectName. Вам потрібно перейменувати гачок для розтяжки на [$codeword], щоб відкривати цей $objectName.",
                        NamedTextColor.GREEN
                    )
                )
                true
            }

            "/dkey" -> {
                if (!lockService.isLocked(location)) {
                    player.sendMessage(Component.text("Цей об'єкт не замкнено.", NamedTextColor.RED))
                    return true
                }

                val unlocked = lockService.unlockIfMatches(location, codeword)

                if (unlocked) {
                    player.sendMessage(Component.text("Ви розблокували $objectName.", NamedTextColor.GREEN))
                } else {
                    player.sendMessage(Component.text("Невірне кодове слово.", NamedTextColor.RED))
                }
                true
            }

            else -> false
        }
    }
}