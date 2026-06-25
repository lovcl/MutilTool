import { APP_RULES_CONFIG } from '../data/workCalendar';
import { getBreakOverlapMinutes, workdayRule } from './performance';
import { timeToMinutes } from './time';

const attendanceRule = APP_RULES_CONFIG.performance.workday.attendance;
const workdayBreaks = APP_RULES_CONFIG.performance.workday.breaks;

const getNormalWorkEndTime = () => workdayRule.normalWork.endTime;

const isValidTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ''));

export const normalizeLeavePeriod = (period) => {
  if (!period || typeof period !== 'object') {
    return null;
  }

  const startTime = String(period.startTime || '').trim();
  const endTime = String(period.endTime || '').trim();

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return null;
  }

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return null;
  }

  return { startTime, endTime };
};

export const normalizeLeavePeriods = (periods) => {
  if (!Array.isArray(periods)) {
    return [];
  }

  return periods.map((period) => normalizeLeavePeriod(period)).filter(Boolean);
};

export const getLeavePeriodEffectiveMinutes = (startTime, endTime, breaks = workdayBreaks) => {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    return 0;
  }

  const grossMinutes = endMinutes - startMinutes;
  const breakMinutes = getBreakOverlapMinutes(startMinutes, endMinutes, breaks);

  return Math.max(0, grossMinutes - breakMinutes);
};

export const getLeavePeriodHours = (startTime, endTime, breaks = workdayBreaks) => {
  const minutes = getLeavePeriodEffectiveMinutes(startTime, endTime, breaks);

  if (minutes <= 0) {
    return 0;
  }

  const leaveUnits = Math.ceil(minutes / attendanceRule.leaveUnitMinutes);
  return leaveUnits * attendanceRule.leaveUnitHours;
};

export const sumLeavePeriodHours = (periods, breaks = workdayBreaks) => {
  return normalizeLeavePeriods(periods).reduce(
    (sum, period) => sum + getLeavePeriodHours(period.startTime, period.endTime, breaks),
    0
  );
};

export const isEarlyCheckoutTime = (endTime) => {
  if (!isValidTime(endTime)) {
    return false;
  }

  const endMinutes = timeToMinutes(endTime);
  const normalEndMinutes = timeToMinutes(getNormalWorkEndTime());

  return endMinutes > 0 && endMinutes < normalEndMinutes;
};

export const isLeaveIntervalCovered = (periods, startTime, endTime) => {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  return normalizeLeavePeriods(periods).some((period) => {
    return (
      timeToMinutes(period.startTime) <= startMinutes &&
      timeToMinutes(period.endTime) >= endMinutes
    );
  });
};

export const buildEarlyCheckoutLeavePeriod = (checkoutEndTime) => {
  if (!isEarlyCheckoutTime(checkoutEndTime)) {
    return null;
  }

  return {
    startTime: checkoutEndTime,
    endTime: getNormalWorkEndTime(),
  };
};

export const stripAutoEarlyCheckoutLeavePeriods = (periods) => {
  const normalEndTime = getNormalWorkEndTime();
  const normalEndMinutes = timeToMinutes(normalEndTime);

  return normalizeLeavePeriods(periods).filter((period) => {
    if (period.endTime !== normalEndTime) {
      return true;
    }

    return timeToMinutes(period.startTime) >= normalEndMinutes;
  });
};

export const isExemptFromEarlyCheckoutLeave = (record) =>
  record?.attendance?.checkoutViaReminder === 'early';

export const mergeEarlyCheckoutLeavePeriods = (periods, checkoutEndTime, record) => {
  if (record && isExemptFromEarlyCheckoutLeave(record)) {
    return normalizeLeavePeriods(periods);
  }

  const normalized = normalizeLeavePeriods(periods);
  const earlyPeriod = buildEarlyCheckoutLeavePeriod(checkoutEndTime);

  if (!earlyPeriod || isLeaveIntervalCovered(normalized, earlyPeriod.startTime, earlyPeriod.endTime)) {
    return normalized;
  }

  return normalizeLeavePeriods([...normalized, earlyPeriod]);
};

export const getEffectiveLeavePeriods = (record) => {
  const periods = normalizeLeavePeriods(record?.attendance?.leavePeriods);

  if (record?.punchPhase === 'away' || record?.attendance?.pendingLeaveStart) {
    return periods;
  }

  if (isExemptFromEarlyCheckoutLeave(record)) {
    return periods;
  }

  const checkoutEndTime = record?.endTime;
  if (!checkoutEndTime) {
    return periods;
  }

  const checkInTime = record?.attendance?.checkInTime || record?.startTime;
  const isPlaceholderCheckout =
    checkInTime === checkoutEndTime && Number(record?.hours || 0) === 0;

  if (record?.punchPhase === 'in' || isPlaceholderCheckout) {
    return periods;
  }

  return mergeEarlyCheckoutLeavePeriods(periods, checkoutEndTime);
};

export const sumLeavePeriodHoursForRecord = (record) =>
  sumLeavePeriodHours(getEffectiveLeavePeriods(record));

export const createDefaultLeavePeriod = () => ({
  startTime: '10:00',
  endTime: '12:00',
});

export const formatLeavePeriodLabel = (period, breaks = workdayBreaks) => {
  const normalized = normalizeLeavePeriod(period);
  if (!normalized) {
    return '';
  }

  const hours = getLeavePeriodHours(normalized.startTime, normalized.endTime, breaks);
  return `${normalized.startTime} - ${normalized.endTime}（约 ${hours} h）`;
};
