import { APP_RULES_CONFIG, getDateMeta } from '../data/workCalendar';
import { floorMinutesToStep, minutesToTime, timeToMinutes } from './time';

const performanceRules = APP_RULES_CONFIG.performance;
const workdayRule = performanceRules.workday;
const restdayRule = performanceRules.restday;

export const PERFORMANCE_HOURS_PER_WORKDAY = performanceRules.targetHoursPerWorkday;
export const PERFORMANCE_HOUR_QUANTIZE_STEP = performanceRules.hourQuantizeStep ?? 0.5;
export const DAY_MODES = {
  OVERTIME: 'overtime',
  SETTLEMENT: 'settlement',
  COMP_LEAVE: 'compLeave',
};
export const DAY_MODE_OPTIONS = [
  { value: DAY_MODES.OVERTIME, label: '额外出勤' },
  { value: DAY_MODES.SETTLEMENT, label: '结算' },
  { value: DAY_MODES.COMP_LEAVE, label: '调休' },
];
export const workdayDefaultRecord = {
  ...workdayRule.defaultRecord,
  dayMode: DAY_MODES.OVERTIME,
};
export const restdayDefaultRecord = {
  ...restdayRule.defaultRecord,
  dayMode: DAY_MODES.OVERTIME,
};
export const workdayQuickHours = workdayRule.quickHours;

const restdayQuickHourConfig = restdayRule.quickHours;
export const restdayQuickHours = Array.from(
  {
    length:
      Math.floor((restdayQuickHourConfig.max - restdayQuickHourConfig.min) / restdayQuickHourConfig.step) + 1,
  },
  (_, index) => restdayQuickHourConfig.min + index * restdayQuickHourConfig.step
);

export const formatBreaks = (breaks) =>
  breaks.map((breakItem) => `${breakItem.name} ${breakItem.startTime} - ${breakItem.endTime}`).join('，');

/** 绩效/加班小时按 step 向下取整，不足 step 的部分不计入。 */
export const quantizePerformanceHours = (hours) => {
  const step = PERFORMANCE_HOUR_QUANTIZE_STEP;
  if (!Number.isFinite(hours) || hours <= 0 || step <= 0) {
    return 0;
  }

  return Math.floor(hours / step + 1e-9) * step;
};

export const isDayPerformanceExcluded = (mode) =>
  mode === DAY_MODES.SETTLEMENT || mode === DAY_MODES.COMP_LEAVE;

export const getDayModeLabel = (mode) =>
  DAY_MODE_OPTIONS.find((option) => option.value === mode)?.label || '额外出勤';

export const normalizeDayMode = (mode) =>
  DAY_MODE_OPTIONS.some((option) => option.value === mode) ? mode : DAY_MODES.OVERTIME;

const DAY_MODE_TEXT_MAP = {
  额外出勤: DAY_MODES.OVERTIME,
  结算: DAY_MODES.SETTLEMENT,
  调休: DAY_MODES.COMP_LEAVE,
  overtime: DAY_MODES.OVERTIME,
  settlement: DAY_MODES.SETTLEMENT,
  compLeave: DAY_MODES.COMP_LEAVE,
};

export const normalizeDayModeFromText = (value) => {
  const text = String(value ?? '').trim();
  if (!text) {
    return DAY_MODES.OVERTIME;
  }

  if (DAY_MODE_TEXT_MAP[text]) {
    return DAY_MODE_TEXT_MAP[text];
  }

  return normalizeDayMode(text);
};

export const getRecordDayMode = (record) =>
  normalizeDayModeFromText(record?.dayMode ?? record?.restdayMode);

import { normalizeLeavePeriods, stripAutoEarlyCheckoutLeavePeriods } from './leavePeriods';

export const normalizePerformanceRecord = (record) => {
  if (!record) {
    return record;
  }

  const normalized = {
    ...record,
    dayMode: getRecordDayMode(record),
  };

  if (normalized.attendance) {
    normalized.attendance = {
      ...normalized.attendance,
      leavePeriods: normalizeLeavePeriods(normalized.attendance.leavePeriods),
    };
  }

  return normalized;
};

