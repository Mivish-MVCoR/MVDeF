package com.mvdef.plugin.locks

import org.bukkit.Location
import org.bukkit.configuration.file.YamlConfiguration
import org.bukkit.plugin.java.JavaPlugin
import java.io.File
import java.util.UUID

data class LockData(val codeword: String, val ownerUuid: UUID)

/**
 * Зберігає та керує замками на конкретних блоках (двері, скрині, хвіртки, бочки).
 * Кожен замкнений блок прив'язаний до кодового слова і UUID власника (для сповіщень).
 */
class LockService(private val plugin: JavaPlugin) {

    private val locksFile = File(plugin.dataFolder, "locks.yml")
    private val locks = mutableMapOf<String, LockData>() // locationKey -> LockData

    init {
        load()
    }

    fun isLocked(location: Location): Boolean =
        locks.containsKey(locationKey(location))

    fun getLock(location: Location): LockData? =
        locks[locationKey(location)]

    fun lock(location: Location, codeword: String, owner: UUID) {
        locks[locationKey(location)] = LockData(codeword, owner)
        save()
    }

    /**
     * Знімає замок тільки якщо кодове слово співпадає.
     * @return true якщо розблоковано успішно
     */
    fun unlockIfMatches(location: Location, codeword: String): Boolean {
        val key = locationKey(location)
        val current = locks[key] ?: return false
        if (current.codeword != codeword) return false

        locks.remove(key)
        save()
        return true
    }

    /** Примусово знімає замок без перевірки коду (напр. після вибуху). */
    fun forceUnlock(location: Location) {
        locks.remove(locationKey(location))
        save()
    }

    private fun locationKey(location: Location): String {
        val world = location.world?.name ?: "unknown"
        return "$world;${location.blockX};${location.blockY};${location.blockZ}"
    }

    private fun load() {
        if (!locksFile.exists()) return

        val config = YamlConfiguration.loadConfiguration(locksFile)
        val section = config.getConfigurationSection("locks") ?: return

        for (key in section.getKeys(false)) {
            val codeword = section.getString("$key.codeword") ?: continue
            val ownerString = section.getString("$key.owner") ?: continue
            val owner = try {
                UUID.fromString(ownerString)
            } catch (e: IllegalArgumentException) {
                continue
            }
            locks[key] = LockData(codeword, owner)
        }
    }

    private fun save() {
        if (!plugin.dataFolder.exists()) {
            plugin.dataFolder.mkdirs()
        }

        val config = YamlConfiguration()
        for ((key, data) in locks) {
            config.set("locks.$key.codeword", data.codeword)
            config.set("locks.$key.owner", data.ownerUuid.toString())
        }
        config.save(locksFile)
    }
}