<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import PrivacyLockScreen from './components/privacy/PrivacyLockScreen.vue';
import PrivacySetupDialog from './components/privacy/PrivacySetupDialog.vue';
import PrivacyDisableDialog from './components/privacy/PrivacyDisableDialog.vue';
import { usePrivacyMode } from './composables/usePrivacyMode';

const {
  privacyModeEnabled,
  privacyLocked,
  syncStatus,
  registerPrivacyListeners,
  unregisterPrivacyListeners,
  cancelProtectedFlow,
  clearProtectedFlowActive,
} = usePrivacyMode();

const privacySetupVisible = ref(false);
const privacyDisableVisible = ref(false);

const showLockScreen = computed(
  () =>
    privacyModeEnabled.value &&
    privacyLocked.value &&
    !privacyDisableVisible.value &&
    !privacySetupVisible.value
);

const showAppContent = computed(
  () => !showLockScreen.value && !privacyDisableVisible.value && !privacySetupVisible.value
);

onMounted(async () => {
  await syncStatus();
  registerPrivacyListeners({
    onShowSetupDialog: () => {
      privacyLocked.value = false;
      privacySetupVisible.value = true;
    },
    onShowDisableDialog: () => {
      privacyLocked.value = false;
      privacyDisableVisible.value = true;
    },
  });
});

onBeforeUnmount(() => {
  unregisterPrivacyListeners();
});

const handleUnlocked = async () => {
  await syncStatus();
};

const handlePrivacySetupCompleted = async () => {
  clearProtectedFlowActive();
  await syncStatus();
};

const handlePrivacyDisableCompleted = async () => {
  clearProtectedFlowActive();
  await syncStatus();
};

const handlePrivacyFlowCancelled = async () => {
  await cancelProtectedFlow();
};
</script>

<template>
  <PrivacyLockScreen v-if="showLockScreen" @unlocked="handleUnlocked" />
  <router-view v-if="showAppContent" />

  <PrivacyDisableDialog
    v-model:visible="privacyDisableVisible"
    @completed="handlePrivacyDisableCompleted"
    @cancelled="handlePrivacyFlowCancelled"
  />
  <PrivacySetupDialog
    v-model:visible="privacySetupVisible"
    @completed="handlePrivacySetupCompleted"
    @cancelled="handlePrivacyFlowCancelled"
  />
</template>
