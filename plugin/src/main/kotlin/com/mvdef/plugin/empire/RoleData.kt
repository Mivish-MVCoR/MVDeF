package com.mvdef.plugin.empire

data class RoleData(
    val id: String,
    val name: String,
    val builtIn: Boolean,
    val permissions: Map<String, Boolean>
) {
    fun can(permission: String): Boolean = permissions[permission] == true
}

val DEFAULT_PASSERBY = RoleData(
    id = "passerby",
    name = "Прохожий",
    builtIn = true,
    permissions = mapOf("fightMobs" to true)
)