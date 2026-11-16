package com.mvdef.plugin.rulet

import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerJoinEvent

class RuletListener(private val manager: RuletManager) : Listener {

    @EventHandler
    fun onJoin(event: PlayerJoinEvent) {
        manager.onJoin(event.player)
    }
}