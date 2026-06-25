import { ref } from 'vue';

const electronAPI = window.electronAPI;

export const activityLogs = ref([]);
let initialized = false;
let loadingPromise = null;

const persistFallbackLogs = () => {
  if (!electronAPI?.activityLog) {
    localStorage.setItem('activity-logs', JSON.stringify(activityLogs.value));
  }
};

export const hydrateActivityLogs = async () => {
  if (electronAPI?.activityLog?.getAll) {
    activityLogs.value = await electronAPI.activityLog.getAll();
    return;
  }

  activityLogs.value = JSON.parse(localStorage.getItem('activity-logs') || '[]');
};

export const appendActivityLog = async (entry) => {
  if (electronAPI?.activityLog?.append) {
    const log = await electronAPI.activityLog.append(entry);
    activityLogs.value = [log, ...activityLogs.value.filter((item) => item.id !== log.id)];
    return log;
  }

  const log = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recordedAt: new Date().toISOString(),
    ...entry,
  };
  activityLogs.value = [log, ...activityLogs.value];
  persistFallbackLogs();
  return log;
};

export const clearActivityLogs = async () => {
  if (electronAPI?.activityLog?.clear) {
    await electronAPI.activityLog.clear();
  } else {
    localStorage.removeItem('activity-logs');
  }

  activityLogs.value = [];
};

export const prependActivityLog = (log) => {
  if (!log?.id) {
    return;
  }

  activityLogs.value = [log, ...activityLogs.value.filter((item) => item.id !== log.id)];
};

export function useActivityLog() {
  if (!initialized) {
    loadingPromise = hydrateActivityLogs();
    initialized = true;
  }

  const onActivityLogAppend = (callback) => electronAPI?.activityLog?.onAppend(callback) || null;

  const onActivityLogClear = (callback) => electronAPI?.activityLog?.onClear(callback) || null;

  return {
    activityLogs,
    loadingPromise,
    refreshLogs: hydrateActivityLogs,
    appendActivityLog,
    clearActivityLogs,
    prependLog: prependActivityLog,
    onActivityLogAppend,
    onActivityLogClear,
  };
}
