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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.habitual.app.core.ColorUtils
import com.habitual.app.data.HabitEntity
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun HabitFormDialog(
    initialHabit: HabitEntity? = null,
    onDismiss: () -> Unit,
    onSave: (HabitEntity) -> Unit,
    onDelete: ((String) -> Unit)? = null
) {
    var name by remember { mutableStateOf(initialHabit?.name ?: "") }
    var description by remember { mutableStateOf(initialHabit?.description ?: "") }
    var habitType by remember { mutableStateOf(initialHabit?.type ?: "positive") }
    var colorTheme by remember { mutableStateOf(initialHabit?.colorTheme ?: "#39d353") }
    var dailyTarget by remember { mutableStateOf((initialHabit?.dailyTarget ?: 1).toString()) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF161B22)),
            modifier = Modifier.padding(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    text = if (initialHabit == null) "New Habit" else "Edit Habit",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Habit Name", color = Color(0xFF8B949E)) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color(0xFF39D353),
                        unfocusedBorderColor = Color(0xFF30363D)
                    )
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description (Optional)", color = Color(0xFF8B949E)) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color(0xFF39D353),
                        unfocusedBorderColor = Color(0xFF30363D)
                    )
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Habit Type Selection (Build vs Quit)
                Text("Habit Goal Type", color = Color(0xFF8B949E), fontSize = 13.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = habitType == "positive",
                        onClick = { habitType = "positive" },
                        colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF39D353))
                    )
                    Text("Build Habit (Positive)", color = Color.White, fontSize = 14.sp)

                    Spacer(modifier = Modifier.width(12.dp))

                    RadioButton(
                        selected = habitType == "negative",
                        onClick = { habitType = "negative" },
                        colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFDA3633))
                    )
                    Text("Quit Goal (Negative)", color = Color.White, fontSize = 14.sp)
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Daily Target
                if (habitType == "positive") {
                    OutlinedTextField(
                        value = dailyTarget,
                        onValueChange = { dailyTarget = it },
                        label = { Text("Daily Completion Target", color = Color(0xFF8B949E)) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = Color(0xFF39D353),
                            unfocusedBorderColor = Color(0xFF30363D)
                        )
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Color Palette Picker
                Text("Color Theme", color = Color(0xFF8B949E), fontSize = 13.sp)
                Spacer(modifier = Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(ColorUtils.GOOGLE_CALENDAR_PALETTE) { hex ->
                        val parsedColor = ColorUtils.parseHexColor(hex)
                        val isSelected = colorTheme.equals(hex, ignoreCase = true)

                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(parsedColor)
                                .border(
                                    width = if (isSelected) 3.dp else 0.dp,
                                    color = if (isSelected) Color.White else Color.Transparent,
                                    shape = CircleShape
                                )
                                .clickable { colorTheme = hex }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (initialHabit != null && onDelete != null) {
                        TextButton(
                            onClick = {
                                onDelete(initialHabit.id)
                                onDismiss()
                            }
                        ) {
                            Text("Delete", color = Color(0xFFDA3633))
                        }
                    } else {
                        Spacer(modifier = Modifier.width(1.dp))
                    }

                    Row {
                        TextButton(onClick = onDismiss) {
                            Text("Cancel", color = Color(0xFF8B949E))
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                if (name.isNotBlank()) {
                                    val targetInt = dailyTarget.toIntOrNull()?.coerceAtLeast(1) ?: 1
                                    val newHabit = HabitEntity(
                                        id = initialHabit?.id ?: "habit_${System.currentTimeMillis()}",
                                        name = name.trim(),
                                        description = description.trim(),
                                        type = habitType,
                                        colorTheme = colorTheme,
                                        dailyTarget = targetInt,
                                        createdAt = initialHabit?.createdAt ?: LocalDate.now().format(
                                            DateTimeFormatter.ISO_LOCAL_DATE)
                                    )
                                    onSave(newHabit)
                                    onDismiss()
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF39D353))
                        ) {
                            Text("Save", color = Color.Black, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
