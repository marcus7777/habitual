package com.habitual.app.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class HabitWithLogs(
    val habit: HabitEntity,
    val logs: Map<String, HabitLogEntity>
)

class HabitRepository(private val habitDao: HabitDao) {

    val habitsWithLogs: Flow<List<HabitWithLogs>> = combine(
        habitDao.getAllHabits(),
        habitDao.getAllLogs()
    ) { habits, logs ->
        val logsGrouped = logs.groupBy { it.habitId }
            .mapValues { entry -> entry.value.associateBy { it.date } }

        habits.map { habit ->
            HabitWithLogs(
                habit = habit,
                logs = logsGrouped[habit.id] ?: emptyMap()
            )
        }
    }

    suspend fun saveHabit(habit: HabitEntity) {
        habitDao.insertOrUpdateHabit(habit.copy(updatedAt = System.currentTimeMillis()))
    }

    suspend fun deleteHabit(habitId: String) {
        habitDao.deleteHabitById(habitId)
    }

    suspend fun toggleCheckIn(habit: HabitEntity, dateStr: String, increment: Int = 1) {
        val existingLog = habitDao.getLogForDate(habit.id, dateStr)
        val currentCount = existingLog?.count ?: 0
        val currentNote = existingLog?.note ?: ""
        val newCount = currentCount + increment

        if (newCount <= 0 && currentNote.isEmpty()) {
            habitDao.deleteLog(habit.id, dateStr)
        } else {
            val logEntity = HabitLogEntity(
                id = "${habit.id}_$dateStr",
                habitId = habit.id,
                date = dateStr,
                count = newCount,
                note = currentNote
            )
            habitDao.insertOrUpdateLog(logEntity)
        }

        // Apply Parent Dependencies if applicable
        if (newCount > 0 && habit.parentId != null && habit.parentDependency != "none") {
            val parent = habitDao.getHabitHabitDirect(habit.parentId)
            if (parent != null) {
                val parentLog = habitDao.getLogForDate(parent.id, dateStr)
                val parentCount = parentLog?.count ?: 0
                val reqTarget = if (parent.type == "negative") 0 else parent.dailyTarget

                if (parent.type != "negative" && parentCount < reqTarget) {
                    if (habit.parentDependency == "requires_parent" || habit.parentDependency == "auto_log_parent") {
                        habitDao.insertOrUpdateLog(
                            HabitLogEntity(
                                id = "${parent.id}_$dateStr",
                                habitId = parent.id,
                                date = dateStr,
                                count = reqTarget,
                                note = parentLog?.note ?: ""
                            )
                        )
                    }
                }
            }
        }
    }

    suspend fun updateNote(habitId: String, dateStr: String, note: String) {
        val existingLog = habitDao.getLogForDate(habitId, dateStr)
        val currentCount = existingLog?.count ?: 0

        if (currentCount <= 0 && note.isBlank()) {
            habitDao.deleteLog(habitId, dateStr)
        } else {
            val logEntity = HabitLogEntity(
                id = "${habitId}_$dateStr",
                habitId = habitId,
                date = dateStr,
                count = currentCount,
                note = note
            )
            habitDao.insertOrUpdateLog(logEntity)
        }
    }

    suspend fun addBackfillLogs(habitId: String, logs: List<HabitLogEntity>) {
        habitDao.insertLogs(logs)
    }

    suspend fun importDataFromJson(jsonStr: String) {
        try {
            val payload = com.google.gson.Gson().fromJson(jsonStr, WebExportPayload::class.java)
            payload?.habits?.forEach { webHabit ->
                val habit = HabitEntity(
                    id = webHabit.id,
                    name = webHabit.name ?: webHabit.id,
                    type = webHabit.type ?: "positive",
                    description = webHabit.description ?: "",
                    category = webHabit.category ?: "General",
                    colorTheme = webHabit.colorTheme ?: "#39d353",
                    dailyTarget = webHabit.dailyTarget ?: 1,
                    frequencyType = webHabit.frequencyType ?: "daily"
                )
                habitDao.insertOrUpdateHabit(habit)
                
                webHabit.logs?.forEach { (dateStr, logData) ->
                    val count = logData.count ?: 0
                    val note = logData.note ?: ""
                    if (count > 0 || note.isNotEmpty()) {
                        habitDao.insertOrUpdateLog(
                            HabitLogEntity(
                                id = "${habit.id}_$dateStr",
                                habitId = habit.id,
                                date = dateStr,
                                count = count,
                                note = note
                            )
                        )
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private suspend fun HabitDao.getHabitHabitDirect(id: String): HabitEntity? {
        return getHabitById(id)
    }
}
