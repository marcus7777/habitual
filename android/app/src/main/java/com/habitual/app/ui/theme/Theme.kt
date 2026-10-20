package com.habitual.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val DarkBackgroundColor = Color(0xFF0D1117)
val CardBackgroundColor = Color(0xFF161B22)
val CardBorderColor = Color(0xFF30363D)
val PrimaryGreen = Color(0xFF39D353)
val AccentGold = Color(0xFFF1E05A)
val CellBorderColor = Color(0xFF21262D)

private val HabitualColorScheme = darkColorScheme(
    primary = PrimaryGreen,
    secondary = AccentGold,
    background = DarkBackgroundColor,
    surface = CardBackgroundColor,
    onBackground = Color.White,
    onSurface = Color.White
)

@Composable
fun HabitualTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = HabitualColorScheme,
        content = content
    )
}
