package com.habitual.app.core

import com.habitual.app.data.HabitEntity
import com.habitual.app.data.HabitLogEntity
import java.time.LocalDate
import java.time.format.DateTimeFormatter

object StreakCalculator {

    private val DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE

    data class StreakResult(
        val currentStreak: Int,
        val longestStreak: Int = 0,
        val isWeekly: Boolean = false,
        val isMonthly: Boolean = false
    )

    fun calculateStreak(
        habit: HabitEntity,
        logs: Map<String, HabitLogEntity>,
        today: LocalDate = LocalDate.now()
    ): StreakResult {
        if (habit.type == "negative") {
            var currentStreak = 0
            var checkDate = today
            val createdAt = try {
                if (habit.createdAt.isNotBlank()) LocalDate.parse(habit.createdAt, DATE_FORMATTER) else LocalDate.of(2020, 1, 1)
            } catch (e: Exception) {
                LocalDate.of(2020, 1, 1)
            }

            var safety = 0
            while (safety < 3650) {
                val dateStr = checkDate.format(DATE_FORMATTER)
                if (dateStr < habit.createdAt && currentStreak > 0) break

                val log = logs[dateStr]
                if (log == null || log.count == 0) {
                    currentStreak++
                    checkDate = checkDate.minusDays(1)
                    safety++
                } else {
                    break
                }
            }
            return StreakResult(currentStreak)
        }

        // Positive habit daily streak calculation
        var currentStreak = 0
        var checkDate = today
        val todayStr = today.format(DATE_FORMATTER)

        val todayLog = logs[todayStr]
        val todayCount = todayLog?.count ?: 0
        val dailyTarget = habit.dailyTarget.coerceAtLeast(1)

        if (todayCount < dailyTarget) {
            checkDate = today.minusDays(1)
        }

        var safety = 0
        while (safety < 3650) {
            val dateStr = checkDate.format(DATE_FORMATTER)
            val log = logs[dateStr]
            val count = log?.count ?: 0

            if (count >= dailyTarget) {
                currentStreak++
                checkDate = checkDate.minusDays(1)
                safety++
            } else {
                break
            }
        }

        return StreakResult(currentStreak)
    }

    fun calculateTotalCountForYear(
        habit: HabitEntity,
        logs: Map<String, HabitLogEntity>,
        year: Int
    ): Int {
        val yearPrefix = "$year-"
        return if (habit.type == "negative") {
            var cleanDays = 0
            var d = LocalDate.of(year, 1, 1)
            val end = if (year == LocalDate.now().year) LocalDate.now() else LocalDate.of(year, 12, 31)

            while (!d.isAfter(end)) {
                val dateStr = d.format(DATE_FORMATTER)
                val log = logs[dateStr]
                if (log == null || log.count == 0) {
                    cleanDays++
                }
                d = d.plusDays(1)
            }
            cleanDays
        } else {
            logs.filterKeys { it.startsWith(yearPrefix) }
                .values
                .sumOf { it.count }
        }
    }
}
