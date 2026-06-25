<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { APP_RULES_CONFIG } from '../../data/workCalendar';

const appName = APP_RULES_CONFIG.app.displayName;
const isMaximized = ref(false);
const windowApi = window.electronAPI?.window;

let removeMaximizeListener = null;

const refreshMaximized = async () => {
  if (!windowApi?.isMaximized) {
    return;
  }

  isMaximized.value = await windowApi.isMaximized();
};

const minimizeWindow = () => windowApi?.minimize?.();
const toggleMaximize = async () => {
  if (!windowApi?.toggleMaximize) {
    return;
  }

  isMaximized.value = await windowApi.toggleMaximize();
};
const closeWindow = () => windowApi?.close?.();

onMounted(async () => {
  await refreshMaximized();
  removeMaximizeListener = windowApi?.onMaximizeChanged?.((maximized) => {
    isMaximized.value = maximized;
  });
});

onBeforeUnmount(() => {
  removeMaximizeListener?.();
});
</script>

<template>
  <header class="window-titlebar" @dblclick="toggleMaximize">
    <div class="window-titlebar__drag">
      <span class="window-titlebar__brand">{{ appName }}</span>
    </div>

    <div class="window-titlebar__controls">
      <button
        type="button"
        class="window-control window-control--minimize"
        aria-label="最小化"
        @click="minimizeWindow"
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6h8" />
        </svg>
      </button>

      <button
        type="button"
        class="window-control window-control--maximize"
        :aria-label="isMaximized ? '还原' : '最大化'"
        @click="toggleMaximize"
      >
        <svg v-if="!isMaximized" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
        </svg>
        <svg v-else viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5h5.5V8" />
          <rect x="2.5" y="4" width="5.5" height="5.5" rx="1" />
        </svg>
      </button>

      <button
        type="button"
        class="window-control window-control--close"
        aria-label="关闭"
        @click="closeWindow"
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 3l6 6M9 3 3 9" />
        </svg>
      </button>
    </div>
  </header>
</template>
