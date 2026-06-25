const APP_RULES_CONFIG = require('../app.rules.config.json');

const statutoryHolidays = APP_RULES_CONFIG.calendar.statutoryHolidays;
const makeupWorkdays = APP_RULES_CONFIG.calendar.makeupWorkdays;

const holidayDates = APP_RULES_CONFIG.calendar.holidayRanges.reduce((dates, holiday) => {
  holiday.dates.forEach((date) => {
    dates[date] = holiday.name;
  });
  return dates;
}, {});

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getDateMeta = (date) => {
  const key = formatDateKey(date);
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;

  if (statutoryHolidays[key]) {
    return { key, isWorkday: false };
  }

  if (makeupWorkdays[key]) {
    return { key, isWorkday: true };
  }

  if (holidayDates[key]) {
    return { key, isWorkday: false };
  }

  if (!isWeekend) {
    return { key, isWorkday: true };
  }

  return { key, isWorkday: false };
};

module.exports = {
  formatDateKey,
  getDateMeta,
};
