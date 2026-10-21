package com.habitual.app.`data`

import androidx.room.EntityDeleteOrUpdateAdapter
import androidx.room.EntityInsertAdapter
import androidx.room.RoomDatabase
import androidx.room.coroutines.createFlow
import androidx.room.util.getColumnIndexOrThrow
import androidx.room.util.performSuspending
import androidx.sqlite.SQLiteStatement
import javax.`annotation`.processing.Generated
import kotlin.Boolean
import kotlin.Int
import kotlin.Long
import kotlin.String
import kotlin.Suppress
import kotlin.Unit
import kotlin.collections.List
import kotlin.collections.MutableList
import kotlin.collections.mutableListOf
import kotlin.reflect.KClass
import kotlinx.coroutines.flow.Flow

@Generated(value = ["androidx.room.RoomProcessor"])
@Suppress(names = ["UNCHECKED_CAST", "DEPRECATION", "REDUNDANT_PROJECTION", "REMOVAL"])
public class HabitDao_Impl(
  __db: RoomDatabase,
) : HabitDao {
  private val __db: RoomDatabase

  private val __insertAdapterOfHabitEntity: EntityInsertAdapter<HabitEntity>

  private val __converters: Converters = Converters()

  private val __insertAdapterOfHabitLogEntity: EntityInsertAdapter<HabitLogEntity>

  private val __deleteAdapterOfHabitEntity: EntityDeleteOrUpdateAdapter<HabitEntity>
  init {
    this.__db = __db
    this.__insertAdapterOfHabitEntity = object : EntityInsertAdapter<HabitEntity>() {
      protected override fun createQuery(): String = "INSERT OR REPLACE INTO `habits` (`id`,`name`,`type`,`description`,`category`,`colorTheme`,`dailyTarget`,`frequencyType`,`targetDays`,`weeklyTarget`,`monthlyDay`,`monthlyTarget`,`parentId`,`parentDependency`,`showStreak`,`showCount`,`showDuration`,`hideFromAll`,`isPaused`,`hideHeatmapWhenPaused`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"

      protected override fun bind(statement: SQLiteStatement, entity: HabitEntity) {
        statement.bindText(1, entity.id)
        statement.bindText(2, entity.name)
        statement.bindText(3, entity.type)
        statement.bindText(4, entity.description)
        statement.bindText(5, entity.category)
        statement.bindText(6, entity.colorTheme)
        statement.bindLong(7, entity.dailyTarget.toLong())
        statement.bindText(8, entity.frequencyType)
        val _tmp: String = __converters.fromIntList(entity.targetDays)
        statement.bindText(9, _tmp)
        statement.bindLong(10, entity.weeklyTarget.toLong())
        statement.bindText(11, entity.monthlyDay)
        statement.bindLong(12, entity.monthlyTarget.toLong())
        val _tmpParentId: String? = entity.parentId
        if (_tmpParentId == null) {
          statement.bindNull(13)
        } else {
          statement.bindText(13, _tmpParentId)
        }
        statement.bindText(14, entity.parentDependency)
        val _tmp_1: Int = if (entity.showStreak) 1 else 0
        statement.bindLong(15, _tmp_1.toLong())
        val _tmp_2: Int = if (entity.showCount) 1 else 0
        statement.bindLong(16, _tmp_2.toLong())
        val _tmp_3: Int = if (entity.showDuration) 1 else 0
        statement.bindLong(17, _tmp_3.toLong())
        val _tmp_4: Int = if (entity.hideFromAll) 1 else 0
        statement.bindLong(18, _tmp_4.toLong())
        val _tmp_5: Int = if (entity.isPaused) 1 else 0
        statement.bindLong(19, _tmp_5.toLong())
        val _tmp_6: Int = if (entity.hideHeatmapWhenPaused) 1 else 0
        statement.bindLong(20, _tmp_6.toLong())
        statement.bindText(21, entity.createdAt)
        statement.bindLong(22, entity.updatedAt)
      }
    }
    this.__insertAdapterOfHabitLogEntity = object : EntityInsertAdapter<HabitLogEntity>() {
      protected override fun createQuery(): String = "INSERT OR REPLACE INTO `habit_logs` (`id`,`habitId`,`date`,`count`,`note`,`unverified`,`isPauseEvent`,`eventType`) VALUES (?,?,?,?,?,?,?,?)"

      protected override fun bind(statement: SQLiteStatement, entity: HabitLogEntity) {
        statement.bindText(1, entity.id)
        statement.bindText(2, entity.habitId)
        statement.bindText(3, entity.date)
        statement.bindLong(4, entity.count.toLong())
        statement.bindText(5, entity.note)
        val _tmp: Int = if (entity.unverified) 1 else 0
        statement.bindLong(6, _tmp.toLong())
        val _tmp_1: Int = if (entity.isPauseEvent) 1 else 0
        statement.bindLong(7, _tmp_1.toLong())
        val _tmpEventType: String? = entity.eventType
        if (_tmpEventType == null) {
          statement.bindNull(8)
        } else {
          statement.bindText(8, _tmpEventType)
        }
      }
    }
    this.__deleteAdapterOfHabitEntity = object : EntityDeleteOrUpdateAdapter<HabitEntity>() {
      protected override fun createQuery(): String = "DELETE FROM `habits` WHERE `id` = ?"

      protected override fun bind(statement: SQLiteStatement, entity: HabitEntity) {
        statement.bindText(1, entity.id)
      }
    }
  }

  public override suspend fun insertOrUpdateHabit(habit: HabitEntity): Unit = performSuspending(__db, false, true) { _connection ->
    __insertAdapterOfHabitEntity.insert(_connection, habit)
  }

  public override suspend fun insertOrUpdateLog(log: HabitLogEntity): Unit = performSuspending(__db, false, true) { _connection ->
    __insertAdapterOfHabitLogEntity.insert(_connection, log)
  }

  public override suspend fun insertLogs(logs: List<HabitLogEntity>): Unit = performSuspending(__db, false, true) { _connection ->
    __insertAdapterOfHabitLogEntity.insert(_connection, logs)
  }

  public override suspend fun deleteHabit(habit: HabitEntity): Unit = performSuspending(__db, false, true) { _connection ->
    __deleteAdapterOfHabitEntity.handle(_connection, habit)
  }

  public override fun getAllHabits(): Flow<List<HabitEntity>> {
    val _sql: String = "SELECT * FROM habits ORDER BY updatedAt DESC"
    return createFlow(__db, false, arrayOf("habits")) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        val _columnIndexOfId: Int = getColumnIndexOrThrow(_stmt, "id")
        val _columnIndexOfName: Int = getColumnIndexOrThrow(_stmt, "name")
        val _columnIndexOfType: Int = getColumnIndexOrThrow(_stmt, "type")
        val _columnIndexOfDescription: Int = getColumnIndexOrThrow(_stmt, "description")
        val _columnIndexOfCategory: Int = getColumnIndexOrThrow(_stmt, "category")
        val _columnIndexOfColorTheme: Int = getColumnIndexOrThrow(_stmt, "colorTheme")
        val _columnIndexOfDailyTarget: Int = getColumnIndexOrThrow(_stmt, "dailyTarget")
        val _columnIndexOfFrequencyType: Int = getColumnIndexOrThrow(_stmt, "frequencyType")
        val _columnIndexOfTargetDays: Int = getColumnIndexOrThrow(_stmt, "targetDays")
        val _columnIndexOfWeeklyTarget: Int = getColumnIndexOrThrow(_stmt, "weeklyTarget")
        val _columnIndexOfMonthlyDay: Int = getColumnIndexOrThrow(_stmt, "monthlyDay")
        val _columnIndexOfMonthlyTarget: Int = getColumnIndexOrThrow(_stmt, "monthlyTarget")
        val _columnIndexOfParentId: Int = getColumnIndexOrThrow(_stmt, "parentId")
        val _columnIndexOfParentDependency: Int = getColumnIndexOrThrow(_stmt, "parentDependency")
        val _columnIndexOfShowStreak: Int = getColumnIndexOrThrow(_stmt, "showStreak")
        val _columnIndexOfShowCount: Int = getColumnIndexOrThrow(_stmt, "showCount")
        val _columnIndexOfShowDuration: Int = getColumnIndexOrThrow(_stmt, "showDuration")
        val _columnIndexOfHideFromAll: Int = getColumnIndexOrThrow(_stmt, "hideFromAll")
        val _columnIndexOfIsPaused: Int = getColumnIndexOrThrow(_stmt, "isPaused")
        val _columnIndexOfHideHeatmapWhenPaused: Int = getColumnIndexOrThrow(_stmt, "hideHeatmapWhenPaused")
        val _columnIndexOfCreatedAt: Int = getColumnIndexOrThrow(_stmt, "createdAt")
        val _columnIndexOfUpdatedAt: Int = getColumnIndexOrThrow(_stmt, "updatedAt")
        val _result: MutableList<HabitEntity> = mutableListOf()
        while (_stmt.step()) {
          val _item: HabitEntity
          val _tmpId: String
          _tmpId = _stmt.getText(_columnIndexOfId)
          val _tmpName: String
          _tmpName = _stmt.getText(_columnIndexOfName)
          val _tmpType: String
          _tmpType = _stmt.getText(_columnIndexOfType)
          val _tmpDescription: String
          _tmpDescription = _stmt.getText(_columnIndexOfDescription)
          val _tmpCategory: String
          _tmpCategory = _stmt.getText(_columnIndexOfCategory)
          val _tmpColorTheme: String
          _tmpColorTheme = _stmt.getText(_columnIndexOfColorTheme)
          val _tmpDailyTarget: Int
          _tmpDailyTarget = _stmt.getLong(_columnIndexOfDailyTarget).toInt()
          val _tmpFrequencyType: String
          _tmpFrequencyType = _stmt.getText(_columnIndexOfFrequencyType)
          val _tmpTargetDays: List<Int>
          val _tmp: String
          _tmp = _stmt.getText(_columnIndexOfTargetDays)
          _tmpTargetDays = __converters.toIntList(_tmp)
          val _tmpWeeklyTarget: Int
          _tmpWeeklyTarget = _stmt.getLong(_columnIndexOfWeeklyTarget).toInt()
          val _tmpMonthlyDay: String
          _tmpMonthlyDay = _stmt.getText(_columnIndexOfMonthlyDay)
          val _tmpMonthlyTarget: Int
          _tmpMonthlyTarget = _stmt.getLong(_columnIndexOfMonthlyTarget).toInt()
          val _tmpParentId: String?
          if (_stmt.isNull(_columnIndexOfParentId)) {
            _tmpParentId = null
          } else {
            _tmpParentId = _stmt.getText(_columnIndexOfParentId)
          }
          val _tmpParentDependency: String
          _tmpParentDependency = _stmt.getText(_columnIndexOfParentDependency)
          val _tmpShowStreak: Boolean
          val _tmp_1: Int
          _tmp_1 = _stmt.getLong(_columnIndexOfShowStreak).toInt()
          _tmpShowStreak = _tmp_1 != 0
          val _tmpShowCount: Boolean
          val _tmp_2: Int
          _tmp_2 = _stmt.getLong(_columnIndexOfShowCount).toInt()
          _tmpShowCount = _tmp_2 != 0
          val _tmpShowDuration: Boolean
          val _tmp_3: Int
          _tmp_3 = _stmt.getLong(_columnIndexOfShowDuration).toInt()
          _tmpShowDuration = _tmp_3 != 0
          val _tmpHideFromAll: Boolean
          val _tmp_4: Int
          _tmp_4 = _stmt.getLong(_columnIndexOfHideFromAll).toInt()
          _tmpHideFromAll = _tmp_4 != 0
          val _tmpIsPaused: Boolean
          val _tmp_5: Int
          _tmp_5 = _stmt.getLong(_columnIndexOfIsPaused).toInt()
          _tmpIsPaused = _tmp_5 != 0
          val _tmpHideHeatmapWhenPaused: Boolean
          val _tmp_6: Int
          _tmp_6 = _stmt.getLong(_columnIndexOfHideHeatmapWhenPaused).toInt()
          _tmpHideHeatmapWhenPaused = _tmp_6 != 0
          val _tmpCreatedAt: String
          _tmpCreatedAt = _stmt.getText(_columnIndexOfCreatedAt)
          val _tmpUpdatedAt: Long
          _tmpUpdatedAt = _stmt.getLong(_columnIndexOfUpdatedAt)
          _item = HabitEntity(_tmpId,_tmpName,_tmpType,_tmpDescription,_tmpCategory,_tmpColorTheme,_tmpDailyTarget,_tmpFrequencyType,_tmpTargetDays,_tmpWeeklyTarget,_tmpMonthlyDay,_tmpMonthlyTarget,_tmpParentId,_tmpParentDependency,_tmpShowStreak,_tmpShowCount,_tmpShowDuration,_tmpHideFromAll,_tmpIsPaused,_tmpHideHeatmapWhenPaused,_tmpCreatedAt,_tmpUpdatedAt)
          _result.add(_item)
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun getHabitById(id: String): HabitEntity? {
    val _sql: String = "SELECT * FROM habits WHERE id = ?"
    return performSuspending(__db, true, false) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, id)
        val _columnIndexOfId: Int = getColumnIndexOrThrow(_stmt, "id")
        val _columnIndexOfName: Int = getColumnIndexOrThrow(_stmt, "name")
        val _columnIndexOfType: Int = getColumnIndexOrThrow(_stmt, "type")
        val _columnIndexOfDescription: Int = getColumnIndexOrThrow(_stmt, "description")
        val _columnIndexOfCategory: Int = getColumnIndexOrThrow(_stmt, "category")
        val _columnIndexOfColorTheme: Int = getColumnIndexOrThrow(_stmt, "colorTheme")
        val _columnIndexOfDailyTarget: Int = getColumnIndexOrThrow(_stmt, "dailyTarget")
        val _columnIndexOfFrequencyType: Int = getColumnIndexOrThrow(_stmt, "frequencyType")
        val _columnIndexOfTargetDays: Int = getColumnIndexOrThrow(_stmt, "targetDays")
        val _columnIndexOfWeeklyTarget: Int = getColumnIndexOrThrow(_stmt, "weeklyTarget")
        val _columnIndexOfMonthlyDay: Int = getColumnIndexOrThrow(_stmt, "monthlyDay")
        val _columnIndexOfMonthlyTarget: Int = getColumnIndexOrThrow(_stmt, "monthlyTarget")
        val _columnIndexOfParentId: Int = getColumnIndexOrThrow(_stmt, "parentId")
        val _columnIndexOfParentDependency: Int = getColumnIndexOrThrow(_stmt, "parentDependency")
        val _columnIndexOfShowStreak: Int = getColumnIndexOrThrow(_stmt, "showStreak")
        val _columnIndexOfShowCount: Int = getColumnIndexOrThrow(_stmt, "showCount")
        val _columnIndexOfShowDuration: Int = getColumnIndexOrThrow(_stmt, "showDuration")
        val _columnIndexOfHideFromAll: Int = getColumnIndexOrThrow(_stmt, "hideFromAll")
        val _columnIndexOfIsPaused: Int = getColumnIndexOrThrow(_stmt, "isPaused")
        val _columnIndexOfHideHeatmapWhenPaused: Int = getColumnIndexOrThrow(_stmt, "hideHeatmapWhenPaused")
        val _columnIndexOfCreatedAt: Int = getColumnIndexOrThrow(_stmt, "createdAt")
        val _columnIndexOfUpdatedAt: Int = getColumnIndexOrThrow(_stmt, "updatedAt")
        val _result: HabitEntity?
        if (_stmt.step()) {
          val _tmpId: String
          _tmpId = _stmt.getText(_columnIndexOfId)
          val _tmpName: String
          _tmpName = _stmt.getText(_columnIndexOfName)
          val _tmpType: String
          _tmpType = _stmt.getText(_columnIndexOfType)
          val _tmpDescription: String
          _tmpDescription = _stmt.getText(_columnIndexOfDescription)
          val _tmpCategory: String
          _tmpCategory = _stmt.getText(_columnIndexOfCategory)
          val _tmpColorTheme: String
          _tmpColorTheme = _stmt.getText(_columnIndexOfColorTheme)
          val _tmpDailyTarget: Int
          _tmpDailyTarget = _stmt.getLong(_columnIndexOfDailyTarget).toInt()
          val _tmpFrequencyType: String
          _tmpFrequencyType = _stmt.getText(_columnIndexOfFrequencyType)
          val _tmpTargetDays: List<Int>
          val _tmp: String
          _tmp = _stmt.getText(_columnIndexOfTargetDays)
          _tmpTargetDays = __converters.toIntList(_tmp)
          val _tmpWeeklyTarget: Int
          _tmpWeeklyTarget = _stmt.getLong(_columnIndexOfWeeklyTarget).toInt()
          val _tmpMonthlyDay: String
          _tmpMonthlyDay = _stmt.getText(_columnIndexOfMonthlyDay)
          val _tmpMonthlyTarget: Int
          _tmpMonthlyTarget = _stmt.getLong(_columnIndexOfMonthlyTarget).toInt()
          val _tmpParentId: String?
          if (_stmt.isNull(_columnIndexOfParentId)) {
            _tmpParentId = null
          } else {
            _tmpParentId = _stmt.getText(_columnIndexOfParentId)
          }
          val _tmpParentDependency: String
          _tmpParentDependency = _stmt.getText(_columnIndexOfParentDependency)
          val _tmpShowStreak: Boolean
          val _tmp_1: Int
          _tmp_1 = _stmt.getLong(_columnIndexOfShowStreak).toInt()
          _tmpShowStreak = _tmp_1 != 0
          val _tmpShowCount: Boolean
          val _tmp_2: Int
          _tmp_2 = _stmt.getLong(_columnIndexOfShowCount).toInt()
          _tmpShowCount = _tmp_2 != 0
          val _tmpShowDuration: Boolean
          val _tmp_3: Int
          _tmp_3 = _stmt.getLong(_columnIndexOfShowDuration).toInt()
          _tmpShowDuration = _tmp_3 != 0
          val _tmpHideFromAll: Boolean
          val _tmp_4: Int
          _tmp_4 = _stmt.getLong(_columnIndexOfHideFromAll).toInt()
          _tmpHideFromAll = _tmp_4 != 0
          val _tmpIsPaused: Boolean
          val _tmp_5: Int
          _tmp_5 = _stmt.getLong(_columnIndexOfIsPaused).toInt()
          _tmpIsPaused = _tmp_5 != 0
          val _tmpHideHeatmapWhenPaused: Boolean
          val _tmp_6: Int
          _tmp_6 = _stmt.getLong(_columnIndexOfHideHeatmapWhenPaused).toInt()
          _tmpHideHeatmapWhenPaused = _tmp_6 != 0
          val _tmpCreatedAt: String
          _tmpCreatedAt = _stmt.getText(_columnIndexOfCreatedAt)
          val _tmpUpdatedAt: Long
          _tmpUpdatedAt = _stmt.getLong(_columnIndexOfUpdatedAt)
          _result = HabitEntity(_tmpId,_tmpName,_tmpType,_tmpDescription,_tmpCategory,_tmpColorTheme,_tmpDailyTarget,_tmpFrequencyType,_tmpTargetDays,_tmpWeeklyTarget,_tmpMonthlyDay,_tmpMonthlyTarget,_tmpParentId,_tmpParentDependency,_tmpShowStreak,_tmpShowCount,_tmpShowDuration,_tmpHideFromAll,_tmpIsPaused,_tmpHideHeatmapWhenPaused,_tmpCreatedAt,_tmpUpdatedAt)
        } else {
          _result = null
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override fun getLogsForHabit(habitId: String): Flow<List<HabitLogEntity>> {
    val _sql: String = "SELECT * FROM habit_logs WHERE habitId = ?"
    return createFlow(__db, false, arrayOf("habit_logs")) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, habitId)
        val _columnIndexOfId: Int = getColumnIndexOrThrow(_stmt, "id")
        val _columnIndexOfHabitId: Int = getColumnIndexOrThrow(_stmt, "habitId")
        val _columnIndexOfDate: Int = getColumnIndexOrThrow(_stmt, "date")
        val _columnIndexOfCount: Int = getColumnIndexOrThrow(_stmt, "count")
        val _columnIndexOfNote: Int = getColumnIndexOrThrow(_stmt, "note")
        val _columnIndexOfUnverified: Int = getColumnIndexOrThrow(_stmt, "unverified")
        val _columnIndexOfIsPauseEvent: Int = getColumnIndexOrThrow(_stmt, "isPauseEvent")
        val _columnIndexOfEventType: Int = getColumnIndexOrThrow(_stmt, "eventType")
        val _result: MutableList<HabitLogEntity> = mutableListOf()
        while (_stmt.step()) {
          val _item: HabitLogEntity
          val _tmpId: String
          _tmpId = _stmt.getText(_columnIndexOfId)
          val _tmpHabitId: String
          _tmpHabitId = _stmt.getText(_columnIndexOfHabitId)
          val _tmpDate: String
          _tmpDate = _stmt.getText(_columnIndexOfDate)
          val _tmpCount: Int
          _tmpCount = _stmt.getLong(_columnIndexOfCount).toInt()
          val _tmpNote: String
          _tmpNote = _stmt.getText(_columnIndexOfNote)
          val _tmpUnverified: Boolean
          val _tmp: Int
          _tmp = _stmt.getLong(_columnIndexOfUnverified).toInt()
          _tmpUnverified = _tmp != 0
          val _tmpIsPauseEvent: Boolean
          val _tmp_1: Int
          _tmp_1 = _stmt.getLong(_columnIndexOfIsPauseEvent).toInt()
          _tmpIsPauseEvent = _tmp_1 != 0
          val _tmpEventType: String?
          if (_stmt.isNull(_columnIndexOfEventType)) {
            _tmpEventType = null
          } else {
            _tmpEventType = _stmt.getText(_columnIndexOfEventType)
          }
          _item = HabitLogEntity(_tmpId,_tmpHabitId,_tmpDate,_tmpCount,_tmpNote,_tmpUnverified,_tmpIsPauseEvent,_tmpEventType)
          _result.add(_item)
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override fun getAllLogs(): Flow<List<HabitLogEntity>> {
    val _sql: String = "SELECT * FROM habit_logs"
    return createFlow(__db, false, arrayOf("habit_logs")) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        val _columnIndexOfId: Int = getColumnIndexOrThrow(_stmt, "id")
        val _columnIndexOfHabitId: Int = getColumnIndexOrThrow(_stmt, "habitId")
        val _columnIndexOfDate: Int = getColumnIndexOrThrow(_stmt, "date")
        val _columnIndexOfCount: Int = getColumnIndexOrThrow(_stmt, "count")
        val _columnIndexOfNote: Int = getColumnIndexOrThrow(_stmt, "note")
        val _columnIndexOfUnverified: Int = getColumnIndexOrThrow(_stmt, "unverified")
        val _columnIndexOfIsPauseEvent: Int = getColumnIndexOrThrow(_stmt, "isPauseEvent")
        val _columnIndexOfEventType: Int = getColumnIndexOrThrow(_stmt, "eventType")
        val _result: MutableList<HabitLogEntity> = mutableListOf()
        while (_stmt.step()) {
          val _item: HabitLogEntity
          val _tmpId: String
          _tmpId = _stmt.getText(_columnIndexOfId)
          val _tmpHabitId: String
          _tmpHabitId = _stmt.getText(_columnIndexOfHabitId)
          val _tmpDate: String
          _tmpDate = _stmt.getText(_columnIndexOfDate)
          val _tmpCount: Int
          _tmpCount = _stmt.getLong(_columnIndexOfCount).toInt()
          val _tmpNote: String
          _tmpNote = _stmt.getText(_columnIndexOfNote)
          val _tmpUnverified: Boolean
          val _tmp: Int
          _tmp = _stmt.getLong(_columnIndexOfUnverified).toInt()
          _tmpUnverified = _tmp != 0
          val _tmpIsPauseEvent: Boolean
          val _tmp_1: Int
          _tmp_1 = _stmt.getLong(_columnIndexOfIsPauseEvent).toInt()
          _tmpIsPauseEvent = _tmp_1 != 0
          val _tmpEventType: String?
          if (_stmt.isNull(_columnIndexOfEventType)) {
            _tmpEventType = null
          } else {
            _tmpEventType = _stmt.getText(_columnIndexOfEventType)
          }
          _item = HabitLogEntity(_tmpId,_tmpHabitId,_tmpDate,_tmpCount,_tmpNote,_tmpUnverified,_tmpIsPauseEvent,_tmpEventType)
          _result.add(_item)
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun getLogForDate(habitId: String, date: String): HabitLogEntity? {
    val _sql: String = "SELECT * FROM habit_logs WHERE habitId = ? AND date = ?"
    return performSuspending(__db, true, false) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, habitId)
        _argIndex = 2
        _stmt.bindText(_argIndex, date)
        val _columnIndexOfId: Int = getColumnIndexOrThrow(_stmt, "id")
        val _columnIndexOfHabitId: Int = getColumnIndexOrThrow(_stmt, "habitId")
        val _columnIndexOfDate: Int = getColumnIndexOrThrow(_stmt, "date")
        val _columnIndexOfCount: Int = getColumnIndexOrThrow(_stmt, "count")
        val _columnIndexOfNote: Int = getColumnIndexOrThrow(_stmt, "note")
        val _columnIndexOfUnverified: Int = getColumnIndexOrThrow(_stmt, "unverified")
        val _columnIndexOfIsPauseEvent: Int = getColumnIndexOrThrow(_stmt, "isPauseEvent")
        val _columnIndexOfEventType: Int = getColumnIndexOrThrow(_stmt, "eventType")
        val _result: HabitLogEntity?
        if (_stmt.step()) {
          val _tmpId: String
          _tmpId = _stmt.getText(_columnIndexOfId)
          val _tmpHabitId: String
          _tmpHabitId = _stmt.getText(_columnIndexOfHabitId)
          val _tmpDate: String
          _tmpDate = _stmt.getText(_columnIndexOfDate)
          val _tmpCount: Int
          _tmpCount = _stmt.getLong(_columnIndexOfCount).toInt()
          val _tmpNote: String
          _tmpNote = _stmt.getText(_columnIndexOfNote)
          val _tmpUnverified: Boolean
          val _tmp: Int
          _tmp = _stmt.getLong(_columnIndexOfUnverified).toInt()
          _tmpUnverified = _tmp != 0
          val _tmpIsPauseEvent: Boolean
          val _tmp_1: Int
          _tmp_1 = _stmt.getLong(_columnIndexOfIsPauseEvent).toInt()
          _tmpIsPauseEvent = _tmp_1 != 0
          val _tmpEventType: String?
          if (_stmt.isNull(_columnIndexOfEventType)) {
            _tmpEventType = null
          } else {
            _tmpEventType = _stmt.getText(_columnIndexOfEventType)
          }
          _result = HabitLogEntity(_tmpId,_tmpHabitId,_tmpDate,_tmpCount,_tmpNote,_tmpUnverified,_tmpIsPauseEvent,_tmpEventType)
        } else {
          _result = null
        }
        _result
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun deleteHabitById(id: String) {
    val _sql: String = "DELETE FROM habits WHERE id = ?"
    return performSuspending(__db, false, true) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, id)
        _stmt.step()
      } finally {
        _stmt.close()
      }
    }
  }

  public override suspend fun deleteLog(habitId: String, date: String) {
    val _sql: String = "DELETE FROM habit_logs WHERE habitId = ? AND date = ?"
    return performSuspending(__db, false, true) { _connection ->
      val _stmt: SQLiteStatement = _connection.prepare(_sql)
      try {
        var _argIndex: Int = 1
        _stmt.bindText(_argIndex, habitId)
        _argIndex = 2
        _stmt.bindText(_argIndex, date)
        _stmt.step()
      } finally {
        _stmt.close()
      }
    }
  }

  public companion object {
    public fun getRequiredConverters(): List<KClass<*>> = emptyList()
  }
}
