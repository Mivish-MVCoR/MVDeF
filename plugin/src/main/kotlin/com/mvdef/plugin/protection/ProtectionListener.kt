package com.mvdef.plugin.protection

import com.mvdef.plugin.empire.EmpireRepository
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import org.bukkit.entity.Player
import org.bukkit.event.EventHandler
import org.bukkit.event.EventPriority
import org.bukkit.event.Listener
import org.bukkit.event.block.BlockBreakEvent
import org.bukkit.event.block.BlockPlaceEvent
import org.bukkit.event.entity.EntityChangeBlockEvent
import org.bukkit.event.player.PlayerBucketEmptyEvent
import org.bukkit.event.player.PlayerBucketFillEvent
import org.bukkit.event.player.PlayerMoveEvent
import org.bukkit.event.hanging.HangingBreakByEntityEvent

class ProtectionListener(private val repo: EmpireRepository) : Listener {

    // Запам'ятовуємо в якому чанку був гравець, щоб показувати action bar лише при переході
    private val lastChunk = HashMap<String, String>()

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    fun onBlockBreak(event: BlockBreakEvent) {
        if (!isProtected(event.player, event.block.chunk.x, event.block.chunk.z, event.block.world.name)) {
            return
        }
        event.isCancelled = true
        sendDenied(event.player)
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    fun onBlockPlace(event: BlockPlaceEvent) {
        if (!isProtected(event.player, event.block.chunk.x, event.block.chunk.z, event.block.world.name)) {
            return
        }
        event.isCancelled = true
        sendDenied(event.player)
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    fun onBucketEmpty(event: PlayerBucketEmptyEvent) {
        val chunk = event.block.chunk
        if (!isProtected(event.player, chunk.x, chunk.z, event.block.world.name)) return
        event.isCancelled = true
        sendDenied(event.player)
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    fun onBucketFill(event: PlayerBucketFillEvent) {
        val chunk = event.block.chunk
        if (!isProtected(event.player, chunk.x, chunk.z, event.block.world.name)) return
        event.isCancelled = true
        sendDenied(event.player)
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    fun onHangingBreak(event: HangingBreakByEntityEvent) {
        val breaker = event.remover as? Player ?: return
        val loc = event.entity.location
        val chunk = loc.chunk
        if (!isProtected(breaker, chunk.x, chunk.z, loc.world.name)) return
        event.isCancelled = true
        sendDenied(breaker)
    }

    @EventHandler
    fun onPlayerMove(event: PlayerMoveEvent) {
        val from = event.from.chunk
        val to = event.to.chunk
        if (from.x == to.x && from.z == to.z) return

        val world = event.to.world.name
        val chunkKey = "${world}_${to.x}_${to.z}"
        val playerId = event.player.uniqueId.toString()

        if (lastChunk[playerId] == chunkKey) return
        lastChunk[playerId] = chunkKey

        val empire = repo.getChunkEmpire(world, to.x, to.z)
        if (empire != null) {
            event.player.sendActionBar(
                Component.text("⚑ Імперія ${empire.name}", NamedTextColor.GOLD)
            )
        } else {
            event.player.sendActionBar(
                Component.text("◌ Нейтральна територія", NamedTextColor.GRAY)
            )
        }
    }

    private fun isProtected(player: Player, chunkX: Int, chunkZ: Int, world: String): Boolean {
        if (player.hasPermission("mvdef.admin")) return false
        val empire = repo.getChunkEmpire(world, chunkX, chunkZ) ?: return false
        if (empire.ownerUuid == player.uniqueId.toString()) return false
        return true
    }

    private fun sendDenied(player: Player) {
        player.sendMessage(
            Component.text("[MVDeF] ", NamedTextColor.GOLD)
                .append(Component.text("Ця територія захищена.", NamedTextColor.RED))
        )
    }
}