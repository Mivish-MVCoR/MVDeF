package com.mvdef.plugin.token

import com.google.firebase.database.DatabaseException
import com.google.firebase.database.FirebaseDatabase
import org.bukkit.plugin.java.JavaPlugin
import java.security.SecureRandom
import java.util.UUID

class TokenService(private val plugin: JavaPlugin) {

    companion object {
        private const val TOKEN_CHARS =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        private const val TOKEN_LENGTH = 32
    }

    private val random = SecureRandom()
    private val database = FirebaseDatabase.getInstance()

    fun createSessionAsync(playerUuid: UUID, playerName: String, callback: (String?) -> Unit) {
        val token = generateToken()
        val expiresAt = (System.currentTimeMillis() / 1000) + plugin.config.getLong("token-expiry-seconds", 300)

        val tokenData = mapOf(
            "uuid" to playerUuid.toString(),
            "playerName" to playerName,
            "expiresAt" to expiresAt
        )

        plugin.server.scheduler.runTaskAsynchronously(plugin, Runnable {
            try {
                database.getReference("mvdef/tokens/$token")
                    .setValueAsync(tokenData)
                    .get()

                plugin.server.scheduler.runTask(plugin, Runnable {
                    callback(token)
                })
            } catch (e: Exception) {
                plugin.logger.severe("Помилка запису токена у Firebase: ${e.message}")
                plugin.server.scheduler.runTask(plugin, Runnable {
                    callback(null)
                })
            }
        })
    }

    fun buildLoginUrl(token: String): String {
        return "https://mivish-mvcor.github.io/MVDeF/login.html?token=$token"
    }

    private fun generateToken(): String =
        (1..TOKEN_LENGTH)
            .map { TOKEN_CHARS[random.nextInt(TOKEN_CHARS.length)] }
            .joinToString("")
}