import { APP_RULES_CONFIG, getDateMeta } from '../data/workCalendar';
import { getBreakOverlapMinutes, workdayRule } from './performance';
import { sumLeavePeriodHoursForRecord } from './leavePeriods';
import { formatHours, timeToMinutes } from './time';

const attendanceRule = APP_RULES_CONFIG.performance.workday.attendance;

const getAdjustedLateMinutes = (scheduledStartTime, checkInTime) => {
  const schedMinutes = timeToMinutes(scheduledStartTime);
  const checkInMinutes = timeToMinutes(checkInTime);

  if (checkInMinutes <= schedMinutes) {
    return 0;
  }

  const grossMinutes = checkInMinutes - schedMinutes;
  const breakMinutes = getBreakOverlapMinutes(
    schedMinutes,
    checkInMinutes,
    workdayRule.breaks
  );

  return Math.max(0, grossMinutes - breakMinutes);
};

const getLateDerivedLeaveHours = (lateMinutes) => {
  if (lateMinutes <= attendanceRule.lateMaxMinutes) {
    return 0;
  }

  const leaveUnits = Math.ceil(lateMinutes / attendanceRule.leaveUnitMinutes);
  return leaveUnits * attendanceRule.leaveUnitHours;
};

export const buildAttendanceStatusText = (lateMinutes, status) => {
  if (status === 'late' || status === 'freeLate') {
    if (lateMinutes === attendanceRule.freeLateMaxMinutes) {
      return '免费迟到时间管理大师';
    }

    if (lateMinutes === attendanceRule.lateMaxMinutes) {
      return '天选之子';
    }

    if (status === 'freeLate') {
      return `免费迟到 ${lateMinutes} 分钟`;
    }

    return `迟到 ${lateMinutes} 分钟`;
  }

  return '';
};

const buildCombinedAttendanceText = (lateMinutes, totalLeaveHours) => {
  const parts = [];

  if (
    lateMinutes > 0 &&
    lateMinutes <= attendanceRule.lateMaxMinutes &&
    getLateDerivedLeaveHours(lateMinutes) === 0
  ) {
    parts.push(buildAttendanceStatusText(lateMinutes, 'late'));
  }

  if (totalLeaveHours > 0) {
    parts.push(`请假 ${formatHours(totalLeaveHours)} h`);
  }

  if (!parts.length) {
    return '正常';
  }

  return parts.join(' · ');
};

export const createAttendanceBase = (dateKey, record) => {
  const day = getDateMeta(new Date(`${dateKey}T00:00:00`));
  if (!day.isWorkday || !record) {
    return null;
  }

  const checkInTime =
    record.attendance?.checkInTime || record.startTime || attendanceRule.scheduledStartTime;
  const lateMinutes = getAdjustedLateMinutes(attendanceRule.scheduledStartTime, checkInTime);
  const periodLeaveHours = sumLeavePeriodHoursForRecord(record);
  const lateLeaveHours = getLateDerivedLeaveHours(lateMinutes);
  const totalLeaveHours = lateLeaveHours + periodLeaveHours;

  if (lateMinutes <= 0 && totalLeaveHours <= 0) {
    return {
      status: 'normal',
      checkInTime,
      lateMinutes: 0,
      leaveHours: 0,
      periodLeaveHours,
      text: '正常',
      type: 'success',
    };
  }

  if (totalLeaveHours > 0) {
    return {
      status: 'leave',
      checkInTime,
      lateMinutes,
      leaveHours: totalLeaveHours,
      periodLeaveHours,
      text: buildCombinedAttendanceText(lateMinutes, totalLeaveHours),
      type: 'danger',
    };
  }

  return {
    status: 'late',
    checkInTime,
    lateMinutes,
    leaveHours: 0,
    periodLeaveHours: 0,
    freeCandidate: lateMinutes <= attendanceRule.freeLateMaxMinutes,
    text: buildAttendanceStatusText(lateMinutes, 'late'),
    type: 'warning',
  };
};

export const getMonthlyAttendanceDetails = (month, performanceRecords) => {
  const monthText = `${APP_RULES_CONFIG.calendar.year}-${String(month + 1).padStart(2, '0')}`;
  const entries = Object.entries(performanceRecords)
    .filter(([date]) => date.startsWith(monthText))
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate));
  const details = {};
  let freeLateUsed = 0;

  entries.forEach(([date, record]) => {
    const detail = createAttendanceBase(date, record);
    if (!detail) {
      return;
    }

    if (
      detail.status === 'late' &&
      detail.freeCandidate &&
      freeLateUsed < attendanceRule.freeLateTimesPerMonth
    ) {
      freeLateUsed += 1;
      details[date] = {
        ...detail,
        status: 'freeLate',
        freeLate: true,
        text: buildAttendanceStatusText(detail.lateMinutes, 'freeLate'),
        type: 'info',
      };
      return;
    }

    details[date] = detail;
  });

  return details;
};

export const getAttendanceDetail = (dateKey, selectedMonth, performanceRecords) => {
  const month = Number(dateKey.slice(5, 7)) - 1;
  if (month === selectedMonth) {
    return getMonthlyAttendanceDetails(month, performanceRecords)[dateKey] || null;
  }

  return getMonthlyAttendanceDetails(month, performanceRecords)[dateKey] || null;
};

export { attendanceRule };
