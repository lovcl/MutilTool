<script setup>

import { computed, onBeforeUnmount, onMounted } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import { ElMessage } from 'element-plus';

import { APP_RULES_CONFIG, CALENDAR_YEAR, getDateMeta } from '../data/workCalendar';

import AppSidebar from '../components/layout/AppSidebar.vue';

import WindowTitleBar from '../components/layout/WindowTitleBar.vue';

import BrowserView from '../views/BrowserView.vue';

import { useCalendarState } from '../composables/useCalendarState';

import { useElectronBridge } from '../composables/useElectronBridge';

import { useHomePunch } from '../composables/useHomePunch';

import { usePerformanceRecords } from '../composables/usePerformanceRecords';

import { useWaterRecords } from '../composables/useWaterRecords';

import { useActivityLog } from '../composables/useActivityLog';

import { useTasks } from '../composables/useTasks';

import { useTheme } from '../composables/useTheme';

import { createReminderRecord } from '../utils/performance';



const appInfo = APP_RULES_CONFIG.app;

const isDesktopApp = Boolean(window.electronAPI?.window);

const route = useRoute();

const router = useRouter();

const isBrowserRoute = computed(() => route.name === 'browser');

const { initTheme, destroyTheme } = useTheme();

const { loadAutoLaunchStatus, loadSystemPunchStatus, onPunchReminder, onClockInReminder } =

  useElectronBridge();

const { savePerformanceRecord, performanceRecords } = usePerformanceRecords();

const { performClockInOnly } = useHomePunch();

const { appendRecord, onWaterRecord } = useWaterRecords();

const { prependLog, onActivityLogAppend } = useActivityLog();

const { syncTasks, onTasksChanged, onTasksNavigate } = useTasks();

const { goToMonth } = useCalendarState();



let removePunchReminderListener = null;

let removeClockInReminderListener = null;

let removeWaterRecordListener = null;

let removeActivityLogListener = null;

let removeTasksChangedListener = null;

let removeTasksNavigateListener = null;



const handlePunchReminder = (payload) => {

  const now = new Date();

  const day = getDateMeta(now);

  const punchTime = payload?.punchTime || APP_RULES_CONFIG.reminders.punch.late.punchTime;

  const record = createReminderRecord(

    day,

    punchTime,

    payload?.kind,

    performanceRecords.value[day.key]

  );



  if (record) {

    savePerformanceRecord(day.key, record);

  }



  if (now.getFullYear() === CALENDAR_YEAR) {

    goToMonth(now.getMonth());

  }

};



const handleWaterRecord = (payload) => {

  appendRecord(payload);

};



const handleClockInReminder = () => {

  const result = performClockInOnly();

  if (result.ok) {

    ElMessage.success(result.message);

  }



  if (new Date().getFullYear() === CALENDAR_YEAR) {

    goToMonth(new Date().getMonth());

  }



  router.push('/home');

};



onMounted(() => {

  initTheme();

  loadAutoLaunchStatus();

  loadSystemPunchStatus();

  removePunchReminderListener = onPunchReminder(handlePunchReminder);

  removeClockInReminderListener = onClockInReminder(handleClockInReminder);

  removeWaterRecordListener = onWaterRecord(handleWaterRecord);

  removeActivityLogListener = onActivityLogAppend((log) => prependLog(log));

  removeTasksChangedListener = onTasksChanged((nextTasks) => syncTasks(nextTasks));

  removeTasksNavigateListener = onTasksNavigate(() => router.push('/tasks'));

});



onBeforeUnmount(() => {

  destroyTheme();

  removePunchReminderListener?.();

  removeClockInReminderListener?.();

  removeWaterRecordListener?.();

  removeActivityLogListener?.();

  removeTasksChangedListener?.();

  removeTasksNavigateListener?.();

});

</script>



<template>

  <div class="app-frame">

    <WindowTitleBar v-if="isDesktopApp" />

    <div class="app-shell">

      <AppSidebar :app-info="appInfo" />

      <main class="main main-view-stack">

        <div

          class="main-view-stack__page"

          :class="{ 'is-background': isBrowserRoute && isDesktopApp }"

        >

          <router-view v-slot="{ Component }">

            <keep-alive>

              <component :is="Component" />

            </keep-alive>

          </router-view>

        </div>

        <BrowserView

          v-if="isDesktopApp"

          class="main-view-stack__browser"

          :class="{ 'is-background': !isBrowserRoute }"

        />

      </main>

    </div>

  </div>

</template>


