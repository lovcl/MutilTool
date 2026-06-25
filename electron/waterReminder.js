const fs = require('fs');
const path = require('path');
const { formatDateKey, getDateMeta } = require('./workCalendar');
const {
  REMINDER_TOAST,
  isReminderSnoozedToday,
  snoozeReminderToday,
  msUntilSnoozeExpires,
} = require('./reminderSnooze');

let APP_RULES_CONFIG_REF = null;

const getConfig = () => {
  if (!APP_RULES_CONFIG_REF) {
    APP_RULES_CONFIG_REF = require('../app.rules.config.json');
  }
  return APP_RULES_CONFIG_REF.water;
};

const timeToMinutes = (time) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const pickRandomReminderCopy = (reminder) => {
  if (Array.isArray(reminder.variants) && reminder.variants.length) {
    return reminder.variants[randomInt(0, reminder.variants.length - 1)];
  }

  return {
    title: reminder.title || '喝水提醒',
    message: reminder.message || '记得补充一杯水。',
    detailTemplate: reminder.detailTemplate || '提醒时间 {time}。今日 {drank}/{target} 杯。',
  };
};

const createWaterReminderModule = ({
  userDataPath,
  loadAppSettings,
  saveAppSettings,
  getMainWindow,
  showActionReminder,
  activityLog,
}) => {
  const recordsPath = path.join(userDataPath, 'water-records.json');
  let waterTimer = null;
  let laterTimer = null;

  const loadWaterRecords = () => {
    if (!fs.existsSync(recordsPath)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
    } catch (error) {
      console.error('[water-records] 读取失败:', error.message);
      return {};
    }
  };

  const saveWaterRecords = (records) => {
    fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
  };

  const getWaterReminderEnabled = () => {
    const settings = loadAppSettings();
    if (typeof settings.waterReminderEnabled === 'boolean') {
      return settings.waterReminderEnabled;
    }

    return Boolean(getConfig().reminderDefaultEnabled);
  };

  const setWaterReminderEnabled = (enabled) => {
    const nextEnabled = Boolean(enabled);
    saveAppSettings({
      ...loadAppSettings(),
      waterReminderEnabled: nextEnabled,
    });

    if (nextEnabled) {
      scheduleNextWaterReminder();
    } else {
      clearWaterReminderTimers();
    }

    return getWaterReminderEnabled();
  };

  const clearWaterReminderTimers = () => {
    if (waterTimer) {
      clearTimeout(waterTimer);
      waterTimer = null;
    }

    if (laterTimer) {
      clearTimeout(laterTimer);
      laterTimer = null;
    }
  };

  const clearHourlyWaterTimer = () => {
    if (waterTimer) {
      clearTimeout(waterTimer);
      waterTimer = null;
    }
  };

  const isWithinBreak = (hour, minute, breaks) => {
    const minutes = hour * 60 + minute;
    return breaks.some((breakItem) => {
      const breakStart = timeToMinutes(breakItem.startTime);
      const breakEnd = timeToMinutes(breakItem.endTime);
      return minutes >= breakStart && minutes < breakEnd;
    });
  };

  const isWithinWorkHours = (hour, minute, workHours) => {
    const minutes = hour * 60 + minute;
    const start = timeToMinutes(workHours.startTime);
    const end = timeToMinutes(workHours.endTime);
    return minutes >= start && minutes < end;
  };

  const shouldRemindToday = (date = new Date()) => {
    const config = getConfig();
    if (!config.reminder.useWorkdaySchedule) {
      return true;
    }

    return getDateMeta(date).isWorkday;
  };

  const getHourlyReminderSlots = (date = new Date()) => {
    const config = getConfig();
    const { workHours, breaks } = config.reminder;
    const slots = [];

    for (let hour = 0; hour < 24; hour += 1) {
      if (!isWithinWorkHours(hour, 0, workHours)) {
        continue;
      }

      if (isWithinBreak(hour, 0, breaks)) {
        continue;
      }

      slots.push({ hour, minute: 0 });
    }

    return slots;
  };

  const getNextReminderTarget = (fromDate = new Date()) => {
    if (!shouldRemindToday(fromDate)) {
      const tomorrow = new Date(fromDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      if (!shouldRemindToday(tomorrow)) {
        return null;
      }

      const slots = getHourlyReminderSlots(tomorrow);
      if (!slots.length) {
        return null;
      }

      const target = new Date(tomorrow);
      target.setHours(slots[0].hour, slots[0].minute, 0, 0);
      return target;
    }

    const slots = getHourlyReminderSlots(fromDate);
    const now = fromDate.getTime();

    for (const slot of slots) {
      const target = new Date(fromDate);
      target.setHours(slot.hour, slot.minute, 0, 0);
      if (target.getTime() > now) {
        return target;
      }
    }

    const tomorrow = new Date(fromDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    let cursor = tomorrow;
    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      if (shouldRemindToday(cursor)) {
        const nextSlots = getHourlyReminderSlots(cursor);
        if (nextSlots.length) {
          const target = new Date(cursor);
          target.setHours(nextSlots[0].hour, nextSlots[0].minute, 0, 0);
          return target;
        }
      }

      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }

    return null;
  };

  const getTodayDrinkCount = (dateKey = formatDateKey(new Date())) => {
    const records = loadWaterRecords()[dateKey] || [];
    return records.filter((record) => record.action === 'drink').length;
  };

  const buildWaterLogSummary = (entry) => {
    const actionTextMap = {
      drink: '已喝水',
      later: '稍后提醒',
      skip: '此次不喝',
    };
    const actionText = actionTextMap[entry.action] || entry.action;
    const sourceText =
      entry.source === 'manual'
        ? '手动补录'
        : entry.source === 'later-follow-up'
          ? '稍后跟进'
          : '系统提醒';
    const timeLabel = entry.scheduledLabel ? `提醒 ${entry.scheduledLabel}` : '手动记录';

    return `${timeLabel} · ${actionText}（${sourceText}）`;
  };

  const appendWaterRecord = (record) => {
    const dateKey = record.dateKey || formatDateKey(new Date());
    const records = loadWaterRecords();
    const dayRecords = records[dateKey] || [];
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scheduledHour: record.scheduledHour ?? null,
      scheduledLabel: record.scheduledLabel || '',
      action: record.action,
      recordedAt: record.recordedAt || new Date().toISOString(),
      source: record.source || 'reminder',
    };

    records[dateKey] = [...dayRecords, entry];
    saveWaterRecords(records);

    getMainWindow()?.webContents.send('water:record', {
      dateKey,
      record: entry,
    });

    activityLog?.appendLog({
      category: 'water',
      action: entry.action,
      title: entry.source === 'manual' ? '手动喝水记录' : '喝水提醒',
      summary: buildWaterLogSummary(entry),
      detail: { dateKey, record: entry },
    });

    return entry;
  };

  const formatScheduledLabel = (target) =>
    `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;

  const showWaterReminder = async (target, options = {}) => {
    if (!options.force && !getWaterReminderEnabled()) {
      return;
    }

    if (!options.force && isReminderSnoozedToday(loadAppSettings, 'water')) {
      scheduleNextWaterReminder();
      return;
    }

    const config = getConfig();
    const reminder = config.reminder;
    const copy = pickRandomReminderCopy(reminder);
    const dateKey = formatDateKey(target);
    const drankCount = getTodayDrinkCount(dateKey);
    const scheduledLabel = formatScheduledLabel(target);
    const detail = `${copy.message}\n\n${copy.detailTemplate
      .replace('{time}', scheduledLabel)
      .replace('{drank}', String(drankCount))
      .replace('{target}', String(config.targetGlassesPerDay))}`;

    const response = await showActionReminder({
      title: options.isTest ? `[预览] ${copy.title}` : copy.title,
      body: detail,
      buttons: reminder.buttons,
      cancelIndex: 2,
      theme: 'water',
      meta: {
        time: scheduledLabel,
        progress: {
          current: drankCount,
          total: config.targetGlassesPerDay,
          unit: '杯',
        },
      },
      messageTracking: {
        category: 'water',
        isTest: Boolean(options.isTest),
      },
    });

    if (options.isTest) {
      return;
    }

    if (response === REMINDER_TOAST.SNOOZE_TODAY) {
      snoozeReminderToday(loadAppSettings, saveAppSettings, 'water');
      activityLog?.appendLog({
        category: 'water',
        action: 'snooze-today',
        title: '喝水提醒',
        summary: '已设置今日不再提醒喝水',
        detail: { dateKey },
      });
      clearWaterReminderTimers();
      scheduleNextWaterReminder();
      return;
    }

    if (response === REMINDER_TOAST.CLOSED || response < 0) {
      scheduleNextWaterReminder();
      return;
    }

    const actionMap = ['drink', 'later', 'skip'];
    const action = actionMap[response] || 'skip';
    appendWaterRecord({
      dateKey,
      scheduledHour: target.getHours(),
      scheduledLabel,
      action,
      source: options.source || 'reminder',
    });

    if (action === 'later' && !options.skipFollowUp) {
      scheduleLaterFollowUp(target);
    }

    scheduleNextWaterReminder();
  };

  const scheduleLaterFollowUp = (originalTarget) => {
    const config = getConfig();
    const delayMinutes = config.reminder.laterDelayMinutes || 15;
    const followUp = new Date();
    followUp.setMinutes(followUp.getMinutes() + delayMinutes);

    const workHours = config.reminder.workHours;
    const breaks = config.reminder.breaks;
    const hour = followUp.getHours();
    const minute = followUp.getMinutes();

    if (
      !shouldRemindToday(followUp) ||
      !isWithinWorkHours(hour, minute, workHours) ||
      isWithinBreak(hour, minute, breaks)
    ) {
      return;
    }

    if (laterTimer) {
      clearTimeout(laterTimer);
    }

    const delayMs = followUp.getTime() - Date.now();
    laterTimer = setTimeout(() => {
      laterTimer = null;
      showWaterReminder(followUp, { source: 'later-follow-up', skipFollowUp: true });
    }, Math.max(delayMs, 1000));
  };

  const scheduleNextWaterReminder = () => {
    clearHourlyWaterTimer();

    if (!getWaterReminderEnabled()) {
      return;
    }

    if (isReminderSnoozedToday(loadAppSettings, 'water')) {
      const delayMs = msUntilSnoozeExpires(loadAppSettings, 'water');
      if (delayMs > 0) {
        waterTimer = setTimeout(() => {
          waterTimer = null;
          scheduleNextWaterReminder();
        }, delayMs);
      }
      return;
    }

    let target = getNextReminderTarget(new Date());

    if (!target) {
      return;
    }

    const delayMs = target.getTime() - Date.now();
    waterTimer = setTimeout(() => {
      waterTimer = null;
      showWaterReminder(target);
    }, Math.max(delayMs, 1000));

    console.log(`[water-reminder] 下次提醒: ${target.toLocaleString()}`);
  };

  return {
    loadWaterRecords,
    appendWaterRecord,
    getWaterReminderEnabled,
    setWaterReminderEnabled,
    scheduleNextWaterReminder,
    clearWaterReminderTimers,
    getTodayDrinkCount,
    showTestReminder: () => showWaterReminder(new Date(), { force: true, isTest: true }),
  };
};

module.exports = { createWaterReminderModule };
