import { ref } from 'vue';
import { APP_RULES_CONFIG } from '../data/workCalendar';

const electronAPI = window.electronAPI;

const autoLaunchEnabled = ref(APP_RULES_CONFIG.app.autoLaunchDefaultEnabled);
const autoLaunchLoading = ref(false);
const systemPunchEnabled = ref(APP_RULES_CONFIG.app.systemPunchDefaultEnabled);
const systemPunchLoading = ref(false);
const eyeCareModeEnabled = ref(Boolean(APP_RULES_CONFIG.app.eyeCareModeDefaultEnabled));
const eyeCareModeLoading = ref(false);
const eyeCareModeIntensity = ref(APP_RULES_CONFIG.app.eyeCareMode?.defaultIntensity ?? 2);
const eyeCareIntensityLoading = ref(false);
const eyeCareIntensityMin = APP_RULES_CONFIG.app.eyeCareMode?.minIntensity ?? 1;
const eyeCareIntensityMax = APP_RULES_CONFIG.app.eyeCareMode?.maxIntensity ?? 20;
let eyeCareIntensitySaveTimer = null;

export function useElectronBridge() {
  const loadAutoLaunchStatus = async () => {
    if (!electronAPI?.autoLaunch) {
      return;
    }

    autoLaunchEnabled.value = await electronAPI.autoLaunch.get();
  };

  const updateAutoLaunch = async (enabled) => {
    if (!electronAPI?.autoLaunch) {
      return;
    }

    autoLaunchLoading.value = true;
    try {
      autoLaunchEnabled.value = await electronAPI.autoLaunch.set(enabled);
    } finally {
      autoLaunchLoading.value = false;
    }
  };

  const loadSystemPunchStatus = async () => {
    if (!electronAPI?.reminder?.getEnabled) {
      return;
    }

    systemPunchEnabled.value = await electronAPI.reminder.getEnabled();
  };

  const updateSystemPunch = async (enabled) => {
    if (!electronAPI?.reminder?.setEnabled) {
      systemPunchEnabled.value = Boolean(enabled);
      return;
    }

    systemPunchLoading.value = true;
    try {
      systemPunchEnabled.value = await electronAPI.reminder.setEnabled(enabled);
    } finally {
      systemPunchLoading.value = false;
    }
  };

  const loadEyeCareModeStatus = async () => {
    if (!electronAPI?.eyeCareMode) {
      return;
    }

    eyeCareModeEnabled.value = await electronAPI.eyeCareMode.get();
    eyeCareModeIntensity.value = await electronAPI.eyeCareMode.getIntensity();
  };

  const updateEyeCareMode = async (enabled) => {
    if (!electronAPI?.eyeCareMode) {
      eyeCareModeEnabled.value = Boolean(enabled);
      return;
    }

    eyeCareModeLoading.value = true;
    try {
      eyeCareModeEnabled.value = await electronAPI.eyeCareMode.set(enabled);
    } finally {
      eyeCareModeLoading.value = false;
    }
  };

  const updateEyeCareModeIntensity = (intensity) => {
    eyeCareModeIntensity.value = Number(intensity);

    if (!electronAPI?.eyeCareMode?.setIntensity) {
      return;
    }

    if (eyeCareIntensitySaveTimer) {
      clearTimeout(eyeCareIntensitySaveTimer);
    }

    eyeCareIntensitySaveTimer = setTimeout(async () => {
      eyeCareIntensityLoading.value = true;
      try {
        eyeCareModeIntensity.value = await electronAPI.eyeCareMode.setIntensity(intensity);
      } finally {
        eyeCareIntensityLoading.value = false;
      }
    }, 120);
  };

  const onPunchReminder = (callback) => electronAPI?.reminder?.onPunchReminder(callback) || null;

  const onClockInReminder = (callback) => electronAPI?.reminder?.onClockInReminder(callback) || null;

  return {
    autoLaunchEnabled,
    autoLaunchLoading,
    systemPunchEnabled,
    systemPunchLoading,
    loadAutoLaunchStatus,
    updateAutoLaunch,
    loadSystemPunchStatus,
    updateSystemPunch,
    eyeCareModeEnabled,
    eyeCareModeLoading,
    eyeCareModeIntensity,
    eyeCareIntensityLoading,
    eyeCareIntensityMin,
    eyeCareIntensityMax,
    loadEyeCareModeStatus,
    updateEyeCareMode,
    updateEyeCareModeIntensity,
    onPunchReminder,
    onClockInReminder,
  };
}
