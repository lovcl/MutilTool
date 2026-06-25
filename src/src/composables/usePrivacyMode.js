import { ref } from 'vue';
import { applyDataSnapshotToUi } from './useDataBackup';

const electronAPI = window.electronAPI;

const privacyModeEnabled = ref(false);
const privacyConfigured = ref(false);
const privacyLocked = ref(false);
const privacyLockedOut = ref(false);
const privacyFailedAttempts = ref(0);
const privacyMaxAttempts = ref(5);
const privacyMinPasswordLength = ref(4);

let removeLockListener = null;
let removeResetListener = null;
let removeSetupDialogListener = null;
let removeDisableDialogListener = null;
let removeStatusChangedListener = null;

const syncStatus = async () => {
  if (!electronAPI?.privacyMode?.getStatus) {
    privacyModeEnabled.value = false;
    privacyConfigured.value = false;
    privacyLocked.value = false;
    return null;
  }

  const status = await electronAPI.privacyMode.getStatus();
  privacyModeEnabled.value = Boolean(status.enabled);
  privacyConfigured.value = Boolean(status.configured);
  privacyLocked.value = Boolean(status.locked);
  privacyLockedOut.value = Boolean(status.lockedOut);
  privacyFailedAttempts.value = Number(status.failedAttempts || 0);
  privacyMaxAttempts.value = Number(status.maxFailedAttempts || 5);
  privacyMinPasswordLength.value = Number(status.minPasswordLength || 4);
  return status;
};

let protectedFlowActive = false;

export function usePrivacyMode() {
  const registerPrivacyListeners = ({
    onShowSetupDialog,
    onShowDisableDialog,
  } = {}) => {
    if (!electronAPI?.privacyMode) {
      return;
    }

    removeLockListener?.();
    removeResetListener?.();
    removeSetupDialogListener?.();
    removeDisableDialogListener?.();
    removeStatusChangedListener?.();

    removeLockListener = electronAPI.privacyMode.onLockRequired(async () => {
      await syncStatus();
    });

    removeResetListener = electronAPI.privacyMode.onResetComplete(async () => {
      privacyModeEnabled.value = false;
      privacyConfigured.value = false;
      privacyLocked.value = false;
      privacyLockedOut.value = false;
      privacyFailedAttempts.value = 0;
      localStorage.removeItem('theme-mode');
      localStorage.removeItem('performance-records');
      localStorage.removeItem('water-records');
      localStorage.removeItem('toilet-records');
      localStorage.removeItem('tasks');
      localStorage.removeItem('activity-logs');
      await applyDataSnapshotToUi({ data: {} });
    });

    if (onShowSetupDialog) {
      removeSetupDialogListener = electronAPI.privacyMode.onShowSetupDialog(() => {
        protectedFlowActive = true;
        onShowSetupDialog();
      });
    }

    if (onShowDisableDialog) {
      removeDisableDialogListener = electronAPI.privacyMode.onShowDisableDialog(() => {
        protectedFlowActive = true;
        onShowDisableDialog();
      });
    }

    removeStatusChangedListener = electronAPI.privacyMode.onStatusChanged(async () => {
      await syncStatus();
    });
  };

  const unregisterPrivacyListeners = () => {
    removeLockListener?.();
    removeResetListener?.();
    removeSetupDialogListener?.();
    removeDisableDialogListener?.();
    removeStatusChangedListener?.();
    removeLockListener = null;
    removeResetListener = null;
    removeSetupDialogListener = null;
    removeDisableDialogListener = null;
    removeStatusChangedListener = null;
  };

  const unlockWithPassword = async (password) => {
    const result = await electronAPI.privacyMode.verifyPassword(password);
    await syncStatus();
    return result;
  };

  const setupPrivacyMode = async (payload) => {
    const status = await electronAPI.privacyMode.setup(payload);
    await syncStatus();
    return status;
  };

  const enablePrivacyMode = async () => {
    const status = await electronAPI.privacyMode.enable();
    await syncStatus();
    return status;
  };

  const disablePrivacyMode = async (password) => {
    const status = await electronAPI.privacyMode.disable(password);
    await syncStatus();
    return status;
  };

  const changePrivacyPassword = async (payload) => {
    const status = await electronAPI.privacyMode.changePassword(payload);
    await syncStatus();
    return status;
  };

  const fetchSetupQuestions = () => electronAPI.privacyMode.getSetupQuestions();

  const fetchSecurityQuestions = () => electronAPI.privacyMode.getSecurityQuestions();

  const recoverWithSecurityAnswer = async (payload) => {
    const status = await electronAPI.privacyMode.recover(payload);
    await syncStatus();
    return status;
  };

  const resetAllData = async () => {
    await electronAPI.privacyMode.resetAllData();
    await syncStatus();
  };

  const endProtectedFlow = async () => {
    if (!electronAPI?.privacyMode?.endProtectedFlow) {
      return null;
    }

    const status = await electronAPI.privacyMode.endProtectedFlow();
    await syncStatus();
    return status;
  };

  const clearProtectedFlowActive = () => {
    protectedFlowActive = false;
  };

  const cancelProtectedFlow = async () => {
    if (!protectedFlowActive) {
      return null;
    }

    protectedFlowActive = false;
    return endProtectedFlow();
  };

  return {
    privacyModeEnabled,
    privacyConfigured,
    privacyLocked,
    privacyLockedOut,
    privacyFailedAttempts,
    privacyMaxAttempts,
    privacyMinPasswordLength,
    syncStatus,
    registerPrivacyListeners,
    unregisterPrivacyListeners,
    unlockWithPassword,
    setupPrivacyMode,
    enablePrivacyMode,
    disablePrivacyMode,
    changePrivacyPassword,
    fetchSetupQuestions,
    fetchSecurityQuestions,
    recoverWithSecurityAnswer,
    resetAllData,
    endProtectedFlow,
    cancelProtectedFlow,
    clearProtectedFlowActive,
  };
}
