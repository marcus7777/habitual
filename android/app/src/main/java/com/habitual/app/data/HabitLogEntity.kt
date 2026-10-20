package com.habitual.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "habit_logs")
data class HabitLogEntity(
    @PrimaryKey
    val id: String, // Composite key: "${habitId}_${date}"
    val habitId: String,
    val date: String, // "YYYY-MM-DD"
    val count: Int = 0,
    val note: String = "",
    val unverified: Boolean = false,
    val isPauseEvent: Boolean = false,
    val eventType: String? = null // "pause", "resume"
)
