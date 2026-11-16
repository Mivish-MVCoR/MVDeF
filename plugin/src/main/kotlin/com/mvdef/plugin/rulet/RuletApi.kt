package com.mvdef.plugin.rulet

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.mvdef.plugin.MVDeFPlugin
import com.mvdef.plugin.token.TokenService
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

class RuletApi(
    private val plugin: MVDeFPlugin,
    private val tokens: TokenService
) {
    private val http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()
    private val reportedFailures = ConcurrentHashMap<String, Int>()

    private fun reportFailure(path: String, status: Int) {
        if (reportedFailures.put(path, status) != status) {
            plugin.logger.warning("Рулетка: $path повернув HTTP $status")
        }
    }

    private fun reportFailure(path: String, error: Exception) {
        if (reportedFailures.put(path, -1) != -1) {
            plugin.logger.warning("Рулетка: помилка запиту $path: ${error.message}")
        }
    }

    private fun request(path: String): HttpRequest.Builder =
        HttpRequest.newBuilder()
            .uri(URI.create(tokens.apiUrl() + path))
            .timeout(Duration.ofSeconds(15))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer ${tokens.issuerSecret()}")

    /** POST у Worker в окремому потоці. callback викликається в основному потоці. */
    fun postAsync(path: String, body: JsonObject, callback: (Boolean) -> Unit = {}) {
        plugin.server.scheduler.runTaskAsynchronously(plugin, Runnable {
            val ok = try {
                val response = http.send(
                    request(path).POST(HttpRequest.BodyPublishers.ofString(body.toString())).build(),
                    HttpResponse.BodyHandlers.ofString()
                )
                if (response.statusCode() !in 200..299) {
                    reportFailure(path, response.statusCode())
                } else {
                    reportedFailures.remove(path)
                }
                response.statusCode() in 200..299
            } catch (e: Exception) {
                reportFailure(path, e)
                false
            }
            if (plugin.isEnabled) {
                plugin.server.scheduler.runTask(plugin, Runnable { callback(ok) })
            }
        })
    }

    /** GET у Worker в окремому потоці. callback в основному потоці, null при помилці. */
    fun getAsync(path: String, callback: (JsonElement?) -> Unit) {
        plugin.server.scheduler.runTaskAsynchronously(plugin, Runnable {
            val result: JsonElement? = try {
                val response = http.send(
                    request(path).GET().build(),
                    HttpResponse.BodyHandlers.ofString()
                )
                if (response.statusCode() in 200..299) {
                    reportedFailures.remove(path)
                    JsonParser.parseString(response.body())
                } else {
                    reportFailure(path, response.statusCode())
                    null
                }
            } catch (e: Exception) {
                reportFailure(path, e)
                null
            }
            if (plugin.isEnabled) {
                plugin.server.scheduler.runTask(plugin, Runnable { callback(result) })
            }
        })
    }
}