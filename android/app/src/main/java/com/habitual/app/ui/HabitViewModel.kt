package com.habitual.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.habitual.app.data.HabitEntity
import com.habitual.app.data.HabitRepository
import com.habitual.app.data.HabitWithLogs
import com.habitual.app.data.HabitualDatabase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class HabitViewModel(application: Application) : AndroidViewModel(application) {

    private val repository: HabitRepository

    private val _selectedYear = MutableStateFlow(LocalDate.now().year)
    val selectedYear: StateFlow<Int> = _selectedYear.asStateFlow()

    private val _selectedHabitFilter = MutableStateFlow("all")
    val selectedHabitFilter: StateFlow<String> = _selectedHabitFilter.asStateFlow()

    val habitsWithLogs: StateFlow<List<HabitWithLogs>>

    init {
        val database = HabitualDatabase.getDatabase(application)
        repository = HabitRepository(database.habitDao())

        habitsWithLogs = combine(
            repository.habitsWithLogs,
            _selectedHabitFilter
        ) { list, filter ->
            if (filter == "all") list else list.filter { it.habit.id == filter }
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )
    }

    fun setSelectedYear(year: Int) {
        _selectedYear.value = year
    }

    fun setHabitFilter(filterId: String) {
        _selectedHabitFilter.value = filterId
    }

    fun toggleCheckIn(habit: HabitEntity, dateStr: String = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)) {
        viewModelScope.launch {
            repository.toggleCheckIn(habit, dateStr)
        }
    }

    fun saveNote(habitId: String, dateStr: String, note: String) {
        viewModelScope.launch {
            repository.updateNote(habitId, dateStr, note)
        }
    }

    fun saveHabit(habit: HabitEntity) {
        viewModelScope.launch {
            repository.saveHabit(habit)
        }
    }

    fun deleteHabit(habitId: String) {
        viewModelScope.launch {
            repository.deleteHabit(habitId)
        }
    }
}
