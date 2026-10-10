package com.mvdef.plugin.empire

import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import org.bukkit.plugin.java.JavaPlugin
import java.util.concurrent.ConcurrentHashMap

class EmpireRepository(
    private val plugin: JavaPlugin,
    private val database: FirebaseDatabase
) {

    private val chunkCache = ConcurrentHashMap<String, ChunkData>()
    private val empireCache = ConcurrentHashMap<String, EmpireData>()

    fun initialize() {
        listenToChunks()
        listenToEmpires()
    }

    fun getChunkEmpire(world: String, x: Int, z: Int): EmpireData? {
        val key = "${world}_${x}_${z}"
        val chunk = chunkCache[key] ?: return null
        if (chunk.status != "active") return null
        return empireCache[chunk.empireId]
    }

    fun getEmpireByOwner(ownerUuid: String): EmpireData? =
        empireCache.values.firstOrNull { it.ownerUuid == ownerUuid }

    fun getAllEmpires(): List<EmpireData> = empireCache.values.toList()

    private fun listenToChunks() {
        database.getReference("mvdef/chunks")
            .addValueEventListener(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    chunkCache.clear()
                    plugin.logger.info("DEBUG chunks: ${snapshot.childrenCount} записів")
                    for (child in snapshot.children) {
                        plugin.logger.info("DEBUG chunk key: ${child.key}")
                        val key = child.key ?: continue
                        val empireId = child.child("empireId").getValue(String::class.java) ?: continue
                        plugin.logger.info("DEBUG empireId: '$empireId', status: '${child.child("status").getValue(String::class.java)}'")
                        val status = child.child("status").getValue(String::class.java) ?: continue
                        val parts = key.split("_")
                        if (parts.size < 3) continue
                        val z = parts.last().toIntOrNull() ?: continue
                        val x = parts[parts.size - 2].toIntOrNull() ?: continue
                        val world = parts.dropLast(2).joinToString("_")
                        chunkCache[key] = ChunkData(world, x, z, empireId, status)
                    }
                    plugin.logger.info("Кеш чанків оновлено: ${chunkCache.size} чанків")
                }

                override fun onCancelled(error: DatabaseError) {
                    plugin.logger.severe("Помилка читання чанків: ${error.message}")
                }
            })
    }

    private fun listenToEmpires() {
        database.getReference("mvdef/empires")
            .addValueEventListener(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    empireCache.clear()
                    for (child in snapshot.children) {
                        val id = child.key ?: continue
                        val name = child.child("name").getValue(String::class.java) ?: continue
                        val ownerUuid = child.child("ownerUuid").getValue(String::class.java) ?: continue
                        val ownerName = child.child("ownerName").getValue(String::class.java) ?: continue
                        val createdAt = child.child("createdAt").getValue(Long::class.java) ?: 0L
                        empireCache[id] = EmpireData(id, name, ownerUuid, ownerName, createdAt)
                    }
                    plugin.logger.info("Кеш імперій оновлено: ${empireCache.size} імперій")
                }

                override fun onCancelled(error: DatabaseError) {
                    plugin.logger.severe("Помилка читання імперій: ${error.message}")
                }
            })
    }
}