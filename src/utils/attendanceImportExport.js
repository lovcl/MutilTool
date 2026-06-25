import { ElMessage } from 'element-plus';
import { APP_RULES_CONFIG, formatDateKey, getDateMeta } from '../data/workCalendar';
import { getAttendanceDetail } from './attendance';
import {
  getDayModeLabel,
  getRecordDayMode,
  getRecordDayModeHours,
  normalizeDayModeFromText,
} from './performance';
import {
  attendanceImportColumns,
  createXlsxBlob,
  getRowsFromAttendanceFile,
  parseXlsxRows,
  pickImportValue,
  rowsToObjects,
} from './spreadsheet';
import { appendActivityLog } from '../composables/useActivityLog';
import {
  buildAttendanceExportSummary,
  buildAttendanceImportSummary,
  buildAttendanceLogSummary,
} from './activityLogMeta';
import { formatHours, normalizeDateText, normalizeTimeText } from './time';

const attendanceRule = APP_RULES_CONFIG.performance.workday.attendance;

const EXPORT_HEADERS = [
  '日期',
  '日期类型',
  '上班打卡',
  '下班打卡',
  '出勤类型',
  '绩效小时',
  '考勤状态',
  '迟到分钟',
  '请假小时',
  '来源',
];

const resolveImportColumnIndexes = (row = []) => {
  const hasDateTypeColumn =
    row.length > 3 && Boolean(normalizeDateText(row[0])) && !normalizeTimeText(row[1]);

  return hasDateTypeColumn
    ? { startIndex: 2, endIndex: 3, dayModeIndex: 4 }
    : { startIndex: 1, endIndex: 2, dayModeIndex: 3 };
};

const isHeaderlessSimpleRow = (row = []) =>
  Boolean(normalizeDateText(row[0])) && Boolean(normalizeTimeText(row[1]));

const createRecordFromImport = (item) => {
  const row = item.__row || [];
  const { startIndex, endIndex, dayModeIndex } = resolveImportColumnIndexes(row);
  const dateKey = normalizeDateText(pickImportValue(item, attendanceImportColumns.date, 0));
  const startTime = normalizeTimeText(
    pickImportValue(item, attendanceImportColumns.startTime, startIndex)
  );
  const endTime = normalizeTimeText(pickImportValue(item, attendanceImportColumns.endTime, endIndex));
  const dayMode = normalizeDayModeFromText(
    pickImportValue(
      item,
      attendanceImportColumns.dayMode,
      isHeaderlessSimpleRow(row) && row.length > dayModeIndex ? dayModeIndex : -1
    )
  );

  if (!dateKey || !startTime || !endTime) {
    return null;
  }

  const day = getDateMeta(new Date(`${dateKey}T00:00:00`));
  const hours = Number(getRecordDayModeHours(day, startTime, endTime, dayMode).toFixed(1));

  return {
    dateKey,
    record: {
      startTime,
      endTime,
      hours,
      dayMode,
      attendance: day.isWorkday
        ? {
            checkInTime: startTime,
            scheduledStartTime: attendanceRule.scheduledStartTime,
          }
        : null,
      source: 'import',
    },
  };
};

export const exportAttendanceExcel = (performanceRecords) => {
  const rows = Object.entries(performanceRecords)
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, record]) => {
      const day = getDateMeta(new Date(`${date}T00:00:00`));
      const month = Number(date.slice(5, 7)) - 1;
      const attendance = getAttendanceDetail(date, month, performanceRecords);
      const dayMode = getRecordDayMode(record);
      const startTime = record.attendance?.checkInTime || record.startTime || '';
      const endTime = record.endTime || '';

      return {
        date,
        label: day.label,
        startTime,
        endTime,
        dayModeLabel: getDayModeLabel(dayMode),
        hours: formatHours(Number(getRecordDayModeHours(day, startTime, endTime, dayMode))),
        attendanceText: attendance?.text || (day.isWorkday ? '正常' : '非工作日'),
        lateMinutes: attendance?.lateMinutes || 0,
        leaveHours: formatHours(Number(attendance?.leaveHours || 0)),
        source: record.source || 'manual',
      };
    });

  const tableRows = rows.map((row) => [
    row.date,
    row.label,
    row.startTime,
    row.endTime,
    row.dayModeLabel,
    row.hours,
    row.attendanceText,
    row.lateMinutes,
    row.leaveHours,
    row.source,
  ]);
  const today = formatDateKey(new Date());
  const blob = createXlsxBlob([EXPORT_HEADERS, ...tableRows]);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${APP_RULES_CONFIG.app.displayName}-考勤绩效-${today}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  ElMessage.success(
    rows.length ? `已导出 ${rows.length} 条考勤记录` : '已导出考勤 Excel（暂无记录，仅含表头）'
  );

  appendActivityLog({
    category: 'attendance',
    action: 'export',
    title: '导出考勤数据',
    summary: buildAttendanceExportSummary(rows.length),
    detail: { count: rows.length, fileName: link.download },
  });
};

export const importAttendanceRows = (rows, performanceRecords, mergeRecords) => {
  const items = rowsToObjects(rows);
  const importedRecords = {};
  let skippedCount = 0;

  items.forEach((item) => {
    const imported = createRecordFromImport(item);
    if (!imported) {
      skippedCount += 1;
      return;
    }

    importedRecords[imported.dateKey] = imported.record;
  });

  const importedCount = Object.keys(importedRecords).length;
  if (!importedCount) {
    ElMessage.error('没有识别到可导入的考勤数据');
    return;
  }

  mergeRecords(importedRecords);

  Object.entries(importedRecords).forEach(([dateKey, record]) => {
    appendActivityLog({
      category: 'attendance',
      action: 'import',
      title: '导入考勤记录',
      summary: buildAttendanceLogSummary(dateKey, { ...record, source: 'import' }),
      detail: { dateKey, record },
    });
  });

  appendActivityLog({
    category: 'attendance',
    action: 'import-batch',
    title: '批量导入完成',
    summary: buildAttendanceImportSummary(importedCount, skippedCount),
    detail: { importedCount, skippedCount },
  });

  ElMessage.success(`已导入 ${importedCount} 条考勤记录${skippedCount ? `，跳过 ${skippedCount} 条` : ''}`);
};

export const importAttendanceText = (text, performanceRecords, mergeRecords) => {
  importAttendanceRows(getRowsFromAttendanceFile(text), performanceRecords, mergeRecords);
};

export const handleAttendanceImportFile = async (file, performanceRecords, mergeRecords) => {
  if (/\.xlsx$/i.test(file.name)) {
    const rows = await parseXlsxRows(await file.arrayBuffer());
    importAttendanceRows(rows, performanceRecords, mergeRecords);
    return;
  }

  const text = await file.text();
  importAttendanceText(text, performanceRecords, mergeRecords);
};
