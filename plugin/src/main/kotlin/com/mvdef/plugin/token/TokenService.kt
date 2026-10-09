package com.mvdef.plugin.token

import org.bukkit.plugin.java.JavaPlugin
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.SecureRandom
import java.time.Duration
import java.util.UUID
import java.util.logging.Level

class TokenService(private val plugin: JavaPlugin) {

    companion object {
        private const val TOKEN_CHARS =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        private const val TOKEN_LENGTH = 32
    }

    private val random = SecureRandom()

    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build()

    fun createSessionAsync(playerUuid: UUID, playerName: String, callback: (String?) -> Unit) {
        val token = generateToken()
        val websiteUrl = plugin.config.getString("website-url")

        val jsonBody = """
            {"action":"createSession","token":"$token","uuid":"$playerUuid","name":"$playerName"}
        """.trimIndent()

        val request = HttpRequest.newBuilder()
            .uri(URI.create(websiteUrl))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
            .timeout(Duration.ofSeconds(8))
            .build()

        httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenAccept { response ->
                val success = response.statusCode() == 200

                plugin.server.scheduler.runTask(plugin, Runnable {
                    if (success) {
                        callback(token)
                    } else {
                        plugin.logger.log(Level.WARNING,
                            "Не вдалося створити сесію на сайті. Код відповіді: ${response.statusCode()}")
                        callback(null)
                    }
                })
            }
            .exceptionally { ex ->
                plugin.logger.log(Level.SEVERE, "Помилка з'єднання з сайтом MVDeF", ex)
                plugin.server.scheduler.runTask(plugin, Runnable { callback(null) })
                null
            }
    }

    fun buildLoginUrl(token: String): String {
        val websiteUrl = plugin.config.getString("website-url")
        return "$websiteUrl?token=$token"
    }

    private fun generateToken(): String =
        (1..TOKEN_LENGTH)
            .map { TOKEN_CHARS[random.nextInt(TOKEN_CHARS.length)] }
            .joinToString("")
}