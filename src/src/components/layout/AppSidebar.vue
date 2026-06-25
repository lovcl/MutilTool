<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Calendar,
  CoffeeCup,
  DArrowLeft,
  DArrowRight,
  Document,
  FolderOpened,
  Guide,
  HomeFilled,
  List,
  Message,
  Monitor,
  Setting,
} from '@element-plus/icons-vue';

defineProps({
  appInfo: {
    type: Object,
    required: true,
  },
});

const SIDEBAR_COLLAPSED_KEY = 'sidebar-manually-collapsed';

const navItems = [
  { to: '/home', label: '首页', icon: HomeFilled },
  { to: '/calendar', label: '考勤管理', icon: Calendar },
  { to: '/tasks', label: '任务管理', icon: List },
  { to: '/files', label: '文件管理', icon: FolderOpened },
  { to: '/water', label: '喝水管理', icon: CoffeeCup },
  { to: '/toilet', label: '如厕提醒', icon: Guide },
  { to: '/messages', label: '消息中心', icon: Message },
  { to: '/browser', label: '浏览器', icon: Monitor },
  { to: '/logs', label: '日志管理', icon: Document },
  { to: '/settings', label: '系统设置', icon: Setting },
];

const manualCollapsed = ref(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
const mqCollapsed = ref(false);
let collapseMediaQuery = null;

const sidebarCollapsed = computed(() => manualCollapsed.value || mqCollapsed.value);

const updateMqCollapsed = () => {
  mqCollapsed.value = collapseMediaQuery?.matches ?? false;
};

const toggleSidebarCollapsed = () => {
  const nextCollapsed = !sidebarCollapsed.value;
  manualCollapsed.value = nextCollapsed;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, nextCollapsed ? '1' : '0');
};

onMounted(() => {
  collapseMediaQuery = window.matchMedia('(max-width: 1500px)');
  updateMqCollapsed();
  collapseMediaQuery.addEventListener('change', updateMqCollapsed);
});

onBeforeUnmount(() => {
  collapseMediaQuery?.removeEventListener('change', updateMqCollapsed);
});
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': sidebarCollapsed }">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg class="brand-mark-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9z" />
          <path
            d="M4 10h16V9a2 2 0 0 0-2-2h-1.4a6 6 0 0 0-11.2 0H6a2 2 0 0 0-2 2v1z"
            opacity="0.92"
          />
          <path
            d="M11 14.5h2v2.8h-2z"
            fill="currentColor"
            opacity="0.45"
          />
          <line
            x1="4"
            y1="10"
            x2="20"
            y2="10"
            stroke="currentColor"
            stroke-opacity="0.28"
            stroke-width="0.9"
          />
        </svg>
      </div>
      <div class="brand-text">
        <h1>{{ appInfo.displayName }}</h1>
        <p>{{ appInfo.subtitle }}</p>
      </div>
    </div>

    <nav class="nav">
      <el-tooltip
        v-for="item in navItems"
        :key="item.to"
        :content="item.label"
        placement="right"
        :disabled="!sidebarCollapsed"
        :show-after="120"
        teleported
      >
        <router-link
          :to="item.to"
          class="nav-item"
          active-class="active"
          :aria-label="item.label"
        >
          <el-icon class="nav-icon">
            <component :is="item.icon" />
          </el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </el-tooltip>
    </nav>

    <div class="sidebar-bottom">
      <el-tooltip
        :content="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
        placement="right"
        :disabled="!sidebarCollapsed"
        :show-after="120"
        teleported
      >
        <button
          type="button"
          class="sidebar-collapse-btn"
          :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
          @click="toggleSidebarCollapsed"
        >
          <el-icon>
            <component :is="sidebarCollapsed ? DArrowRight : DArrowLeft" />
          </el-icon>
        </button>
      </el-tooltip>
    </div>
  </aside>
</template>
