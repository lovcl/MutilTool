<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Document, Refresh } from '@element-plus/icons-vue';
import { useActivityLog } from '../composables/useActivityLog';
import { LOG_CATEGORIES, formatLogTime } from '../utils/activityLogMeta';

const {
  activityLogs,
  refreshLogs,
  clearActivityLogs,
  prependLog,
  onActivityLogAppend,
  onActivityLogClear,
} = useActivityLog();

const categoryFilter = ref('all');
const rangeFilter = ref('today');

const categoryOptions = [
  { label: '全部类型', value: 'all' },
  { label: '考勤打卡', value: 'attendance' },
  { label: '喝水', value: 'water' },
  { label: '如厕', value: 'toilet' },
  { label: '任务', value: 'task' },
];

const rangeOptions = [
  { label: '今天', value: 'today' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '全部', value: 'all' },
];

const getRangeStart = () => {
  const now = new Date();
  if (rangeFilter.value === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (rangeFilter.value === '7d') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (rangeFilter.value === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return null;
};

const filteredLogs = computed(() => {
  const rangeStart = getRangeStart();

  return activityLogs.value.filter((log) => {
    if (categoryFilter.value !== 'all' && log.category !== categoryFilter.value) {
      return false;
    }

    if (!rangeStart) {
      return true;
    }

    return new Date(log.recordedAt) >= rangeStart;
  });
});

const stats = computed(() => ({
  total: filteredLogs.value.length,
  attendance: filteredLogs.value.filter((log) => log.category === 'attendance').length,
  water: filteredLogs.value.filter((log) => log.category === 'water').length,
  toilet: filteredLogs.value.filter((log) => log.category === 'toilet').length,
  task: filteredLogs.value.filter((log) => log.category === 'task').length,
}));

const handleRefresh = async () => {
  await refreshLogs();
  ElMessage.success('日志已刷新');
};

const handleClear = async () => {
  try {
    await ElMessageBox.confirm('确定清空全部操作日志吗？此操作不可恢复。', '清空日志', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消',
    });
    await clearActivityLogs();
    ElMessage.success('日志已清空');
  } catch {
    // cancelled
  }
};

let removeAppendListener = null;
let removeClearListener = null;

onMounted(async () => {
  await refreshLogs();
  removeAppendListener = onActivityLogAppend((log) => prependLog(log));
  removeClearListener = onActivityLogClear(() => {
    activityLogs.value = [];
  });
});

onBeforeUnmount(() => {
  removeAppendListener?.();
  removeClearListener?.();
});
</script>

<template>
  <section class="logs-layout">
    <header class="header">
      <div>
        <p class="eyebrow">操作审计</p>
        <h2>日志管理</h2>
      </div>
      <div class="header-actions">
        <el-button :icon="Refresh" @click="handleRefresh">刷新</el-button>
        <el-button type="danger" plain @click="handleClear">清空日志</el-button>
      </div>
    </header>

    <div class="logs-stats">
      <article class="summary-card performance logs-stat-card">
        <el-icon><Document /></el-icon>
        <div>
          <span>当前筛选</span>
          <strong>{{ stats.total }} 条</strong>
        </div>
      </article>
      <article class="summary-card work logs-stat-card">
        <el-icon><Document /></el-icon>
        <div>
          <span>考勤打卡</span>
          <strong>{{ stats.attendance }} 条</strong>
        </div>
      </article>
      <article class="summary-card done logs-stat-card">
        <el-icon><Document /></el-icon>
        <div>
          <span>喝水操作</span>
          <strong>{{ stats.water }} 条</strong>
        </div>
      </article>
      <article class="summary-card makeup logs-stat-card">
        <el-icon><Document /></el-icon>
        <div>
          <span>任务操作</span>
          <strong>{{ stats.task }} 条</strong>
        </div>
      </article>
    </div>

    <article class="settings-panel logs-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">筛选条件</p>
          <h3>操作记录</h3>
        </div>
        <div class="logs-filters">
          <el-select v-model="categoryFilter" size="large" style="width: 140px">
            <el-option
              v-for="option in categoryOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-select v-model="rangeFilter" size="large" style="width: 120px">
            <el-option
              v-for="option in rangeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>
      </div>

      <el-empty v-if="!filteredLogs.length" description="暂无符合条件的操作日志" />

      <ul v-else class="activity-log-list">
        <li v-for="log in filteredLogs" :key="log.id" class="activity-log-item">
          <div class="activity-log-topline">
            <el-tag
              :type="LOG_CATEGORIES[log.category]?.tagType || 'info'"
              effect="light"
              size="small"
            >
              {{ LOG_CATEGORIES[log.category]?.label || log.category }}
            </el-tag>
            <strong>{{ log.title }}</strong>
            <span>{{ formatLogTime(log.recordedAt) }}</span>
          </div>
          <p class="activity-log-summary">{{ log.summary }}</p>
        </li>
      </ul>
    </article>
  </section>
</template>
