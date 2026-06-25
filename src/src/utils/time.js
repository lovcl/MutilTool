const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

export const excelSerialToDateKey = (serial) => {
  const numeric = Number(serial);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  const wholeDays = Math.floor(numeric);
  if (wholeDays < 1) {
    return '';
  }

  const date = new Date(EXCEL_EPOCH_UTC + wholeDays * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

export const excelSerialToTimeText = (serial) => {
  const numeric = Number(serial);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  const fraction = numeric >= 1 ? numeric % 1 : numeric;
  if (fraction <= 0 || fraction >= 1) {
    return '';
  }

  const totalMinutes = Math.round(fraction * 24 * 60);
  const boundedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(boundedMinutes / 60);
  const minute = boundedMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const formatHours = (hours) => hours.toFixed(2);

export const minutesToTime = (minutes) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minute = String(normalized % 60).padStart(2, '0');

  return `${hour}:${minute}`;
};

export const timeToMinutes = (time) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

export const floorMinutesToStep = (minutes, stepMinutes) => {
  if (stepMinutes <= 0) {
    return minutes;
  }

  return Math.floor(minutes / stepMinutes) * stepMinutes;
};

export const getEndTimeByHours = (startTime, hours) =>
  minutesToTime(timeToMinutes(startTime) + Math.round(hours * 60));

export const normalizeDateText = (value) => {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(Number(isoMatch[2])).padStart(2, '0')}-${String(Number(isoMatch[3])).padStart(2, '0')}`;
  }

  const match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
  }

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return excelSerialToDateKey(text);
  }

  return '';
};

export const normalizeTimeText = (value) => {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }

  const match = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (match) {
    return `${String(Number(match[1])).padStart(2, '0')}:${String(Number(match[2])).padStart(2, '0')}`;
  }

  const compactMatch = text.match(/^(\d{1,2})(\d{2})$/);
  if (compactMatch) {
    return `${String(Number(compactMatch[1])).padStart(2, '0')}:${String(Number(compactMatch[2])).padStart(2, '0')}`;
  }

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return excelSerialToTimeText(text);
  }

  return '';
};
