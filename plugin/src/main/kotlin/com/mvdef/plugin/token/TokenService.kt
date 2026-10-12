package com.mvdef.plugin.token

import org.bukkit.plugin.java.JavaPlugin
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.SecureRandom
import java.time.Duration
import java.util.UUID

class TokenService(private val plugin: JavaPlugin) {

    companion object {
        private const val TOKEN_CHARS =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        private const val TOKEN_LENGTH = 32
    }

    private val random = SecureRandom()
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    fun createSessionAsync(playerUuid: UUID, playerName: String, callback: (String?) -> Unit) {
        val token = generateToken()
        val expiresAt = (System.currentTimeMillis() / 1000) + plugin.config.getLong("token-expiry-seconds", 300)
        val apiUrl = plugin.config.getString(
            "login-api-url",
            "https://mvdef-fishing-api.mvdef-mc.workers.dev"
        ).orEmpty().trimEnd('/')
        val issuerSecret = System.getenv("MVDEF_LOGIN_API_SECRET")
            ?.takeIf(String::isNotBlank)
            ?: plugin.config.getString("login-api-secret").orEmpty()

        plugin.server.scheduler.runTaskAsynchronously(plugin, Runnable {
            try {
                require(apiUrl.startsWith("https://")) { "login-api-url має використовувати HTTPS." }
                require(issuerSecret.length >= 32) { "У конфігурації плагіна не задано login-api-secret (мінімум 32 символи)." }
                val request = HttpRequest.newBuilder()
                    .uri(URI.create("$apiUrl/api/login/issue"))
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer $issuerSecret")
                    .POST(HttpRequest.BodyPublishers.ofString(
                        """{"token":"$token","uuid":"$playerUuid","playerName":${jsonString(playerName)},"expiresAt":$expiresAt}"""
                    ))
                    .build()
                val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
                check(response.statusCode() in 200..299) {
                    "Worker відхилив запит створення токена (HTTP ${response.statusCode()})."
                }

                plugin.server.scheduler.runTask(plugin, Runnable {
                    callback(token)
                })
            } catch (e: Exception) {
                plugin.logger.severe("Помилка створення токена входу у Worker: ${e.message}")
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

    private fun jsonString(value: String): String = buildString {
        append('"')
        for (character in value) {
            when (character) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\b' -> append("\\b")
                '\u000c' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (character.code < 0x20) {
                    append("\\u%04x".format(character.code))
                } else {
                    append(character)
                }
            }
        }
        append('"')
    }
}