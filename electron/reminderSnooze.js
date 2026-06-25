const REMINDER_TOAST = {
  CLOSED: -1,
  SNOOZE_TODAY: -2,
};

const SNOOZE_SETTING_KEYS = {
  water: 'waterReminderSnoozeUntil',
  punch: 'systemPunchSnoozeUntil',
  task: 'taskReminderSnoozeUntil',
  toilet: 'toiletReminderSnoozeUntil',
};

const getEndOfToday = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
};

const isReminderSnoozedToday = (loadAppSettings, type) => {
  const key = SNOOZE_SETTING_KEYS[type];
  if (!key) {
    return false;
  }

  const until = loadAppSettings()[key];
  if (!until) {
    return false;
  }

  return Date.now() <= new Date(until).getTime();
};

const snoozeReminderToday = (loadAppSettings, saveAppSettings, type) => {
  const key = SNOOZE_SETTING_KEYS[type];
  if (!key) {
    return;
  }

  saveAppSettings({
    ...loadAppSettings(),
    [key]: getEndOfToday(),
  });
};

const msUntilSnoozeExpires = (loadAppSettings, type) => {
  const key = SNOOZE_SETTING_KEYS[type];
  if (!key) {
    return 0;
  }

  const until = loadAppSettings()[key];
  if (!until) {
    return 0;
  }

  return Math.max(new Date(until).getTime() - Date.now() + 1000, 0);
};

module.exports = {
  REMINDER_TOAST,
  SNOOZE_SETTING_KEYS,
  isReminderSnoozedToday,
  snoozeReminderToday,
  msUntilSnoozeExpires,
};
