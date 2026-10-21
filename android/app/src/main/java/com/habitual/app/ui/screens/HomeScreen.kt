package com.habitual.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBackIosNew
import androidx.compose.material.icons.filled.ArrowForwardIos
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import java.io.InputStreamReader
import java.io.BufferedReader
import com.habitual.app.data.HabitEntity
import com.habitual.app.data.HabitLogEntity
import com.habitual.app.ui.HabitViewModel
import com.habitual.app.ui.components.DayDetailDialog
import com.habitual.app.ui.components.HabitCard
import com.habitual.app.ui.components.HabitFormDialog
import java.time.LocalDate

@Composable
fun HomeScreen(viewModel: HabitViewModel) {
    val habitsWithLogs by viewModel.habitsWithLogs.collectAsState()
    val selectedYear by viewModel.selectedYear.collectAsState()

    var showFormDialog by remember { mutableStateOf(false) }
    var habitToEdit by remember { mutableStateOf<HabitEntity?>(null) }

    var selectedDayDialogState by remember { mutableStateOf<Triple<HabitEntity, String, HabitLogEntity?>?>(null) }

    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            try {
                context.contentResolver.openInputStream(uri)?.use { inputStream ->
                    val reader = BufferedReader(InputStreamReader(inputStream))
                    val jsonStr = reader.readText()
                    viewModel.importDataFromJson(jsonStr)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0D1117))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Habitual",
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Heatmap Progression Visualizer",
                            color = Color(0xFF8B949E),
                            fontSize = 12.sp
                        )
                    }

                    // Year Navigator Control
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.TextButton(onClick = { launcher.launch("application/json") }) {
                            Text("Import JSON", color = Color(0xFF58A6FF), fontSize = 14.sp)
                        }
                        
                        IconButton(onClick = { viewModel.setSelectedYear(selectedYear - 1) }) {
                            Icon(
                                imageVector = Icons.Default.ArrowBackIosNew,
                                contentDescription = "Previous Year",
                                tint = Color(0xFF8B949E),
                                modifier = Modifier.height(16.dp)
                            )
                        }

                        Text(
                            text = selectedYear.toString(),
                            color = Color(0xFFF1E05A),
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )

                        IconButton(onClick = { viewModel.setSelectedYear(selectedYear + 1) }) {
                            Icon(
                                imageVector = Icons.Default.ArrowForwardIos,
                                contentDescription = "Next Year",
                                tint = Color(0xFF8B949E),
                                modifier = Modifier.height(16.dp)
                            )
                        }
                    }
                }
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    habitToEdit = null
                    showFormDialog = true
                },
                containerColor = Color(0xFF39D353),
                contentColor = Color.Black
            ) {
                Icon(imageVector = Icons.Default.Add, contentDescription = "Add Habit")
            }
        },
        containerColor = Color(0xFF0D1117)
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp)
        ) {
            if (habitsWithLogs.isEmpty()) {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "No Habits Tracked Yet",
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Tap + to create your first habit visualizer",
                        color = Color(0xFF8B949E),
                        fontSize = 14.sp
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(
                        items = habitsWithLogs,
                        key = { it.habit.id }
                    ) { item ->
                        HabitCard(
                            habitWithLogs = item,
                            selectedYear = selectedYear,
                            selectedDate = selectedDayDialogState?.second,
                            onQuickCheckIn = { viewModel.toggleCheckIn(item.habit) },
                            onDayClick = { dateStr ->
                                val log = item.logs[dateStr]
                                selectedDayDialogState = Triple(item.habit, dateStr, log)
                            },
                            onEditHabit = {
                                habitToEdit = item.habit
                                showFormDialog = true
                            }
                        )
                    }
                }
            }
        }

        // Habit Creation / Edit Dialog
        if (showFormDialog) {
            HabitFormDialog(
                initialHabit = habitToEdit,
                onDismiss = { showFormDialog = false },
                onSave = { habit -> viewModel.saveHabit(habit) },
                onDelete = { id -> viewModel.deleteHabit(id) }
            )
        }

        // Day Details & Notes Modal
        selectedDayDialogState?.let { (habit, dateStr, log) ->
            DayDetailDialog(
                habit = habit,
                dateStr = dateStr,
                log = log,
                onDismiss = { selectedDayDialogState = null },
                onLogToggle = { delta ->
                    viewModel.toggleCheckIn(habit, dateStr)
                },
                onSaveNote = { note ->
                    viewModel.saveNote(habit.id, dateStr, note)
                }
            )
        }
    }
}
