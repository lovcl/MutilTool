import { ref, watch } from 'vue';
import { appendActivityLog } from './useActivityLog';
import { normalizePerformanceRecord, normalizePerformanceRecordsMap } from '../utils/performance';
import {
  buildAttendanceDeleteSummary,
  buildAttendanceLogSummary,
} from '../utils/activityLogMeta';

const performanceRecords = ref(
  normalizePerformanceRecordsMap(JSON.parse(localStorage.getItem('performance-records') || '{}'))
);
let initialized = false;

export { performanceRecords };

export const hydratePerformanceRecords = async () => {
  if (window.electronAPI?.dataBackup?.getPerformanceRecords) {
    performanceRecords.value = normalizePerformanceRecordsMap(
      await window.electronAPI.dataBackup.getPerformanceRecords()
    );
    localStorage.setItem('performance-records', JSON.stringify(performanceRecords.value));
    return;
  }

  performanceRecords.value = normalizePerformanceRecordsMap(
    JSON.parse(localStorage.getItem('performance-records') || '{}')
  );
};

const toPlainRecords = (records) => JSON.parse(JSON.stringify(records));

export function usePerformanceRecords() {
  if (!initialized) {
    hydratePerformanceRecords();
    watch(
      performanceRecords,
      (records) => {
        const plainRecords = toPlainRecords(records);
        localStorage.setItem('performance-records', JSON.stringify(plainRecords));
        window.electronAPI?.dataBackup?.savePerformanceRecords?.(plainRecords);
      },
      { deep: true }
    );
    initialized = true;
  }

  const savePerformanceRecord = (dateKey, record) => {
    const normalizedRecord = normalizePerformanceRecord({
      ...record,
      hours: Number(record.hours),
    });

    performanceRecords.value = {
      ...performanceRecords.value,
      [dateKey]: normalizedRecord,
    };

    appendActivityLog({
      category: 'attendance',
      action: normalizedRecord.source === 'reminder' ? 'punch-reminder' : 'save',
      title: normalizedRecord.source === 'reminder' ? '系统打卡提醒' : '考勤/绩效打卡',
      summary: buildAttendanceLogSummary(dateKey, normalizedRecord),
      detail: { dateKey, record: normalizedRecord },
    });
  };

  const mergePerformanceRecords = (records) => {
    performanceRecords.value = {
      ...performanceRecords.value,
      ...normalizePerformanceRecordsMap(records),
    };
  };

  const removePerformanceRecord = (dateKey) => {
    const nextRecords = { ...performanceRecords.value };
    delete nextRecords[dateKey];
    performanceRecords.value = nextRecords;

    appendActivityLog({
      category: 'attendance',
      action: 'delete',
      title: '删除打卡记录',
      summary: buildAttendanceDeleteSummary(dateKey),
      detail: { dateKey },
    });
  };

  const clearAllPerformanceRecords = () => {
    const count = Object.keys(performanceRecords.value).length;
    performanceRecords.value = {};

    appendActivityLog({
      category: 'attendance',
      action: 'reset-all',
      title: '重置考勤数据',
      summary: count ? `已清空 ${count} 条考勤/绩效记录` : '考勤/绩效记录已为空',
      detail: { count },
    });

    return count;
  };

  return {
    performanceRecords,
    savePerformanceRecord,
    mergePerformanceRecords,
    removePerformanceRecord,
    clearAllPerformanceRecords,
    refreshRecords: hydratePerformanceRecords,
  };
}
