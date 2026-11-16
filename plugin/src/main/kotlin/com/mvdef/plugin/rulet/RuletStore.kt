package com.mvdef.plugin.rulet

import com.mvdef.plugin.MVDeFPlugin
import org.bukkit.configuration.file.YamlConfiguration
import java.io.File
import java.util.UUID

class RuletStore(private val plugin: MVDeFPlugin) {

    data class Escrow(val duelId: String, val a: UUID, val b: UUID, val stake: Int)

    private val file = File(plugin.dataFolder, "rulet-data.yml")
    private val yaml = YamlConfiguration()

    init {
        if (file.exists()) yaml.load(file)
    }

    private fun save() {
        plugin.dataFolder.mkdirs()
        yaml.save(file)
    }

    var lastEventId: Long
        get() = yaml.getLong("lastEventId", 0L)
        set(value) {
            yaml.set("lastEventId", value)
            save()
        }

    // --- Ставки, які зараз "в банку" ---

    fun putEscrow(e: Escrow) {
        val p = "escrow.${e.duelId}"
        yaml.set("$p.a", e.a.toString())
        yaml.set("$p.b", e.b.toString())
        yaml.set("$p.stake", e.stake)
        save()
    }

    fun getEscrow(id: String): Escrow? {
        val s = yaml.getConfigurationSection("escrow.$id") ?: return null
        val a = s.getString("a") ?: return null
        val b = s.getString("b") ?: return null
        return Escrow(id, UUID.fromString(a), UUID.fromString(b), s.getInt("stake"))
    }

    fun allEscrows(): List<Escrow> =
        yaml.getConfigurationSection("escrow")?.getKeys(false)?.mapNotNull { getEscrow(it) }
            ?: emptyList()

    fun removeEscrow(id: String) {
        yaml.set("escrow.$id", null)
        save()
    }

    // --- Відкладене для офлайн-гравців ---

    fun addPendingItems(uuid: UUID, amount: Int) {
        val path = "pending.$uuid.items"
        yaml.set(path, yaml.getInt(path, 0) + amount)
        save()
    }

    fun takePendingItems(uuid: UUID): Int {
        val path = "pending.$uuid.items"
        val n = yaml.getInt(path, 0)
        if (n > 0) {
            yaml.set(path, null)
            save()
        }
        return n
    }

    fun setPendingTrick(uuid: UUID) {
        yaml.set("pending.$uuid.trick", true)
        save()
    }

    fun takePendingTrick(uuid: UUID): Boolean {
        val path = "pending.$uuid.trick"
        val value = yaml.getBoolean(path, false)
        if (value) {
            yaml.set(path, null)
            save()
        }
        return value
    }
}