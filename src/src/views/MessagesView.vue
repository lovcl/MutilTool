<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Bell, Refresh } from '@element-plus/icons-vue';
import { useMessages } from '../composables/useMessages';
import {
  MESSAGE_CATEGORIES,
  buildMessageActionText,
  formatMessageTime,
  getMessageKindLabel,
  splitMessageBody,
} from '../utils/messageMeta';

const {
  messages,
  refreshMessages,
  clearMessages,
  prependMessage,
  replaceMessages,
  onMessageAppend,
  onMessageClear,
  onMessagesReplaced,
} = useMessages();

const categoryFilter = ref('all');
const rangeFilter = ref('today');
const hidePreview = ref(false);

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

const filteredMessages = computed(() => {
  const rangeStart = getRangeStart();

  return messages.value.filter((message) => {
    if (hidePreview.value && message.isTest) {
      return false;
    }

    if (categoryFilter.value !== 'all' && message.category !== categoryFilter.value) {
      return false;
    }

    if (!rangeStart) {
      return true;
    }

    return new Date(message.shownAt) >= rangeStart;
  });
});

const stats = computed(() => ({
  total: filteredMessages.value.length,
  attendance: filteredMessages.value.filter((message) => message.category === 'attendance').length,
  water: filteredMessages.value.filter((message) => message.category === 'water').length,
  toilet: filteredMessages.value.filter((message) => message.category === 'toilet').length,
  task: filteredMessages.value.filter((message) => message.category === 'task').length,
}));

const handleRefresh = async () => {
  await refreshMessages();
  ElMessage.success('消息已刷新');
};

const handleClear = async () => {
  try {
    await ElMessageBox.confirm('确定清空全部系统提醒消息吗？此操作不可恢复。', '清空消息', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消',
    });
    await clearMessages();
    ElMessage.success('消息已清空');
  } catch {
    // cancelled
  }
};

let removeAppendListener = null;
let removeClearListener = null;
let removeReplacedListener = null;

onMounted(async () => {
  await refreshMessages();
  removeAppendListener = onMessageAppend((message) => prependMessage(message));
  removeClearListener = onMessageClear(() => {
    messages.value = [];
  });
  removeReplacedListener = onMessagesReplaced((nextMessages) => replaceMessages(nextMessages));
});

onBeforeUnmount(() => {
  removeAppendListener?.();
  removeClearListener?.();
  removeReplacedListener?.();
});
</script>

<template>
  <section class="logs-layout">
    <header class="header">
      <div>
        <p class="eyebrow">消息中心</p>
        <h2>通知与提醒</h2>
      </div>
      <div class="header-actions">
        <el-button :icon="Refresh" @click="handleRefresh">刷新</el-button>
        <el-button type="danger" plain @click="handleClear">清空消息</el-button>
      </div>
    </header>

    <div class="logs-stats">
      <article class="summary-card performance logs-stat-card">
        <el-icon><Bell /></el-icon>
        <div>
          <span>当前筛选</span>
          <strong>{{ stats.total }} 条</strong>
        </div>
      </article>
      <article class="summary-card work logs-stat-card">
        <el-icon><Bell /></el-icon>
        <div>
          <span>打卡提醒</span>
          <strong>{{ stats.attendance }} 条</strong>
        </div>
      </article>
      <article class="summary-card done logs-stat-card">
        <el-icon><Bell /></el-icon>
        <div>
          <span>喝水提醒</span>
          <strong>{{ stats.water }} 条</strong>
        </div>
      </article>
      <article class="summary-card makeup logs-stat-card">
        <el-icon><Bell /></el-icon>
        <div>
          <span>如厕 / 任务</span>
          <strong>{{ stats.toilet + stats.task }} 条</strong>
        </div>
      </article>
    </div>

    <article class="settings-panel logs-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">系统主动提醒</p>
          <h3>提醒记录</h3>
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
          <el-checkbox v-model="hidePreview">隐藏预览</el-checkbox>
        </div>
      </div>

      <el-alert
        title="记录右下角系统提醒弹窗的内容，以及您点击的操作（如立即打卡、已喝水、关闭等）。"
        type="info"
        show-icon
        :closable="false"
        class="messages-tip"
      />

      <el-empty v-if="!filteredMessages.length" description="暂无符合条件的提醒消息" />

      <ul v-else class="activity-log-list message-list">
        <li v-for="message in filteredMessages" :key="message.id" class="activity-log-item message-item">
          <div class="activity-log-topline">
            <div class="message-tags">
              <el-tag
                :type="MESSAGE_CATEGORIES[message.category]?.tagType || 'info'"
                effect="light"
                size="small"
              >
                {{ MESSAGE_CATEGORIES[message.category]?.label || message.category }}
              </el-tag>
              <el-tag v-if="message.kind" size="small" effect="plain">
                {{ getMessageKindLabel(message.kind) }}
              </el-tag>
              <el-tag v-if="message.isTest" size="small" type="info" effect="plain">预览</el-tag>
            </div>
            <strong>{{ message.title }}</strong>
            <span>{{ formatMessageTime(message.shownAt) }}</span>
          </div>

          <p class="activity-log-summary message-lead">
            {{ splitMessageBody(message.body).lead || message.body }}
          </p>
          <p v-if="splitMessageBody(message.body).detail" class="message-detail">
            {{ splitMessageBody(message.body).detail }}
          </p>
          <p class="message-action">{{ buildMessageActionText(message) }}</p>
        </li>
      </ul>
    </article>
  </section>
</template>

<style scoped>
.messages-tip {
  margin-bottom: 16px;
}

.message-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.message-item .activity-log-topline {
  align-items: flex-start;
}

.message-lead {
  margin-top: 8px;
}

.message-detail {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.message-action {
  margin: 8px 0 0;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}
</style>
