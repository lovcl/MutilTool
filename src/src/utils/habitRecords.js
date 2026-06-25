import { formatDateKey } from '../data/workCalendar';

export const flattenWaterRecords = (recordsMap = {}) =>
  Object.entries(recordsMap).flatMap(([dateKey, dayRecords]) =>
    (Array.isArray(dayRecords) ? dayRecords : []).map((record) => ({ dateKey, ...record }))
  );

export const flattenToiletRecords = (recordsMap = {}, normalizeDayEntry) =>
  Object.entries(recordsMap).flatMap(([dateKey, entry]) =>
    normalizeDayEntry(entry).records.map((record) => ({ dateKey, ...record }))
  );

export const sortRecordsNewestFirst = (entries = []) =>
  [...entries].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));

export const filterRecordsByDateRange = (entries = [], range = null) => {
  if (!range?.length || !range[0] || !range[1]) {
    return entries;
  }

  const startKey = formatDateKey(range[0]);
  const endKey = formatDateKey(range[1]);

  return entries.filter(({ dateKey }) => dateKey >= startKey && dateKey <= endKey);
};

export const getDefaultHistoryRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return [start, end];
};

export const formatRecordClock = (value) => {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};