export const normalizePerformanceRecordsMap = (records = {}) =>
  Object.fromEntries(
    Object.entries(records).map(([dateKey, record]) => [
      dateKey,
      normalizePerformanceRecord(record),
    ])
  );

export const getBreakOverlapMinutes = (startMinutes, endMinutes, breaks) =>
  breaks.reduce((total, breakItem) => {
    const breakStart = timeToMinutes(breakItem.startTime);
    const breakEnd = timeToMinutes(breakItem.endTime);
    return total + Math.max(0, Math.min(endMinutes, breakEnd) - Math.max(startMinutes, breakStart));
  }, 0);

export const getEffectiveHours = (startTime, endTime, breaks = []) => {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const totalMinutes = Math.max(0, endMinutes - startMinutes);
  const breakMinutes = getBreakOverlapMinutes(startMinutes, endMinutes, breaks);

  return quantizePerformanceHours(Math.max(0, (totalMinutes - breakMinutes) / 60));
};

const getRestdayScheduledStartMinutes = () =>
  timeToMinutes(restdayRule.scheduledStartTime || workdayRule.attendance.scheduledStartTime);

const getRestdayPerformanceBounds = (startTime, endTime) => {
  const stepMinutes = PERFORMANCE_HOUR_QUANTIZE_STEP * 60;
  const startMinutes = Math.max(timeToMinutes(startTime), getRestdayScheduledStartMinutes());
  const endMinutes = floorMinutesToStep(timeToMinutes(endTime), stepMinutes);

  return { startMinutes, endMinutes };
};

export const getRestdayPerformanceHours = (startTime, endTime, breaks = restdayRule.breaks) => {
  const { startMinutes, endMinutes } = getRestdayPerformanceBounds(startTime, endTime);
  const totalMinutes = Math.max(0, endMinutes - startMinutes);
  const breakMinutes = getBreakOverlapMinutes(startMinutes, endMinutes, breaks);

  return quantizePerformanceHours(Math.max(0, (totalMinutes - breakMinutes) / 60));
};

export const getRestdayPerformanceTimes = (startTime, endTime) => {
  const { startMinutes, endMinutes } = getRestdayPerformanceBounds(startTime, endTime);

  return {
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
  };
};

export const getWorkdayPerformanceHours = (startTime, endTime) => {
  const performanceStartMinutes = timeToMinutes(workdayRule.performanceStartTime);
  const startMinutes = Math.max(timeToMinutes(startTime), performanceStartMinutes);
  const endMinutes = timeToMinutes(endTime);

  return quantizePerformanceHours(Math.max(0, (endMinutes - startMinutes) / 60));
};

/** 工作日结算/调休：忽略上班时间，仅从 19:00 计到下班。 */
export const getWorkdaySettlementHours = (endTime) => {
  const performanceStartMinutes = timeToMinutes(workdayRule.performanceStartTime);
  const endMinutes = timeToMinutes(endTime);

  return quantizePerformanceHours(Math.max(0, (endMinutes - performanceStartMinutes) / 60));
};

const getRestdaySettlementBreaks = () => restdayRule.breaks;

const getRestdaySettlementBounds = (startTime, endTime) => {
  const stepMinutes = PERFORMANCE_HOUR_QUANTIZE_STEP * 60;

  return {
    startMinutes: timeToMinutes(startTime),
    endMinutes: floorMinutesToStep(timeToMinutes(endTime), stepMinutes),
  };
};

/** 休息日结算/调休：按实际打卡时段计，扣除午休与晚休 1 小时。 */
export const getRestdaySettlementHours = (startTime, endTime, breaks = getRestdaySettlementBreaks()) => {
  const { startMinutes, endMinutes } = getRestdaySettlementBounds(startTime, endTime);
  const totalMinutes = Math.max(0, endMinutes - startMinutes);
  const breakMinutes = getBreakOverlapMinutes(startMinutes, endMinutes, breaks);

  return quantizePerformanceHours(Math.max(0, (totalMinutes - breakMinutes) / 60));
};

export const getRecordPerformanceHours = (day, startTime, endTime) => {
  if (day?.isWorkday) {
    return getWorkdayPerformanceHours(startTime, endTime);
  }

  return getRestdayPerformanceHours(startTime, endTime, restdayRule.breaks);
};

