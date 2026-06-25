import { formatDateKey, getDateMeta } from '../data/workCalendar';
import { usePerformanceRecords } from './usePerformanceRecords';
import {
  buildClockInRecord,
  buildClockOutRecord,
  buildMidDayLeaveStart,
  buildReturnFromLeave,
  formatNowTime,
  getHomePunchLabel,
  getLeavePunchLabel,
  hasClockIn,
  isOnLeave,
  isWaitingClockOut,
} from '../utils/homePunch';

export function useHomePunch() {
  const { performanceRecords, savePerformanceRecord } = usePerformanceRecords();

  const performHomePunch = () => {
    const now = new Date();
    const day = getDateMeta(now);
    const dateKey = formatDateKey(now);

    if (!day.isWorkday) {
      return { ok: false, message: '今日非工作日，无需打卡' };
    }

    const existing = performanceRecords.value[dateKey];
    const nowTime = formatNowTime(now);

    if (!existing || !hasClockIn(existing)) {
      savePerformanceRecord(dateKey, buildClockInRecord(nowTime));
      return { ok: true, type: 'in', time: nowTime, message: `上班打卡成功 ${nowTime}` };
    }

    if (isOnLeave(existing)) {
      return { ok: false, message: '当前离岗中，请先点击「返岗打卡」' };
    }

    const nextRecord = buildClockOutRecord(day, existing, nowTime);
    savePerformanceRecord(dateKey, nextRecord);

    const isUpdate = !isWaitingClockOut(existing);
    return {
      ok: true,
      type: isUpdate ? 'update-out' : 'out',
      time: nowTime,
      message: isUpdate ? `下班打卡已更新 ${nowTime}` : `下班打卡成功 ${nowTime}`,
    };
  };

  const performLeavePunch = () => {
    const now = new Date();
    const day = getDateMeta(now);
    const dateKey = formatDateKey(now);

    if (!day.isWorkday) {
      return { ok: false, message: '今日非工作日，无需打卡' };
    }

    const existing = performanceRecords.value[dateKey];
    const nowTime = formatNowTime(now);

    if (!existing || !hasClockIn(existing)) {
      return { ok: false, message: '请先完成上班打卡' };
    }

    if (isOnLeave(existing)) {
      const nextRecord = buildReturnFromLeave(day, existing, nowTime);
      savePerformanceRecord(dateKey, nextRecord);
      return {
        ok: true,
        type: 'return',
        time: nowTime,
        message: `返岗打卡成功 ${nowTime}`,
      };
    }

    if (existing.punchPhase === 'out') {
      return { ok: false, message: '今日已下班，无法再离岗' };
    }

    const nextRecord = buildMidDayLeaveStart(day, existing, nowTime);
    savePerformanceRecord(dateKey, nextRecord);
    return {
      ok: true,
      type: 'leave-start',
      time: nowTime,
      message: `离岗打卡成功 ${nowTime}，返岗时请再次点击「返岗打卡」`,
    };
  };

  const performClockInOnly = () => {
    const now = new Date();
    const day = getDateMeta(now);
    const dateKey = formatDateKey(now);

    if (!day.isWorkday) {
      return { ok: false, message: '今日非工作日' };
    }

    const existing = performanceRecords.value[dateKey];
    if (existing && hasClockIn(existing) && !isOnLeave(existing)) {
      return { ok: false, message: '今日已上班打卡' };
    }

    if (existing && isOnLeave(existing)) {
      const nextRecord = buildReturnFromLeave(day, existing, formatNowTime(now));
      savePerformanceRecord(dateKey, nextRecord);
      return {
        ok: true,
        type: 'return',
        time: formatNowTime(now),
        message: `返岗打卡成功 ${formatNowTime(now)}`,
      };
    }

    const nowTime = formatNowTime(now);
    savePerformanceRecord(dateKey, buildClockInRecord(nowTime));
    return { ok: true, type: 'in', time: nowTime, message: `上班打卡成功 ${nowTime}` };
  };

  return {
    performHomePunch,
    performLeavePunch,
    performClockInOnly,
    getHomePunchLabel,
    getLeavePunchLabel,
  };
}
