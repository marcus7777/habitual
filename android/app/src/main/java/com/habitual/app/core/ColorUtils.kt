package com.habitual.app.core

import androidx.compose.ui.graphics.Color
import kotlin.math.roundToInt

object ColorUtils {

    val GOOGLE_CALENDAR_PALETTE = listOf(
        "#795548", "#E67C73", "#D50000", "#F4511E",
        "#EF6C00", "#F09300", "#009688", "#0B8043",
        "#7CB342", "#33B679", "#039BE5", "#4285F4",
        "#3F51B5", "#7986CB", "#B388FF", "#8E24AA",
        "#E67C73", "#616161", "#a4b0be", "#f1e05a"
    )

    fun parseHexColor(hexStr: String): Color {
        val cleanHex = hexStr.trim().removePrefix("#")
        return try {
            when (cleanHex.length) {
                3 -> {
                    val r = cleanHex[0].toString().repeat(2).toInt(16)
                    val g = cleanHex[1].toString().repeat(2).toInt(16)
                    val b = cleanHex[2].toString().repeat(2).toInt(16)
                    Color(r, g, b)
                }
                6 -> {
                    val r = cleanHex.substring(0, 2).toInt(16)
                    val g = cleanHex.substring(2, 4).toInt(16)
                    val b = cleanHex.substring(4, 6).toInt(16)
                    Color(r, g, b)
                }
                8 -> {
                    val r = cleanHex.substring(0, 2).toInt(16)
                    val g = cleanHex.substring(2, 4).toInt(16)
                    val b = cleanHex.substring(4, 6).toInt(16)
                    val a = cleanHex.substring(6, 8).toInt(16)
                    Color(r, g, b, a)
                }
                else -> Color(0xFF39D353)
            }
        } catch (e: Exception) {
            Color(0xFF39D353)
        }
    }

    fun getColorWithRatio(baseColorHex: String, ratio: Float): Color {
        val baseColor = parseHexColor(baseColorHex)
        if (ratio <= 0f) return Color(0x00000000)

        val minAlpha = 0.13f // ~34 in 255 alpha floor
        val alpha = minAlpha + (ratio.coerceIn(0f, 1f) * (1f - minAlpha))
        return baseColor.copy(alpha = alpha)
    }

    fun getDefaultColorForId(id: String): String {
        val hash = id.fold(0) { acc, c -> acc + c.code }
        val index = (hash % GOOGLE_CALENDAR_PALETTE.size + GOOGLE_CALENDAR_PALETTE.size) % GOOGLE_CALENDAR_PALETTE.size
        return GOOGLE_CALENDAR_PALETTE[index]
    }
}
