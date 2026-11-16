package com.mvdef.plugin.rulet

import java.util.UUID

data class Duel(
    val id: String,
    val challenger: UUID,
    val challengerName: String,
    val target: UUID,
    val targetName: String,
    val stake: Int,
    var state: State = State.INVITED
) {
    enum class State { INVITED, ACTIVE, FINISHED }
}