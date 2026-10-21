package com.habitual.app.`data`

import androidx.room.InvalidationTracker
import androidx.room.RoomOpenDelegate
import androidx.room.migration.AutoMigrationSpec
import androidx.room.migration.Migration
import androidx.room.util.TableInfo
import androidx.room.util.TableInfo.Companion.read
import androidx.room.util.dropFtsSyncTriggers
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL
import javax.`annotation`.processing.Generated
import kotlin.Lazy
import kotlin.String
import kotlin.Suppress
import kotlin.collections.List
import kotlin.collections.Map
import kotlin.collections.MutableList
import kotlin.collections.MutableMap
import kotlin.collections.MutableSet
import kotlin.collections.Set
import kotlin.collections.mutableListOf
import kotlin.collections.mutableMapOf
import kotlin.collections.mutableSetOf
import kotlin.reflect.KClass

@Generated(value = ["androidx.room.RoomProcessor"])
@Suppress(names = ["UNCHECKED_CAST", "DEPRECATION", "REDUNDANT_PROJECTION", "REMOVAL"])
public class HabitualDatabase_Impl : HabitualDatabase() {
  private val _habitDao: Lazy<HabitDao> = lazy {
    HabitDao_Impl(this)
  }

  protected override fun createOpenDelegate(): RoomOpenDelegate {
    val _openDelegate: RoomOpenDelegate = object : RoomOpenDelegate(1, "d103b8dda8867fec275e6224fbdecfc4", "b1025e9671be28f5fcdfeae8100d5cac") {
      public override fun createAllTables(connection: SQLiteConnection) {
        connection.execSQL("CREATE TABLE IF NOT EXISTS `habits` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `type` TEXT NOT NULL, `description` TEXT NOT NULL, `category` TEXT NOT NULL, `colorTheme` TEXT NOT NULL, `dailyTarget` INTEGER NOT NULL, `frequencyType` TEXT NOT NULL, `targetDays` TEXT NOT NULL, `weeklyTarget` INTEGER NOT NULL, `monthlyDay` TEXT NOT NULL, `monthlyTarget` INTEGER NOT NULL, `parentId` TEXT, `parentDependency` TEXT NOT NULL, `showStreak` INTEGER NOT NULL, `showCount` INTEGER NOT NULL, `showDuration` INTEGER NOT NULL, `hideFromAll` INTEGER NOT NULL, `isPaused` INTEGER NOT NULL, `hideHeatmapWhenPaused` INTEGER NOT NULL, `createdAt` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))")
        connection.execSQL("CREATE TABLE IF NOT EXISTS `habit_logs` (`id` TEXT NOT NULL, `habitId` TEXT NOT NULL, `date` TEXT NOT NULL, `count` INTEGER NOT NULL, `note` TEXT NOT NULL, `unverified` INTEGER NOT NULL, `isPauseEvent` INTEGER NOT NULL, `eventType` TEXT, PRIMARY KEY(`id`))")
        connection.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)")
        connection.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, 'd103b8dda8867fec275e6224fbdecfc4')")
      }

      public override fun dropAllTables(connection: SQLiteConnection) {
        connection.execSQL("DROP TABLE IF EXISTS `habits`")
        connection.execSQL("DROP TABLE IF EXISTS `habit_logs`")
      }

      public override fun onCreate(connection: SQLiteConnection) {
      }

      public override fun onOpen(connection: SQLiteConnection) {
        internalInitInvalidationTracker(connection)
      }

      public override fun onPreMigrate(connection: SQLiteConnection) {
        dropFtsSyncTriggers(connection)
      }

      public override fun onPostMigrate(connection: SQLiteConnection) {
      }

