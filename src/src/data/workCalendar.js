import bundledAppRules from '../../app.rules.config.json';

export const APP_RULES_CONFIG = window.electronAPI?.appRules || bundledAppRules;
export const CALENDAR_YEAR = APP_RULES_CONFIG.calendar.year;
export const statutoryHolidays = APP_RULES_CONFIG.calendar.statutoryHolidays;
export const holidayRanges = APP_RULES_CONFIG.calendar.holidayRanges;
export const makeupWorkdays = APP_RULES_CONFIG.calendar.makeupWorkdays;

export const holidayDates = holidayRanges.reduce((dates, holiday) => {
  holiday.dates.forEach((date) => {
    dates[date] = holiday.name;
  });
  return dates;
}, {});

export const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const getDateMeta = (date) => {
  const key = formatDateKey(date);
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;

  if (statutoryHolidays[key]) {
    return {
      key,
      label: statutoryHolidays[key],
      type: 'statutoryHoliday',
      isWorkday: false,
    };
  }

  if (makeupWorkdays[key]) {
    return {
      key,
      label: makeupWorkdays[key],
      type: 'makeupWorkday',
      isWorkday: true,
    };
  }

  if (holidayDates[key]) {
    return {
      key,
      label: holidayDates[key],
      type: 'adjustedRest',
      isWorkday: false,
    };
  }

  if (!isWeekend) {
    return {
      key,
      label: APP_RULES_CONFIG.calendar.labels.workday,
      type: 'workday',
      isWorkday: true,
    };
  }

  return {
    key,
    label: APP_RULES_CONFIG.calendar.labels.weekend,
    type: 'weekend',
    isWorkday: false,
  };
};
