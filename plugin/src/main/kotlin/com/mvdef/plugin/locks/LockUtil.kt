package com.mvdef.plugin.locks

import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer
import org.bukkit.Location
import org.bukkit.Material
import org.bukkit.block.Block
import org.bukkit.block.BlockFace
import org.bukkit.block.data.Bisected
import org.bukkit.inventory.ItemStack

enum class NotifyType {
    KNOCK,
    INTRUSION,
    NONE
}

object LockUtil {

    private val KEY_MATERIAL = Material.TRIPWIRE_HOOK

    fun isLockable(material: Material): Boolean {
        val name = material.name
        return name.endsWith("_DOOR") ||
                name.endsWith("_TRAPDOOR") ||
                name.endsWith("_FENCE_GATE") ||
                material == Material.CHEST ||
                material == Material.TRAPPED_CHEST ||
                material == Material.BARREL
    }

    /**
     * Двері складаються з двох блоків (верх/низ). Щоб замок завжди
     * прив'язувався до одного й того ж місця незалежно від того,
     * яку половину клікнув гравець — зводимо все до нижньої половини.
     */
    fun canonicalLocation(block: Block): Location {
        val data = block.blockData
        if (data is Bisected && data.half == Bisected.Half.TOP) {
            return block.getRelative(BlockFace.DOWN).location
        }
        return block.location
    }

    fun describeMaterial(material: Material): String {
        val name = material.name
        return when {
            name.endsWith("_DOOR") -> "двері"
            name.endsWith("_TRAPDOOR") -> "люк"
            name.endsWith("_FENCE_GATE") -> "хвіртку"
            material == Material.CHEST || material == Material.TRAPPED_CHEST -> "скриню"
            material == Material.BARREL -> "бочку"
            else -> "об'єкт"
        }
    }

    fun notifyType(material: Material): NotifyType {
        val name = material.name
        return when {
            name.endsWith("_DOOR") || name.endsWith("_TRAPDOOR") -> NotifyType.KNOCK
            material == Material.CHEST || material == Material.TRAPPED_CHEST || material == Material.BARREL -> NotifyType.INTRUSION
            else -> NotifyType.NONE
        }
    }

    fun isKeyMatching(item: ItemStack?, codeword: String): Boolean {
        if (item == null || item.type != KEY_MATERIAL) return false
        if (!item.hasItemMeta()) return false

        val meta = item.itemMeta ?: return false
        if (!meta.hasDisplayName()) return false

        val displayName = PlainTextComponentSerializer.plainText()
            .serialize(meta.displayName()!!)

        return displayName == codeword
    }
}