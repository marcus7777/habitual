package com.habitual.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.habitual.app.core.ColorUtils
import com.habitual.app.data.HabitEntity
import com.habitual.app.data.HabitLogEntity
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun HeatmapCanvas(
    habit: HabitEntity,
    logs: Map<String, HabitLogEntity>,
    year: Int,
    selectedDate: String?,
    onDayClick: (String) -> Unit
) {
    val textMeasurer = rememberTextMeasurer()
    val scrollState = rememberScrollState()

    val cellSize = 12.dp
    val cellGap = 3.dp
    val labelWidth = 24.dp
    val topLabelHeight = 20.dp

    val jan1 = LocalDate.of(year, 1, 1)
    val dec31 = LocalDate.of(year, 12, 31)

    // Calculate total weeks for the matrix layout
    val startDayOfWeek = (jan1.dayOfWeek.value % 7) // 0 = Sunday, 1 = Monday...
    var current = jan1
    val dayMap = mutableMapOf<Pair<Int, Int>, LocalDate>() // (weekIndex, dayIndex) -> LocalDate

    var currentWeek = 0
    while (!current.isAfter(dec31)) {
        val dayOfWeekIndex = current.dayOfWeek.value % 7
        dayMap[Pair(currentWeek, dayOfWeekIndex)] = current

        if (dayOfWeekIndex == 6) {
            currentWeek++
        }
        current = current.plusDays(1)
    }
    val totalWeeks = (currentWeek + 1).coerceAtLeast(52)

    val canvasWidth = labelWidth + (cellSize + cellGap) * totalWeeks + 16.dp
    val canvasHeight = topLabelHeight + (cellSize + cellGap) * 7 + 8.dp

    val dateFormatter = DateTimeFormatter.ISO_LOCAL_DATE

    Box(modifier = Modifier.horizontalScroll(scrollState)) {
        Canvas(
            modifier = Modifier
                .width(canvasWidth)
                .height(canvasHeight)
                .pointerInput(year, habit.id) {
                    detectTapGestures { offset ->
                        val x = offset.x
                        val y = offset.y

                        val cellGapPx = cellGap.toPx()
                        val cellSizePx = cellSize.toPx()
                        val labelWidthPx = labelWidth.toPx()
                        val topLabelHeightPx = topLabelHeight.toPx()

                        val weekIdx = ((x - labelWidthPx) / (cellSizePx + cellGapPx)).toInt()
                        val dayIdx = ((y - topLabelHeightPx) / (cellSizePx + cellGapPx)).toInt()

                        if (weekIdx in 0..totalWeeks && dayIdx in 0..6) {
                            val date = dayMap[Pair(weekIdx, dayIdx)]
                            if (date != null) {
                                onDayClick(date.format(dateFormatter))
                            }
                        }
                    }
                }
        ) {
            val cellGapPx = cellGap.toPx()
            val cellSizePx = cellSize.toPx()
            val labelWidthPx = labelWidth.toPx()
            val topLabelHeightPx = topLabelHeight.toPx()

            // Draw month header labels
            var month = 1
            for (w in 0 until totalWeeks) {
                val sampleDate = dayMap[Pair(w, 0)] ?: dayMap[Pair(w, 1)]
                if (sampleDate != null && sampleDate.monthValue == month) {
                    val monthName = sampleDate.month.name.take(3)
                    drawText(
                        textMeasurer = textMeasurer,
                        text = monthName,
                        style = TextStyle(color = Color(0xFF8B949E), fontSize = 9.sp),
                        topLeft = Offset(labelWidthPx + w * (cellSizePx + cellGapPx), 0f)
                    )
                    month++
                }
            }

            // Draw heatmap cells
            for (w in 0 until totalWeeks) {
                for (d in 0 until 7) {
                    val date = dayMap[Pair(w, d)]
                    val left = labelWidthPx + w * (cellSizePx + cellGapPx)
                    val top = topLabelHeightPx + d * (cellSizePx + cellGapPx)

                    if (date != null) {
                        val dateStr = date.format(dateFormatter)
                        val log = logs[dateStr]
                        val count = log?.count ?: 0
                        val hasNote = !log?.note.isNullOrBlank()

                        val isSelected = dateStr == selectedDate

                        // Calculate cell color and shading ratio
                        val ratio = if (habit.type == "negative") {
                            if (count > 0) 0f else 1f
                        } else {
                            if (count > 0) (count.toFloat() / habit.dailyTarget.coerceAtLeast(1)).coerceAtMost(1f) else 0f
                        }

                        val cellColor = if (habit.type == "negative" && count > 0) {
                            Color(0xFFDA3633) // Warning red for relapse
                        } else if (ratio > 0f) {
                            ColorUtils.getColorWithRatio(habit.colorTheme, ratio)
                        } else {
                            Color(0xFF161B22) // Base dark cell background
                        }

                        // Draw cell rectangle
                        drawRoundRect(
                            color = cellColor,
                            topLeft = Offset(left, top),
                            size = Size(cellSizePx, cellSizePx),
                            cornerRadius = CornerRadius(2.dp.toPx(), 2.dp.toPx())
                        )

                        // Draw subtle cell border
                        drawRoundRect(
                            color = if (isSelected) Color(0xFFF1E05A) else Color(0xFF21262D),
                            topLeft = Offset(left, top),
                            size = Size(cellSizePx, cellSizePx),
                            cornerRadius = CornerRadius(2.dp.toPx(), 2.dp.toPx()),
                            style = Stroke(width = if (isSelected) 2.dp.toPx() else 1.dp.toPx())
                        )

                        // Draw cut-off top right corner indicator if note exists
                        if (hasNote) {
                            val noteTriangle = Path().apply {
                                moveTo(left + cellSizePx - 4.dp.toPx(), top)
                                lineTo(left + cellSizePx, top)
                                lineTo(left + cellSizePx, top + 4.dp.toPx())
                                close()
                            }
                            drawPath(noteTriangle, Color(0xFFF1E05A))
                        }
                    }
                }
            }
        }
    }
}
