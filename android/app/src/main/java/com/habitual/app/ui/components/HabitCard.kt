package com.habitual.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.habitual.app.core.ColorUtils
import com.habitual.app.core.StreakCalculator
import com.habitual.app.data.HabitWithLogs
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun HabitCard(
    habitWithLogs: HabitWithLogs,
    selectedYear: Int,
    selectedDate: String?,
    onQuickCheckIn: () -> Unit,
    onDayClick: (String) -> Unit,
    onEditHabit: () -> Unit
) {
    val habit = habitWithLogs.habit
    val logs = habitWithLogs.logs
    val todayStr = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)

    val streakResult = StreakCalculator.calculateStreak(habit, logs)
    val totalYearCount = StreakCalculator.calculateTotalCountForYear(habit, logs, selectedYear)
    val todayLog = logs[todayStr]
    val todayCount = todayLog?.count ?: 0
    val isDoneToday = if (habit.type == "negative") todayCount == 0 else todayCount >= habit.dailyTarget

    val themeColor = ColorUtils.parseHexColor(habit.colorTheme)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .border(1.dp, Color(0xFF30363D), RoundedCornerShape(12.dp)),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Header Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .background(themeColor)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = habit.name,
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        if (habit.description.isNotBlank()) {
                            Text(
                                text = habit.description,
                                color = Color(0xFF8B949E),
                                fontSize = 12.sp
                            )
                        }
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Streak Badge
                    if (habit.showStreak && streakResult.currentStreak > 0) {
                        Text(
                            text = "🔥 ${streakResult.currentStreak}",
                            color = Color(0xFFF1E05A),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                    }

                    // Total Count Badge
                    Text(
                        text = "$totalYearCount in $selectedYear",
                        color = Color(0xFF8B949E),
                        fontSize = 12.sp,
                        modifier = Modifier.padding(end = 8.dp)
                    )

                    // Edit Button
                    IconButton(
                        onClick = onEditHabit,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Edit,
                            contentDescription = "Edit Habit",
                            tint = Color(0xFF8B949E),
                            modifier = Modifier.size(16.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(4.dp))

                    // Quick Check-in Button
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(if (isDoneToday) themeColor else Color(0xFF21262D))
                            .clickable { onQuickCheckIn() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isDoneToday) Icons.Default.Check else Icons.Default.Add,
                            contentDescription = "Quick Log",
                            tint = if (isDoneToday) Color.Black else Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // 7x52 Heatmap Grid Canvas
            HeatmapCanvas(
                habit = habit,
                logs = logs,
                year = selectedYear,
                selectedDate = selectedDate,
                onDayClick = onDayClick
            )
        }
    }
}
