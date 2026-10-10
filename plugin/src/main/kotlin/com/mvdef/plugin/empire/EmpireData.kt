package com.mvdef.plugin.empire

data class EmpireData(
    val id: String,
    val name: String,
    val ownerUuid: String,
    val ownerName: String,
    val createdAt: Long
)

data class ChunkData(
    val world: String,
    val x: Int,
    val z: Int,
    val empireId: String,
    val status: String // "active", "pending", "neutral"
)