export const getRecordDayModeHours = (day, startTime, endTime, mode) => {
  const normalizedMode = normalizeDayMode(mode);

  if (isDayPerformanceExcluded(normalizedMode)) {
    if (day?.isWorkday) {
      return getWorkdaySettlementHours(endTime);
    }

    return getRestdaySettlementHours(startTime, endTime);
  }

  return getRecordPerformanceHours(day, startTime, endTime);
};

export const resolveRecordDisplayHours = (dateKey, record) => {
  if (!record) {
    return 0;
  }

  const startTime = record.attendance?.checkInTime || record.startTime;
  const endTime = record.endTime;

  if (!startTime || !endTime) {
    return Number(record.hours || 0);
  }

  const day = getDateMeta(new Date(`${dateKey}T00:00:00`));
  return getRecordDayModeHours(day, startTime, endTime, getRecordDayMode(record));
};

export const resolveRecordPerformanceHours = (dateKey, record) => {
  if (!record) {
    return 0;
  }

  const day = getDateMeta(new Date(`${dateKey}T00:00:00`));

  if (isDayPerformanceExcluded(getRecordDayMode(record))) {
    return 0;
  }

  const startTime = record.attendance?.checkInTime || record.startTime;
  const endTime = record.endTime;

  if (!startTime || !endTime) {
    return Number(record.hours || 0);
  }

  return getRecordPerformanceHours(day, startTime, endTime);
};

export const getEndTimeByEffectiveHours = (startTime, hours, breaks = []) => {
  let cursor = timeToMinutes(startTime);
  let remainingMinutes = Math.round(hours * 60);

  while (remainingMinutes > 0 && cursor < 1440) {
    const isBreakMinute = breaks.some((breakItem) => {
      const breakStart = timeToMinutes(breakItem.startTime);
      const breakEnd = timeToMinutes(breakItem.endTime);
      return cursor >= breakStart && cursor < breakEnd;
    });

    if (!isBreakMinute) {
      remainingMinutes -= 1;
    }

    cursor += 1;
  }

  return minutesToTime(cursor);
};

export const createEarlyPunchReminderRecord = (day, existingRecord) => {
  const normalEndTime = workdayRule.normalWork.endTime;
  const startTime =
    existingRecord?.attendance?.checkInTime ||
    existingRecord?.startTime ||
    workdayDefaultRecord.startTime;
  const leavePeriods = stripAutoEarlyCheckoutLeavePeriods(
    existingRecord?.attendance?.leavePeriods
  );

  return {
    ...(existingRecord || workdayDefaultRecord),
    startTime,
    endTime: normalEndTime,
    hours: existingRecord ? Number(existingRecord.hours || 0) : 0,
    punchPhase: 'out',
    dayMode: getRecordDayMode(existingRecord),
    attendance: {
      ...(existingRecord?.attendance || {}),
      checkInTime: startTime,
      scheduledStartTime: workdayRule.attendance.scheduledStartTime,
      leavePeriods,
      checkoutViaReminder: 'early',
      pendingLeaveStart: undefined,
    },
    source: existingRecord?.source || 'reminder',
  };
};

export const createPunchReminderRecord = (day, punchTime, kind, existingRecord) => {
  if (!day.isWorkday) {
    return {
      ...restdayDefaultRecord,
      source: 'reminder',
    };
  }

  if (kind === 'early') {
    return createEarlyPunchReminderRecord(day, existingRecord);
  }

  if (workdayRule.nonPerformancePunchTimes.includes(punchTime)) {
    return null;
  }

  return {
    ...workdayDefaultRecord,
    endTime: punchTime,
    hours: getWorkdayPerformanceHours(workdayDefaultRecord.startTime, punchTime),
    attendance: {
      checkInTime: workdayDefaultRecord.startTime,
      scheduledStartTime: workdayRule.attendance.scheduledStartTime,
    },
    source: 'reminder',
  };
};

export const createReminderRecord = (day, punchTime, kind, existingRecord) =>
  createPunchReminderRecord(day, punchTime, kind, existingRecord);

export { workdayRule, restdayRule, performanceRules };