      public override fun onValidateSchema(connection: SQLiteConnection): RoomOpenDelegate.ValidationResult {
        val _columnsHabits: MutableMap<String, TableInfo.Column> = mutableMapOf()
        _columnsHabits.put("id", TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("name", TableInfo.Column("name", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("type", TableInfo.Column("type", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("description", TableInfo.Column("description", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("category", TableInfo.Column("category", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("colorTheme", TableInfo.Column("colorTheme", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("dailyTarget", TableInfo.Column("dailyTarget", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("frequencyType", TableInfo.Column("frequencyType", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("targetDays", TableInfo.Column("targetDays", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("weeklyTarget", TableInfo.Column("weeklyTarget", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("monthlyDay", TableInfo.Column("monthlyDay", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("monthlyTarget", TableInfo.Column("monthlyTarget", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("parentId", TableInfo.Column("parentId", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("parentDependency", TableInfo.Column("parentDependency", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("showStreak", TableInfo.Column("showStreak", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("showCount", TableInfo.Column("showCount", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("showDuration", TableInfo.Column("showDuration", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("hideFromAll", TableInfo.Column("hideFromAll", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("isPaused", TableInfo.Column("isPaused", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("hideHeatmapWhenPaused", TableInfo.Column("hideHeatmapWhenPaused", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("createdAt", TableInfo.Column("createdAt", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabits.put("updatedAt", TableInfo.Column("updatedAt", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        val _foreignKeysHabits: MutableSet<TableInfo.ForeignKey> = mutableSetOf()
        val _indicesHabits: MutableSet<TableInfo.Index> = mutableSetOf()
        val _infoHabits: TableInfo = TableInfo("habits", _columnsHabits, _foreignKeysHabits, _indicesHabits)
        val _existingHabits: TableInfo = read(connection, "habits")
        if (!_infoHabits.equals(_existingHabits)) {
          return RoomOpenDelegate.ValidationResult(false, """
              |habits(com.habitual.app.data.HabitEntity).
              | Expected:
              |""".trimMargin() + _infoHabits + """
              |
              | Found:
              |""".trimMargin() + _existingHabits)
        }
        val _columnsHabitLogs: MutableMap<String, TableInfo.Column> = mutableMapOf()
        _columnsHabitLogs.put("id", TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabitLogs.put("habitId", TableInfo.Column("habitId", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabitLogs.put("date", TableInfo.Column("date", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabitLogs.put("count", TableInfo.Column("count", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabitLogs.put("note", TableInfo.Column("note", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabitLogs.put("unverified", TableInfo.Column("unverified", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabitLogs.put("isPauseEvent", TableInfo.Column("isPauseEvent", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY))
        _columnsHabitLogs.put("eventType", TableInfo.Column("eventType", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY))
        val _foreignKeysHabitLogs: MutableSet<TableInfo.ForeignKey> = mutableSetOf()
        val _indicesHabitLogs: MutableSet<TableInfo.Index> = mutableSetOf()
        val _infoHabitLogs: TableInfo = TableInfo("habit_logs", _columnsHabitLogs, _foreignKeysHabitLogs, _indicesHabitLogs)
        val _existingHabitLogs: TableInfo = read(connection, "habit_logs")
        if (!_infoHabitLogs.equals(_existingHabitLogs)) {
          return RoomOpenDelegate.ValidationResult(false, """
              |habit_logs(com.habitual.app.data.HabitLogEntity).
              | Expected:
              |""".trimMargin() + _infoHabitLogs + """
              |
              | Found:
              |""".trimMargin() + _existingHabitLogs)
        }
        return RoomOpenDelegate.ValidationResult(true, null)
      }
    }
    return _openDelegate
  }

  protected override fun createInvalidationTracker(): InvalidationTracker {
    val _shadowTablesMap: MutableMap<String, String> = mutableMapOf()
    val _viewTables: MutableMap<String, Set<String>> = mutableMapOf()
    return InvalidationTracker(this, _shadowTablesMap, _viewTables, "habits", "habit_logs")
  }

  public override fun clearAllTables() {
    super.performClear(false, "habits", "habit_logs")
  }

  protected override fun getRequiredTypeConverterClasses(): Map<KClass<*>, List<KClass<*>>> {
    val _typeConvertersMap: MutableMap<KClass<*>, List<KClass<*>>> = mutableMapOf()
    _typeConvertersMap.put(HabitDao::class, HabitDao_Impl.getRequiredConverters())
    return _typeConvertersMap
  }

  public override fun getRequiredAutoMigrationSpecClasses(): Set<KClass<out AutoMigrationSpec>> {
    val _autoMigrationSpecsSet: MutableSet<KClass<out AutoMigrationSpec>> = mutableSetOf()
    return _autoMigrationSpecsSet
  }

  public override fun createAutoMigrations(autoMigrationSpecs: Map<KClass<out AutoMigrationSpec>, AutoMigrationSpec>): List<Migration> {
    val _autoMigrations: MutableList<Migration> = mutableListOf()
    return _autoMigrations
  }

  public override fun habitDao(): HabitDao = _habitDao.value
}
