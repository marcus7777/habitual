package com.habitual.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.habitual.app.ui.HabitViewModel
import com.habitual.app.ui.screens.HomeScreen
import com.habitual.app.ui.theme.HabitualTheme

class MainActivity : ComponentActivity() {

    private val viewModel: HabitViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HabitualTheme {
                HomeScreen(viewModel = viewModel)
            }
        }
    }
}
