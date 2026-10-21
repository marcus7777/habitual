package com.habitual.app.data

data class WebExportPayload(
    val version: Int,
    val habits: List<WebHabitExport>?
)

data class WebHabitExport(
    val id: String,
    val name: String?,
    val type: String?,
    val description: String?,
    val category: String?,
    val colorTheme: String?,
    val dailyTarget: Int?,
    val frequencyType: String?,
    val logs: Map<String, WebHabitLogExport>?
)

data class WebHabitLogExport(
    val count: Int?,
    val note: String?
)
