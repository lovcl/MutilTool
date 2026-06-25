import { APP_RULES_CONFIG } from '../data/workCalendar';
import {
  getRecordDayMode,
  getRecordDayModeHours,
  getRecordPerformanceHours,
  isDayPerformanceExcluded,
  normalizeDayMode,
} from './performance';
import {
  getEffectiveLeavePeriods,
  mergeEarlyCheckoutLeavePeriods,
  normalizeLeavePeriods,
} from './leavePeriods';
import { minutesToTime, timeToMinutes } from './time';

const attendanceRule = APP_RULES_CONFIG.performance.workday.attendance;

export const formatNowTime = (date = new Date()) =>
  minutesToTime(date.getHours() * 60 + date.getMinutes());

export const isOnLeave = (record) => record?.punchPhase === 'away';

export const hasClockIn = (record) =>
  Boolean(record && (record.startTime || record.attendance?.checkInTime));

export const isWaitingClockOut = (record) => {
  if (!record || !hasClockIn(record)) {
    return false;
  }

  if (isOnLeave(record)) {
    return false;
  }

  if (record.punchPhase === 'in') {
    return true;
  }

  const startTime = record.attendance?.checkInTime || record.startTime;
  const endTime = record.endTime;

  if (!endTime || startTime === endTime) {
    return true;
  }

  return Number(record.hours || 0) === 0 && startTime === endTime;
};

export const getHomePunchLabel = (record) => {
  if (!record || !hasClockIn(record)) {
    return '上班打卡';
  }

  if (isWaitingClockOut(record)) {
    return '下班打卡';
  }

  return '更新下班打卡';
};

export const getLeavePunchLabel = (record) => {
  if (!record || !hasClockIn(record)) {
    return null;
  }

  if (isOnLeave(record)) {
    return '返岗打卡';
  }

  if (record.punchPhase === 'out') {
    return null;
  }

  return '离岗打卡';
};

export const canPerformHomePunch = (record) => !isOnLeave(record);

export const buildClockInRecord = (nowTime) => ({
  startTime: nowTime,
  endTime: nowTime,
  hours: 0,
  punchPhase: 'in',
  dayMode: normalizeDayMode(),
  attendance: {
    checkInTime: nowTime,
    scheduledStartTime: attendanceRule.scheduledStartTime,
  },
  source: 'home-punch',
});

export const buildClockOutRecord = (day, existingRecord, nowTime) => {
  const startTime = existingRecord.attendance?.checkInTime || existingRecord.startTime;
  const hours = Number(getRecordPerformanceHours(day, startTime, nowTime).toFixed(1));
  const attendance = {
    ...(existingRecord.attendance || {
      checkInTime: startTime,
      scheduledStartTime: attendanceRule.scheduledStartTime,
    }),
    leavePeriods: mergeEarlyCheckoutLeavePeriods(
      existingRecord.attendance?.leavePeriods,
      nowTime,
      existingRecord
    ),
    pendingLeaveStart: undefined,
  };

  return {
    ...existingRecord,
    startTime,
    endTime: nowTime,
    hours,
    punchPhase: 'out',
    dayMode: getRecordDayMode(existingRecord),
    attendance,
    source: existingRecord.source || 'home-punch',
  };
};

export const buildMidDayLeaveStart = (day, existingRecord, nowTime) => {
  const startTime = existingRecord.attendance?.checkInTime || existingRecord.startTime;
  const hours = Number(getRecordPerformanceHours(day, startTime, nowTime).toFixed(1));

  return {
    ...existingRecord,
    startTime,
    endTime: nowTime,
    hours,
    punchPhase: 'away',
    dayMode: getRecordDayMode(existingRecord),
    attendance: {
      ...existingRecord.attendance,
      checkInTime: startTime,
      scheduledStartTime: attendanceRule.scheduledStartTime,
      pendingLeaveStart: nowTime,
      leavePeriods: normalizeLeavePeriods(existingRecord.attendance?.leavePeriods),
    },
    source: existingRecord.source || 'home-punch',
  };
};

export const buildReturnFromLeave = (day, existingRecord, nowTime) => {
  const startTime = existingRecord.attendance?.checkInTime || existingRecord.startTime;
  const pendingLeaveStart = existingRecord.attendance?.pendingLeaveStart;
  const leavePeriods = normalizeLeavePeriods(existingRecord.attendance?.leavePeriods || []);

  if (pendingLeaveStart && timeToMinutes(nowTime) > timeToMinutes(pendingLeaveStart)) {
    leavePeriods.push({ startTime: pendingLeaveStart, endTime: nowTime });
  }

  const normalizedPeriods = normalizeLeavePeriods(leavePeriods);
  const hours = Number(getRecordPerformanceHours(day, startTime, nowTime).toFixed(1));

  return {
    ...existingRecord,
    startTime,
    endTime: nowTime,
    hours,
    punchPhase: 'in',
    dayMode: getRecordDayMode(existingRecord),
    attendance: {
      ...existingRecord.attendance,
      checkInTime: startTime,
      scheduledStartTime: attendanceRule.scheduledStartTime,
      leavePeriods: normalizedPeriods,
      pendingLeaveStart: undefined,
    },
    source: existingRecord.source || 'home-punch',
  };
};

export const getDisplayPunchTimes = (record) => {
  if (!record || !hasClockIn(record)) {
    return { checkInTime: '--:--', checkOutTime: '--:--' };
  }

  const checkInTime = record.attendance?.checkInTime || record.startTime || '--:--';

  if (isOnLeave(record)) {
    return {
      checkInTime,
      checkOutTime: record.attendance?.pendingLeaveStart || record.endTime || '--:--',
    };
  }

  const checkOutTime =
    isWaitingClockOut(record) || !record.endTime ? '--:--' : record.endTime;

  return { checkInTime, checkOutTime };
};

export const resolveDayRecordForm = (day, existingRecord, defaults) => {
  const { workdayDefaultRecord, restdayDefaultRecord } = defaults;

  if (!existingRecord) {
    const base = day.isWorkday ? { ...workdayDefaultRecord } : { ...restdayDefaultRecord };
    return { ...base, dayMode: normalizeDayMode(base.dayMode), leavePeriods: [] };
  }

  const dayMode = getRecordDayMode(existingRecord);
  const startTime = existingRecord.attendance?.checkInTime || existingRecord.startTime;
  const endTime = existingRecord.endTime;
  const hours = Number(
    getRecordDayModeHours(day, startTime, endTime, dayMode).toFixed(1)
  );
  const leavePeriods = getEffectiveLeavePeriods(existingRecord);

  if (isDayPerformanceExcluded(dayMode)) {
    return { ...existingRecord, dayMode, hours, leavePeriods };
  }

  if (!day.isWorkday) {
    return { ...existingRecord, dayMode, hours, leavePeriods };
  }

  if (isWaitingClockOut(existingRecord)) {
    return {
      ...existingRecord,
      dayMode,
      startTime,
      endTime: workdayDefaultRecord.endTime,
      leavePeriods,
      hours: Number(
        getRecordDayModeHours(
          day,
          startTime,
          workdayDefaultRecord.endTime,
          dayMode
        ).toFixed(1)
      ),
    };
  }

  return { ...existingRecord, dayMode, hours, leavePeriods };
};
