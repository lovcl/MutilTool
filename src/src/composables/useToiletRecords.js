import { computed, ref } from 'vue';
import { APP_RULES_CONFIG, formatDateKey } from '../data/workCalendar';

const electronAPI = window.electronAPI;
const toiletConfig = APP_RULES_CONFIG.toilet;

export const toiletRecords = ref({});
const toiletReminderEnabled = ref(toiletConfig.reminderDefaultEnabled);
const toiletReminderLoading = ref(false);
let initialized = false;

const normalizeDayEntry = (entry) => {
  if (Array.isArray(entry)) {
    return { schedule: {}, records: entry };
  }

  return {
    schedule: entry?.schedule || {},
    records: Array.isArray(entry?.records) ? entry.records : [],
  };
};

export { normalizeDayEntry };

export const hydrateToiletRecords = async () => {
  if (electronAPI?.toilet?.getRecords) {
    const records = await electronAPI.toilet.getRecords();
    toiletRecords.value = Object.fromEntries(
      Object.entries(records || {}).map(([dateKey, entry]) => [dateKey, normalizeDayEntry(entry)])
    );
    return;
  }

  const stored = JSON.parse(localStorage.getItem('toilet-records') || '{}');
  toiletRecords.value = Object.fromEntries(
    Object.entries(stored).map(([dateKey, entry]) => [dateKey, normalizeDayEntry(entry)])
  );
};

export function useToiletRecords() {
  if (!initialized) {
    hydrateToiletRecords();
    initialized = true;
  }

  const todayKey = formatDateKey(new Date());

  const todayEntry = computed(() => normalizeDayEntry(toiletRecords.value[todayKey] || {}));

  const todayRecords = computed(() => todayEntry.value.records);

  const todaySchedule = computed(() => todayEntry.value.schedule);

  const todayDoneCount = computed(
    () => todayRecords.value.filter((record) => record.action === 'done').length
  );

  const todayUrinationCount = computed(
    () => todayRecords.value.filter((record) => record.reminderType === 'urination').length
  );

  const todayBowelCount = computed(
    () => todayRecords.value.filter((record) => record.reminderType === 'bowel').length
  );

  const loadToiletReminderStatus = async () => {
    if (!electronAPI?.toilet?.getEnabled) {
      return;
    }

    toiletReminderEnabled.value = await electronAPI.toilet.getEnabled();
  };

  const updateToiletReminder = async (enabled) => {
    if (!electronAPI?.toilet?.setEnabled) {
      toiletReminderEnabled.value = Boolean(enabled);
      return;
    }

    toiletReminderLoading.value = true;
    try {
      toiletReminderEnabled.value = await electronAPI.toilet.setEnabled(enabled);
    } finally {
      toiletReminderLoading.value = false;
    }
  };

  const syncDayEntry = (dateKey, entry) => {
    toiletRecords.value = {
      ...toiletRecords.value,
      [dateKey]: normalizeDayEntry(entry),
    };
  };

  const onToiletRecord = (callback) => {
    if (!electronAPI?.toilet?.onRecord) {
      return null;
    }

    return electronAPI.toilet.onRecord(({ dateKey, record, schedule }) => {
      const current = normalizeDayEntry(toiletRecords.value[dateKey] || {});
      syncDayEntry(dateKey, {
        schedule: schedule || current.schedule,
        records: [...current.records, record],
      });
      callback?.({ dateKey, record, schedule });
    });
  };

  const manualMark = async (reminderType, options = {}) => {
    const now = new Date();
    const record = {
      reminderType,
      action: 'done',
      scheduledLabel: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      source: 'manual',
      recordedAt: now.toISOString(),
    };

    if (reminderType === 'bowel') {
      record.bowelStatus = options.bowelStatus || 'normal';
      record.bowelCustomText =
        record.bowelStatus === 'custom' ? String(options.bowelCustomText || '').trim() : '';
    }

    if (reminderType === 'urination') {
      record.urinationStatus = options.urinationStatus || 'normal';
      record.urinationColor =
        record.urinationStatus === 'color_abnormal' ? options.urinationColor || null : null;
    }

    if (electronAPI?.toilet?.addRecord) {
      return electronAPI.toilet.addRecord({
        dateKey: todayKey,
        ...record,
      });
    }

    const entry = normalizeDayEntry(toiletRecords.value[todayKey] || {});
    const nextRecord = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    syncDayEntry(todayKey, {
      ...entry,
      records: [...entry.records, nextRecord],
    });
    localStorage.setItem('toilet-records', JSON.stringify(toiletRecords.value));
    return nextRecord;
  };

  const deleteRecord = async (dateKey, recordId) => {
    if (electronAPI?.toilet?.deleteRecord) {
      return electronAPI.toilet.deleteRecord({ dateKey, recordId });
    }

    const entry = normalizeDayEntry(toiletRecords.value[dateKey] || {});
    const target = entry.records.find((record) => record.id === recordId);
    if (!target) {
      return { ok: false };
    }

    syncDayEntry(dateKey, {
      ...entry,
      records: entry.records.filter((record) => record.id !== recordId),
    });
    localStorage.setItem('toilet-records', JSON.stringify(toiletRecords.value));
    return { ok: true, record: target };
  };

  const onToiletRecordDeleted = (callback) => {
    if (!electronAPI?.toilet?.onRecordDeleted) {
      return null;
    }

    return electronAPI.toilet.onRecordDeleted(({ dateKey, recordId, schedule }) => {
      const current = normalizeDayEntry(toiletRecords.value[dateKey] || {});
      syncDayEntry(dateKey, {
        schedule: schedule || current.schedule,
        records: current.records.filter((record) => record.id !== recordId),
      });
      callback?.({ dateKey, recordId });
    });
  };

  return {
    toiletConfig,
    toiletRecords,
    todayKey,
    todayEntry,
    todayRecords,
    todaySchedule,
    todayDoneCount,
    todayUrinationCount,
    todayBowelCount,
    toiletReminderEnabled,
    toiletReminderLoading,
    loadToiletReminderStatus,
    updateToiletReminder,
    manualMark,
    deleteRecord,
    onToiletRecord,
    onToiletRecordDeleted,
    refreshRecords: hydrateToiletRecords,
  };
}
