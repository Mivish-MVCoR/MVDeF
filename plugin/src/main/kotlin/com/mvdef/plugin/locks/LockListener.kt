package com.mvdef.plugin.locks

import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import org.bukkit.Bukkit
import org.bukkit.entity.Player
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.event.block.Action
import org.bukkit.event.block.BlockBreakEvent
import org.bukkit.event.entity.EntityExplodeEvent
import org.bukkit.event.player.PlayerInteractEvent

class LockListener(private val lockService: LockService) : Listener {

    @EventHandler
    fun onPlayerInteract(event: PlayerInteractEvent) {
        if (event.action != Action.RIGHT_CLICK_BLOCK) return

        val block = event.clickedBlock ?: return
        if (!LockUtil.isLockable(block.type)) return

        val location = LockUtil.canonicalLocation(block)
        val lockData = lockService.getLock(location) ?: return
        val heldItem = event.player.inventory.itemInMainHand

        if (LockUtil.isKeyMatching(heldItem, lockData.codeword)) {
            return
        }

        event.isCancelled = true
        event.player.sendMessage(Component.text("Замкнено. Потрібен правильний гачок.", NamedTextColor.RED))
    }

    @EventHandler
    fun onBlockBreak(event: BlockBreakEvent) {
        val block = event.block
        if (!LockUtil.isLockable(block.type)) return

        val location = LockUtil.canonicalLocation(block)
        val lockData = lockService.getLock(location) ?: return
        val heldItem = event.player.inventory.itemInMainHand

        if (LockUtil.isKeyMatching(heldItem, lockData.codeword)) {
            return
        }

        event.isCancelled = true
        event.player.sendMessage(Component.text("Замкнено. Потрібен правильний гачок, щоб зламати цей об'єкт.", NamedTextColor.RED))

        notifyOwner(lockData.ownerUuid, event.player, block.type)
    }

    @EventHandler
    fun onEntityExplode(event: EntityExplodeEvent) {
        for (block in event.blockList()) {
            if (!LockUtil.isLockable(block.type)) continue

            val location = LockUtil.canonicalLocation(block)
            val lockData = lockService.getLock(location) ?: continue

            val owner = Bukkit.getPlayer(lockData.ownerUuid)
            if (owner != null) {
                val objectName = LockUtil.describeMaterial(block.type)
                owner.sendMessage(
                    Component.text(
                        "Вашу замкнену $objectName заламано вибухом! Координати: ${location.blockX}, ${location.blockY}, ${location.blockZ} (${location.world?.name}).",
                        NamedTextColor.RED
                    )
                )
            }

            lockService.forceUnlock(location)
        }
    }

    private fun notifyOwner(ownerUuid: java.util.UUID, breaker: Player, material: org.bukkit.Material) {
        val owner = Bukkit.getPlayer(ownerUuid) ?: return
        if (owner.uniqueId == breaker.uniqueId) return

        val notifyType = LockUtil.notifyType(material)

        val message = when (notifyType) {
            NotifyType.KNOCK -> "${breaker.name} постукав вам у двері."
            NotifyType.INTRUSION -> {
                val objectName = LockUtil.describeMaterial(material)
                "${breaker.name} хотів влізти до вас у $objectName."
            }
            NotifyType.NONE -> return
        }

        owner.sendMessage(Component.text(message, NamedTextColor.YELLOW))
    }
}