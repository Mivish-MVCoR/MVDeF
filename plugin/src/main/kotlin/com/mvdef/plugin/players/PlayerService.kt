package com.mvdef.plugin.players

import org.bukkit.Bukkit
import org.bukkit.OfflinePlayer
import org.bukkit.entity.Player
import org.bukkit.plugin.java.JavaPlugin
import java.io.File
import java.nio.file.Files
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

data class PlayerEntry(
    val uuid: UUID,
    val name: String,
    val lastPlayed: Long,
    val whitelisted: Boolean,
    val banned: Boolean
)

class PlayerService(private val plugin: JavaPlugin) {

    private val trashRoot = File(plugin.dataFolder, "trash")
    private val logFile = File(plugin.dataFolder, "removed-players.log")
    private val logTimeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    /** Усі, хто заходив + ті, хто лише в білому списку + забанені. */
    fun listAll(): List<PlayerEntry> {
        val players = LinkedHashMap<UUID, OfflinePlayer>()
        for (p in Bukkit.getOfflinePlayers()) players[p.uniqueId] = p
        for (p in Bukkit.getWhitelistedPlayers()) players.putIfAbsent(p.uniqueId, p)
        for (p in Bukkit.getBannedPlayers()) players.putIfAbsent(p.uniqueId, p)

        return players.values
            .map {
                PlayerEntry(
                    uuid = it.uniqueId,
                    name = it.name ?: it.uniqueId.toString(),
                    lastPlayed = it.lastLogin,
                    whitelisted = it.isWhitelisted,
                    banned = it.isBanned
                )
            }
            .sortedBy { it.name.lowercase() }
    }

    fun findByName(name: String): PlayerEntry? =
        listAll().firstOrNull { it.name.equals(name, ignoreCase = true) }

    /**
     * Переносить файли гравця в plugins/MVDeF/trash/<UUID>/ і знімає його з білого списку.
     * Бан не чіпає.
     * @return список файлів, які були перенесені
     */
    fun removeToTrash(entry: PlayerEntry, admin: Player): List<String> {
        val worldFolder = Bukkit.getWorlds().first().worldFolder
        val trashDir = File(trashRoot, entry.uuid.toString())

        val candidates = listOf(
            "playerdata/${entry.uuid}.dat",
            "playerdata/${entry.uuid}.dat_old",
            "stats/${entry.uuid}.json",
            "advancements/${entry.uuid}.json"
        )

        val moved = mutableListOf<String>()
        for (relative in candidates) {
            val source = File(worldFolder, relative)
            if (!source.exists()) continue

            val target = uniqueTarget(File(trashDir, relative))
            target.parentFile.mkdirs()
            Files.move(source.toPath(), target.toPath())
            moved.add(relative)
        }

        val offline = Bukkit.getOfflinePlayer(entry.uuid)
        if (offline.isWhitelisted) offline.isWhitelisted = false

        writeLog(admin, entry, moved)
        return moved
    }

    /** Нічого в trash не перезаписуємо: якщо файл уже є, додаємо мітку часу. */
    private fun uniqueTarget(target: File): File {
        if (!target.exists()) return target
        return File(target.parentFile, "${target.name}.${System.currentTimeMillis()}")
    }

    private fun writeLog(admin: Player, entry: PlayerEntry, moved: List<String>) {
        val files = if (moved.isEmpty()) "нічого" else moved.joinToString(", ")
        val line = "[${LocalDateTime.now().format(logTimeFormat)}] " +
                "${admin.name} (${admin.uniqueId}) -> ${entry.name} (${entry.uuid}); перенесено: $files"

        plugin.logger.info(line)
        plugin.dataFolder.mkdirs()
        logFile.appendText(line + System.lineSeparator(), Charsets.UTF_8)
    }
}