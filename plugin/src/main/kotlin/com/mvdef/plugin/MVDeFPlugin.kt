package com.mvdef.plugin

import com.mvdef.plugin.commands.EmpireCommand
import com.mvdef.plugin.locks.LockCommand
import com.mvdef.plugin.locks.LockListener
import com.mvdef.plugin.locks.LockService
import com.mvdef.plugin.token.TokenService
import org.bukkit.plugin.java.JavaPlugin
import com.mvdef.plugin.players.PlayerCommand
import com.mvdef.plugin.players.PlayerService
import com.mvdef.plugin.players.RemovalManager

class MVDeFPlugin : JavaPlugin() {

    lateinit var tokenService: TokenService
        private set

    lateinit var lockService: LockService
        private set

    override fun onEnable() {
        saveDefaultConfig()

        tokenService = TokenService(this)
        lockService = LockService(this)

        getCommand("/empire")?.setExecutor(EmpireCommand(this, tokenService))

        val lockCommand = LockCommand(lockService)
        getCommand("/ckey")?.setExecutor(lockCommand)
        getCommand("/dkey")?.setExecutor(lockCommand)

        server.pluginManager.registerEvents(LockListener(lockService), this)

        val playerService = PlayerService(this)
        val removalManager = RemovalManager(this, playerService)
        server.pluginManager.registerEvents(removalManager, this)
        getCommand("/listallplayer")?.setExecutor(PlayerCommand(playerService, removalManager))

        logger.info("MVDeF plugin увімкнено.")
    }

    override fun onDisable() {
        logger.info("MVDeF plugin вимкнено.")
    }
}