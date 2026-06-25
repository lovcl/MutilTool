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
  return APP_RULES_CONFIG_REF.toilet;
};

const timeToMinutes = (time) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const minutesToTime = (minutes) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const pickRandomReminderCopy = (reminder, fallbackTitle) => {
  if (Array.isArray(reminder.variants) && reminder.variants.length) {
    return reminder.variants[randomInt(0, reminder.variants.length - 1)];
  }

  return {
    title: reminder.title || fallbackTitle,
    message: reminder.message || '',
    detailTemplate: reminder.detailTemplate || '现在是 {time}。',
  };
};

const createToiletReminderModule = ({
  userDataPath,
  loadAppSettings,
  saveAppSettings,
  getMainWindow,
  showActionReminder,
  activityLog,
}) => {
  const recordsPath = path.join(userDataPath, 'toilet-records.json');
  let reminderTimer = null;
  let laterTimer = null;
  let isShowingReminder = false;

  const loadToiletRecords = () => {
    if (!fs.existsSync(recordsPath)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
    } catch (error) {
      console.error('[toilet-records] 读取失败:', error.message);
      return {};
    }
  };

  const saveToiletRecords = (records) => {
    fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
  };

  const getReminderConfig = () => getConfig().reminder;

  const getMinGapMs = () => (getReminderConfig().minGapBetweenRemindersMinutes || 30) * 60 * 1000;

  const getToiletReminderEnabled = () => {
    const settings = loadAppSettings();
    if (typeof settings.toiletReminderEnabled === 'boolean') {
      return settings.toiletReminderEnabled;
    }

    return Boolean(getConfig().reminderDefaultEnabled);
  };

  const setToiletReminderEnabled = (enabled) => {
    const nextEnabled = Boolean(enabled);
    saveAppSettings({
      ...loadAppSettings(),
      toiletReminderEnabled: nextEnabled,
    });

    if (nextEnabled) {
      scheduleNextToiletReminder();
    } else {
      clearToiletReminderTimers();
    }

    return getToiletReminderEnabled();
  };

  const clearToiletReminderTimers = () => {
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = null;
    }

    if (laterTimer) {
      clearTimeout(laterTimer);
      laterTimer = null;
    }
  };

  const clearMainReminderTimer = () => {
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = null;
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
    const config = getReminderConfig();
    if (!config.useWorkdaySchedule) {
      return true;
    }

    return getDateMeta(date).isWorkday;
  };

  const parseTimeOnDate = (baseDate, timeText) => {
    const target = new Date(baseDate);
    const [hour, minute] = timeText.split(':').map(Number);
    target.setHours(hour, minute, 0, 0);
    return target;
  };

  const formatScheduledLabel = (target) =>
    `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;

  const isValidReminderTime = (date, config = getReminderConfig()) => {
    if (!shouldRemindToday(date)) {
      return false;
    }

    const hour = date.getHours();
    const minute = date.getMinutes();
    return (
      isWithinWorkHours(hour, minute, config.workHours) &&
      !isWithinBreak(hour, minute, config.breaks)
    );
  };

  const advancePastBreaksAndWorkEnd = (date, config = getReminderConfig()) => {
    let cursor = new Date(date);

    for (let attempt = 0; attempt < 48; attempt += 1) {
      if (!shouldRemindToday(cursor)) {
        return null;
      }

      const hour = cursor.getHours();
      const minute = cursor.getMinutes();

      if (!isWithinWorkHours(hour, minute, config.workHours)) {
        const workEnd = timeToMinutes(config.workHours.endTime);
        const current = hour * 60 + minute;
        if (current >= workEnd) {
          return null;
        }

        const [startHour, startMinute] = config.workHours.startTime.split(':').map(Number);
        cursor.setHours(startHour, startMinute, 0, 0);
        continue;
      }

      if (isWithinBreak(hour, minute, config.breaks)) {
        const activeBreak = config.breaks.find((breakItem) => {
          const breakStart = timeToMinutes(breakItem.startTime);
          const breakEnd = timeToMinutes(breakItem.endTime);
          const current = hour * 60 + minute;
          return current >= breakStart && current < breakEnd;
        });

        if (!activeBreak) {
          return cursor;
        }

        const [endHour, endMinute] = activeBreak.endTime.split(':').map(Number);
        cursor.setHours(endHour, endMinute, 0, 0);
        continue;
      }

      return cursor;
    }

    return null;
  };

  const randomFutureTimeInWindow = (baseDate, window, now, config = getReminderConfig()) => {
    const { workHours, breaks } = config;
    const windowStartMin = Math.max(timeToMinutes(window.startTime), timeToMinutes(workHours.startTime));
    const windowEndMin = Math.min(timeToMinutes(window.endTime), timeToMinutes(workHours.endTime));
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const effectiveStartMin = Math.max(windowStartMin, nowMin + 1);

    if (effectiveStartMin > windowEndMin) {
      return null;
    }

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const minuteValue = randomInt(effectiveStartMin, windowEndMin);
      const candidate = new Date(baseDate);
      candidate.setHours(Math.floor(minuteValue / 60), minuteValue % 60, 0, 0);
      if (candidate.getTime() > now.getTime() && isValidReminderTime(candidate, config)) {
        return candidate;
      }
    }

    return advancePastBreaksAndWorkEnd(new Date(now.getTime() + 60 * 1000), config);
  };

  const normalizeMissedBowelSlots = (date, schedule, now, config = getReminderConfig()) => {
    let changed = false;

    const markMissedIfPast = (timeKey, doneKey, window) => {
      if (schedule[doneKey] || !schedule[timeKey]) {
        return;
      }

      const scheduled = parseTimeOnDate(date, schedule[timeKey]);
      const windowEnd = parseTimeOnDate(date, window.endTime);

      if (now.getTime() >= windowEnd.getTime() || now.getTime() > scheduled.getTime()) {
        schedule[doneKey] = true;
        changed = true;
      }
    };

    markMissedIfPast('morningBowelTime', 'morningBowelDone', config.bowelWindows.morning);
    markMissedIfPast('afternoonBowelTime', 'afternoonBowelDone', config.bowelWindows.afternoon);

    return changed;
  };

  const getDayData = (dateKey, records = loadToiletRecords()) => {
    if (!records[dateKey]) {
      records[dateKey] = {
        schedule: {},
        records: [],
      };
    }

    if (!records[dateKey].schedule) {
      records[dateKey].schedule = {};
    }

    if (!Array.isArray(records[dateKey].records)) {
      records[dateKey].records = [];
    }

    return records[dateKey];
  };

  const getLastReminderTime = (dayData) => {
    const entries = dayData.records || [];
    if (!entries.length) {
      return 0;
    }

    return Math.max(...entries.map((entry) => new Date(entry.recordedAt).getTime()));
  };

  const scheduleNextUrinationTime = (fromDate, config = getReminderConfig()) => {
    const { urinationIntervalMinutes, workHours } = config;
    const delayMinutes = randomInt(
      urinationIntervalMinutes.min,
      urinationIntervalMinutes.max
    );
    let next = new Date(fromDate.getTime() + delayMinutes * 60 * 1000);
    next = advancePastBreaksAndWorkEnd(next, config);

    if (!next) {
      const tomorrow = new Date(fromDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(...workHours.startTime.split(':').map(Number), 0, 0);
      next = advancePastBreaksAndWorkEnd(
        new Date(tomorrow.getTime() + randomInt(urinationIntervalMinutes.min, urinationIntervalMinutes.max) * 60 * 1000),
        config
      );
    }

    return next;
  };

  const updateUrinationSchedule = (dateKey, fromDate, mode = 'random') => {
    const config = getReminderConfig();
    let next;

    if (mode === 'later') {
      const followUp = new Date(fromDate.getTime() + (config.laterDelayMinutes || 15) * 60 * 1000);
      next = advancePastBreaksAndWorkEnd(followUp, config);
    } else {
      next = scheduleNextUrinationTime(fromDate, config);
    }

    const allRecords = loadToiletRecords();
    const dayData = getDayData(dateKey, allRecords);
    dayData.schedule.nextUrinationAt = next ? next.toISOString() : null;
    allRecords[dateKey] = dayData;
    saveToiletRecords(allRecords);

    return next;
  };

  const ensureDaySchedule = (date = new Date()) => {
    const config = getReminderConfig();
    const dateKey = formatDateKey(date);
    const allRecords = loadToiletRecords();
    const dayData = getDayData(dateKey, allRecords);
    const schedule = dayData.schedule;
    const now = new Date();
    let changed = false;

    if (!shouldRemindToday(date)) {
      return dayData;
    }

    if (normalizeMissedBowelSlots(date, schedule, now, config)) {
      changed = true;
    }

    if (!schedule.morningBowelTime && !schedule.morningBowelDone) {
      const morningTime = randomFutureTimeInWindow(date, config.bowelWindows.morning, now, config);
      if (morningTime) {
        schedule.morningBowelTime = formatScheduledLabel(morningTime);
        schedule.morningBowelDone = false;
      } else {
        schedule.morningBowelDone = true;
      }
      changed = true;
    }

    if (!schedule.afternoonBowelTime && !schedule.afternoonBowelDone) {
      const afternoonTime = randomFutureTimeInWindow(date, config.bowelWindows.afternoon, now, config);
      if (afternoonTime) {
        schedule.afternoonBowelTime = formatScheduledLabel(afternoonTime);
        schedule.afternoonBowelDone = false;
      } else {
        schedule.afternoonBowelDone = true;
      }
      changed = true;
    }

    if (normalizeMissedBowelSlots(date, schedule, now, config)) {
      changed = true;
    }

    if (!schedule.nextUrinationAt) {
      const workStart = parseTimeOnDate(date, config.workHours.startTime);
      const workEnd = parseTimeOnDate(date, config.workHours.endTime);

      if (now.getTime() >= workEnd.getTime()) {
        schedule.nextUrinationAt = null;
      } else if (now.getTime() < workStart.getTime()) {
        schedule.nextUrinationAt = workStart.toISOString();
      } else {
        const next = scheduleNextUrinationTime(now, config);
        schedule.nextUrinationAt = next ? next.toISOString() : null;
      }
      changed = true;
    }

    if (changed) {
      allRecords[dateKey] = dayData;
      saveToiletRecords(allRecords);
    }

    return dayData;
  };

  const resolveGapConflicts = (candidates, lastReminderAtMs) => {
    const minGapMs = getMinGapMs();
    const sorted = [...candidates].sort((left, right) => left.time.getTime() - right.time.getTime());
    const resolved = [];
    let previousTime = lastReminderAtMs || 0;

    sorted.forEach((candidate) => {
      let nextTime = Math.max(candidate.time.getTime(), previousTime + (previousTime ? minGapMs : 0));
      let adjusted = advancePastBreaksAndWorkEnd(new Date(nextTime)) || new Date(nextTime);

      if (adjusted.getTime() < nextTime) {
        adjusted = new Date(nextTime);
      }

      resolved.push({
        ...candidate,
        time: adjusted,
      });
      previousTime = adjusted.getTime();
    });

    return resolved;
  };

  const buildCandidates = (date, dayData, now) => {
    const schedule = dayData.schedule;
    const candidates = [];

    if (!schedule.morningBowelDone && schedule.morningBowelTime) {
      candidates.push({
        type: 'bowel',
        period: 'morning',
        periodLabel: '上午',
        time: parseTimeOnDate(date, schedule.morningBowelTime),
      });
    }

    if (!schedule.afternoonBowelDone && schedule.afternoonBowelTime) {
      candidates.push({
        type: 'bowel',
        period: 'afternoon',
        periodLabel: '下午',
        time: parseTimeOnDate(date, schedule.afternoonBowelTime),
      });
    }

    if (schedule.nextUrinationAt) {
      candidates.push({
        type: 'urination',
        periodLabel: '小便',
        time: new Date(schedule.nextUrinationAt),
      });
    }

    const lastReminderAt = getLastReminderTime(dayData);
    const resolved = resolveGapConflicts(candidates, lastReminderAt);
    const minGapMs = getMinGapMs();

    return resolved
      .map((candidate) => {
        if (candidate.type === 'bowel' && candidate.time.getTime() <= now.getTime()) {
          return null;
        }

        if (candidate.type === 'urination' && candidate.time.getTime() <= now.getTime()) {
          const next = scheduleNextUrinationTime(now);
          if (!next) {
            return null;
          }

          return {
            ...candidate,
            time: next,
          };
        }

        if (candidate.time.getTime() <= now.getTime()) {
          const bumped = new Date(
            Math.max(now.getTime() + 1000, lastReminderAt + minGapMs)
          );
          return {
            ...candidate,
            time: advancePastBreaksAndWorkEnd(bumped) || bumped,
          };
        }

        return candidate;
      })
      .filter(Boolean)
      .filter((candidate) => candidate.time && isValidReminderTime(candidate.time));
  };

  const getNextReminderTarget = (fromDate = new Date()) => {
    if (!shouldRemindToday(fromDate)) {
      let cursor = new Date(fromDate);
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);

      for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
        if (shouldRemindToday(cursor)) {
          ensureDaySchedule(cursor);
          const dayData = getDayData(formatDateKey(cursor));
          const workStart = parseTimeOnDate(cursor, getReminderConfig().workHours.startTime);
          const candidates = buildCandidates(cursor, dayData, workStart);
          if (candidates.length) {
            return candidates[0];
          }
        }

        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 1);
      }

      return null;
    }

    const dayData = ensureDaySchedule(fromDate);
    const config = getReminderConfig();
    if (normalizeMissedBowelSlots(fromDate, dayData.schedule, fromDate, config)) {
      const dateKey = formatDateKey(fromDate);
      const allRecords = loadToiletRecords();
      allRecords[dateKey] = dayData;
      saveToiletRecords(allRecords);
    }
    const candidates = buildCandidates(fromDate, dayData, fromDate);
    if (candidates.length) {
      const first = candidates[0];
      if (first.type === 'urination' && first.time) {
        const nextIso = first.time.toISOString();
        if (dayData.schedule.nextUrinationAt !== nextIso) {
          dayData.schedule.nextUrinationAt = nextIso;
          const dateKey = formatDateKey(fromDate);
          const allRecords = loadToiletRecords();
          allRecords[dateKey] = dayData;
          saveToiletRecords(allRecords);
        }
      }
      return first;
    }

    let cursor = new Date(fromDate);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);

    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      if (shouldRemindToday(cursor)) {
        const nextDayData = ensureDaySchedule(cursor);
        const workStart = parseTimeOnDate(cursor, getReminderConfig().workHours.startTime);
        const nextCandidates = buildCandidates(cursor, nextDayData, workStart);
        if (nextCandidates.length) {
          return nextCandidates[0];
        }
      }

      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }

    return null;
  };

  const buildToiletLogSummary = (entry) => {
    const actionTextMap = {
      done: '已完成',
      later: '稍后提醒',
      skip: '跳过',
    };
    const typeTextMap = {
      urination: '小便',
      bowel: '大便',
    };
    const actionText = actionTextMap[entry.action] || entry.action;
    const typeText = typeTextMap[entry.reminderType] || entry.reminderType;
    const sourceText =
      entry.source === 'manual'
        ? '手动补录'
        : entry.source === 'later-follow-up'
          ? '稍后跟进'
          : '系统提醒';
    const timeLabel = entry.scheduledLabel ? `提醒 ${entry.scheduledLabel}` : '手动记录';
    const bowelStatusTextMap = {
      normal: '大便正常',
      constipation: '便秘',
      diarrhea: '腹泻',
      custom: '自定义',
    };
    const statusSuffix =
      entry.reminderType === 'bowel' && entry.bowelStatus
        ? entry.bowelStatus === 'custom' && entry.bowelCustomText
          ? ` · ${entry.bowelCustomText}`
          : ` · ${bowelStatusTextMap[entry.bowelStatus] || '大便正常'}`
        : '';

    const urinationStatusTextMap = {
      normal: '正常',
      odor: '小便异味',
      color_abnormal: '小便颜色异常',
    };
    const urinationColorTextMap = {
      deep_yellow: '深黄色',
      orange: '橙黄色',
      red: '红色/偏红',
      brown: '棕色',
      green: '绿色',
      cloudy: '浑浊发白',
    };
    let urinationSuffix = '';
    if (entry.reminderType === 'urination' && entry.urinationStatus) {
      if (entry.urinationStatus === 'color_abnormal' && entry.urinationColor) {
        urinationSuffix = ` · 颜色异常 · ${urinationColorTextMap[entry.urinationColor] || entry.urinationColor}`;
      } else {
        urinationSuffix = ` · ${urinationStatusTextMap[entry.urinationStatus] || '正常'}`;
      }
    }

    return `${timeLabel} · ${typeText} · ${actionText}${statusSuffix}${urinationSuffix}（${sourceText}）`;
  };

  const removeToiletRecord = (dateKey, recordId) => {
    const allRecords = loadToiletRecords();
    const dayData = getDayData(dateKey, allRecords);
    const target = dayData.records.find((entry) => entry.id === recordId);

    if (!target) {
      return { ok: false };
    }

    dayData.records = dayData.records.filter((entry) => entry.id !== recordId);
    allRecords[dateKey] = dayData;
    saveToiletRecords(allRecords);

    getMainWindow()?.webContents.send('toilet:record-deleted', {
      dateKey,
      recordId,
      record: target,
      schedule: dayData.schedule,
    });

    activityLog?.appendLog({
      category: 'toilet',
      action: 'delete',
      title: '删除如厕记录',
      summary: `已删除 ${dateKey} ${target.reminderType === 'bowel' ? '大便' : '小便'}记录`,
      detail: { dateKey, recordId, record: target },
    });

    return { ok: true, record: target };
  };

  const appendToiletRecord = (record) => {
    const dateKey = record.dateKey || formatDateKey(new Date());
    const allRecords = loadToiletRecords();
    const dayData = getDayData(dateKey, allRecords);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reminderType: record.reminderType,
      period: record.period || null,
      scheduledLabel: record.scheduledLabel || '',
      action: record.action,
      recordedAt: record.recordedAt || new Date().toISOString(),
      source: record.source || 'reminder',
      bowelStatus:
        record.reminderType === 'bowel' ? record.bowelStatus || 'normal' : null,
      bowelCustomText:
        record.reminderType === 'bowel' && record.bowelStatus === 'custom'
          ? String(record.bowelCustomText || '').trim()
          : null,
      urinationStatus:
        record.reminderType === 'urination' ? record.urinationStatus || 'normal' : null,
      urinationColor:
        record.reminderType === 'urination' && record.urinationStatus === 'color_abnormal'
          ? record.urinationColor || null
          : null,
    };

    dayData.records = [...dayData.records, entry];
    allRecords[dateKey] = dayData;
    saveToiletRecords(allRecords);

    getMainWindow()?.webContents.send('toilet:record', {
      dateKey,
      record: entry,
      schedule: dayData.schedule,
    });

    activityLog?.appendLog({
      category: 'toilet',
      action: entry.action,
      title: entry.source === 'manual' ? '手动如厕记录' : '如厕提醒',
      summary: buildToiletLogSummary(entry),
      detail: { dateKey, record: entry },
    });

    return entry;
  };

  const markReminderHandled = (dateKey, candidate, action) => {
    if (action === 'later') {
      return;
    }

    const allRecords = loadToiletRecords();
    const dayData = getDayData(dateKey, allRecords);
    const schedule = dayData.schedule;
    const now = new Date();

    if (candidate.type === 'bowel') {
      if (candidate.period === 'morning') {
        schedule.morningBowelDone = true;
      } else {
        schedule.afternoonBowelDone = true;
      }
      allRecords[dateKey] = dayData;
      saveToiletRecords(allRecords);
    } else if (candidate.type === 'urination' && (action === 'done' || action === 'skip')) {
      updateUrinationSchedule(dateKey, now, 'random');
    }
  };

  const processReminderResponse = (candidate, options, response) => {
    if (options.isTest) {
      return;
    }

    const target = candidate.time;
    const dateKey = formatDateKey(target);
    const scheduledLabel = formatScheduledLabel(target);

    if (response === REMINDER_TOAST.SNOOZE_TODAY) {
      snoozeReminderToday(loadAppSettings, saveAppSettings, 'toilet');
      activityLog?.appendLog({
        category: 'toilet',
        action: 'snooze-today',
        title: '如厕提醒',
        summary: '已设置今日不再提醒如厕',
        detail: { dateKey },
      });
      clearToiletReminderTimers();
      scheduleNextToiletReminder();
      return;
    }

    if (response === REMINDER_TOAST.CLOSED || response < 0) {
      if (candidate.type === 'urination') {
        updateUrinationSchedule(dateKey, new Date(), 'random');
      }
      scheduleNextToiletReminder();
      return;
    }

    const actionMap = ['done', 'later', 'skip'];
    const action = actionMap[response] || 'skip';

    appendToiletRecord({
      dateKey,
      reminderType: candidate.type,
      period: candidate.period || null,
      scheduledLabel,
      action,
      source: options.source || 'reminder',
    });

    if (action === 'later' && candidate.type === 'urination') {
      updateUrinationSchedule(dateKey, new Date(), 'later');
      scheduleNextToiletReminder();
      return;
    }

    markReminderHandled(dateKey, candidate, action);

    if (action === 'later' && !options.skipFollowUp) {
      scheduleLaterFollowUp(candidate);
    }

    scheduleNextToiletReminder();
  };

  const showToiletReminder = async (candidate, options = {}) => {
    if (!options.force && !getToiletReminderEnabled()) {
      return;
    }

    if (!options.force && isReminderSnoozedToday(loadAppSettings, 'toilet')) {
      scheduleNextToiletReminder();
      return;
    }

    if (isShowingReminder) {
      reminderTimer = setTimeout(() => {
        showToiletReminder(candidate, options);
      }, 3000);
      return;
    }

    isShowingReminder = true;

    try {
      const config = getReminderConfig();
      const target = candidate.time;
      const scheduledLabel = formatScheduledLabel(target);
      const reminderConfig = candidate.type === 'bowel' ? config.bowel : config.urination;
      const copy = pickRandomReminderCopy(
        reminderConfig,
        candidate.type === 'bowel' ? '大便提醒' : '小便提醒'
      );
      const detail = `${copy.message}\n\n${copy.detailTemplate
        .replace('{time}', scheduledLabel)
        .replace('{period}', candidate.periodLabel || '')
        .replace('{interval}', String(randomInt(config.urinationIntervalMinutes.min, config.urinationIntervalMinutes.max)))}`;

      const response = await showActionReminder({
        title: options.isTest ? `[预览] ${copy.title}` : copy.title,
        body: detail,
        buttons: reminderConfig.buttons,
        cancelIndex: 2,
        theme: candidate.type === 'bowel' ? 'toilet-bowel' : 'toilet-urination',
        meta: {
          time: scheduledLabel,
          period: candidate.periodLabel || '',
        },
        messageTracking: {
          category: 'toilet',
          kind: candidate.type,
          isTest: Boolean(options.isTest),
        },
      });

      setImmediate(() => {
        try {
          processReminderResponse(candidate, options, response);
        } catch (error) {
          console.error('[toilet-reminder] 处理提醒响应失败:', error);
          scheduleNextToiletReminder();
        } finally {
          isShowingReminder = false;
        }
      });
    } catch (error) {
      console.error('[toilet-reminder] 显示提醒失败:', error);
      scheduleNextToiletReminder();
      isShowingReminder = false;
    }
  };

  const scheduleLaterFollowUp = (originalCandidate) => {
    const config = getReminderConfig();
    const delayMinutes = config.laterDelayMinutes || 15;
    const followUp = new Date();
    followUp.setMinutes(followUp.getMinutes() + delayMinutes);
    const adjusted = advancePastBreaksAndWorkEnd(followUp);

    if (!adjusted || !shouldRemindToday(adjusted)) {
      return;
    }

    if (laterTimer) {
      clearTimeout(laterTimer);
    }

    const delayMs = adjusted.getTime() - Date.now();
    laterTimer = setTimeout(() => {
      laterTimer = null;
      showToiletReminder(
        {
          ...originalCandidate,
          time: adjusted,
        },
        { source: 'later-follow-up', skipFollowUp: true }
      );
    }, Math.max(delayMs, 1000));
  };

  const scheduleNextToiletReminder = () => {
    clearMainReminderTimer();

    if (!getToiletReminderEnabled()) {
      return;
    }

    if (isReminderSnoozedToday(loadAppSettings, 'toilet')) {
      const delayMs = msUntilSnoozeExpires(loadAppSettings, 'toilet');
      if (delayMs > 0) {
        reminderTimer = setTimeout(() => {
          reminderTimer = null;
          scheduleNextToiletReminder();
        }, delayMs);
      }
      return;
    }

    const target = getNextReminderTarget(new Date());
    if (!target) {
      return;
    }

    const delayMs = target.time.getTime() - Date.now();
    reminderTimer = setTimeout(() => {
      reminderTimer = null;
      showToiletReminder(target);
    }, Math.max(delayMs, 1000));

    console.log(
      `[toilet-reminder] 下次提醒: ${target.type} ${target.periodLabel || ''} @ ${target.time.toLocaleString()}`
    );
  };

  const showTestReminder = (type = 'urination') => {
    const now = new Date();
    showToiletReminder(
      {
        type,
        period: type === 'bowel' ? 'morning' : null,
        periodLabel: type === 'bowel' ? '上午' : '小便',
        time: now,
      },
      { force: true, isTest: true }
    );
  };

  return {
    loadToiletRecords,
    appendToiletRecord,
    removeToiletRecord,
    getToiletReminderEnabled,
    setToiletReminderEnabled,
    scheduleNextToiletReminder,
    clearToiletReminderTimers,
    ensureDaySchedule,
    showTestReminder,
    getDayScheduleSummary: (dateKey = formatDateKey(new Date())) => {
      const dayData = ensureDaySchedule(new Date(`${dateKey}T12:00:00`));
      return dayData.schedule;
    },
  };
};

module.exports = { createToiletReminderModule };
