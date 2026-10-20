package com.habitual.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "habits")
data class HabitEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val type: String = "positive", // "positive" (build) or "negative" (quit)
    val description: String = "",
    val category: String = "General",
    val colorTheme: String = "#39d353", // HEX string
    val dailyTarget: Int = 1,
    val frequencyType: String = "daily", // "daily", "weekly", "monthly", "specific_days"
    val targetDays: List<Int> = listOf(1, 2, 3, 4, 5, 6, 0), // 0=Sunday, 1=Monday...
    val weeklyTarget: Int = 1,
    val monthlyDay: String = "1",
    val monthlyTarget: Int = 1,
    val parentId: String? = null,
    val parentDependency: String = "none", // "none", "requires_parent", "auto_log_parent", "auto_complete_from_parent", "parent_days_only"
    val showStreak: Boolean = true,
    val showCount: Boolean = true,
    val showDuration: Boolean = true,
    val hideFromAll: Boolean = false,
    val isPaused: Boolean = false,
    val hideHeatmapWhenPaused: Boolean = false,
    val createdAt: String = "", // "YYYY-MM-DD"
    val updatedAt: Long = System.currentTimeMillis()
)
