import { computed, ref } from 'vue';
import { APP_RULES_CONFIG, formatDateKey } from '../data/workCalendar';

const electronAPI = window.electronAPI;
const waterConfig = APP_RULES_CONFIG.water;

export const waterRecords = ref({});
const waterReminderEnabled = ref(waterConfig.reminderDefaultEnabled);
const waterReminderLoading = ref(false);
let initialized = false;

export const hydrateWaterRecords = async () => {
  if (electronAPI?.water?.getRecords) {
    waterRecords.value = await electronAPI.water.getRecords();
    return;
  }

  waterRecords.value = JSON.parse(localStorage.getItem('water-records') || '{}');
};

export function useWaterRecords() {
  if (!initialized) {
    hydrateWaterRecords();
    initialized = true;
  }

  const todayKey = formatDateKey(new Date());

  const todayRecords = computed(() => waterRecords.value[todayKey] || []);

  const todayDrinkCount = computed(
    () => todayRecords.value.filter((record) => record.action === 'drink').length
  );

  const todayLaterCount = computed(
    () => todayRecords.value.filter((record) => record.action === 'later').length
  );

  const todaySkipCount = computed(
    () => todayRecords.value.filter((record) => record.action === 'skip').length
  );

  const todayProgress = computed(() =>
    Math.min(100, Math.round((todayDrinkCount.value / waterConfig.targetGlassesPerDay) * 100))
  );

  const loadWaterReminderStatus = async () => {
    if (!electronAPI?.water?.getEnabled) {
      return;
    }

    waterReminderEnabled.value = await electronAPI.water.getEnabled();
  };

  const updateWaterReminder = async (enabled) => {
    if (!electronAPI?.water?.setEnabled) {
      waterReminderEnabled.value = Boolean(enabled);
      return;
    }

    waterReminderLoading.value = true;
    try {
      waterReminderEnabled.value = await electronAPI.water.setEnabled(enabled);
    } finally {
      waterReminderLoading.value = false;
    }
  };

  const appendRecord = (payload) => {
    const dateKey = payload.dateKey || todayKey;
    const record = payload.record || payload;
    waterRecords.value = {
      ...waterRecords.value,
      [dateKey]: [...(waterRecords.value[dateKey] || []), record],
    };
  };

  const manualDrink = async () => {
    const now = new Date();
    const record = {
      action: 'drink',
      scheduledLabel: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      source: 'manual',
      recordedAt: now.toISOString(),
    };

    if (electronAPI?.water?.addRecord) {
      return electronAPI.water.addRecord({
        dateKey: todayKey,
        ...record,
      });
    }

    record.id = `${Date.now()}`;
    appendRecord({ dateKey: todayKey, record });
    localStorage.setItem('water-records', JSON.stringify(waterRecords.value));
    return record;
  };

  const onWaterRecord = (callback) => {
    if (!electronAPI?.water?.onRecord) {
      return null;
    }

    return electronAPI.water.onRecord(({ dateKey, record }) => {
      appendRecord({ dateKey, record });
      callback?.({ dateKey, record });
    });
  };

  return {
    waterConfig,
    waterRecords,
    todayKey,
    todayRecords,
    todayDrinkCount,
    todayLaterCount,
    todaySkipCount,
    todayProgress,
    waterReminderEnabled,
    waterReminderLoading,
    loadWaterReminderStatus,
    updateWaterReminder,
    appendRecord,
    manualDrink,
    onWaterRecord,
    refreshRecords: hydrateWaterRecords,
  };
}
