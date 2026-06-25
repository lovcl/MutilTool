<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Calendar, Clock, Delete, Guide } from '@element-plus/icons-vue';
import { APP_RULES_CONFIG } from '../data/workCalendar';
import { useToiletRecords, normalizeDayEntry } from '../composables/useToiletRecords';
import AppSwitch from '../components/common/AppSwitch.vue';
import BowelMarkDialog from '../components/toilet/BowelMarkDialog.vue';
import UrinationMarkDialog from '../components/toilet/UrinationMarkDialog.vue';
import {
  filterRecordsByDateRange,
  flattenToiletRecords,
  formatRecordClock,
  getDefaultHistoryRange,
  sortRecordsNewestFirst,
} from '../utils/habitRecords';
import {
  getBowelRecordSummary,
  getBowelStatusTagType,
  getUrinationRecordSummary,
  getUrinationStatusTagType,
} from '../utils/toiletRecordMeta';

const toiletRules = APP_RULES_CONFIG.toilet;
const {
  toiletRecords,
  todayKey,
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
  refreshRecords,
} = useToiletRecords();

const recordView = ref('today');
const historyRange = ref(getDefaultHistoryRange());
const manualLoading = ref('');
const bowelDialogVisible = ref(false);
const urinationDialogVisible = ref(false);

const sortedTodayRecords = computed(() =>
  sortRecordsNewestFirst(
    todayRecords.value.map((record) => ({
      dateKey: todayKey,
      ...record,
    }))
  )
);

const historyRecords = computed(() =>
  sortRecordsNewestFirst(
    filterRecordsByDateRange(
      flattenToiletRecords(toiletRecords.value, normalizeDayEntry),
      historyRange.value
    )
  )
);

const displayedRecords = computed(() =>
  recordView.value === 'today' ? sortedTodayRecords.value : historyRecords.value
);

const reminderHoursText = computed(() => {
  const { workHours, breaks } = toiletRules.reminder;
  return `${workHours.startTime} - ${workHours.endTime}（午休 ${breaks[0].startTime} - ${breaks[0].endTime} 不提醒）`;
});

const actionLabelMap = {
  done: '已完成',
  later: '稍后提醒',
  skip: '跳过',
};

const typeLabelMap = {
  urination: '小便',
  bowel: '大便',
};

const actionTypeMap = {
  done: 'success',
  later: 'warning',
  skip: 'info',
};

const formatNextUrination = computed(() => {
  if (!todaySchedule.value.nextUrinationAt) {
    return '--:--';
  }

  const date = new Date(todaySchedule.value.nextUrinationAt);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
});

const getSourceLabel = (record) => {
  if (record.source === 'manual') {
    return '手动补录';
  }

  if (record.source === 'later-follow-up') {
    return '稍后跟进提醒';
  }

  return '系统提醒';
};

const handleManualMark = async (reminderType) => {
  if (reminderType === 'bowel') {
    bowelDialogVisible.value = true;
    return;
  }

  if (reminderType === 'urination') {
    urinationDialogVisible.value = true;
  }
};

const handleUrinationConfirm = async ({ urinationStatus, urinationColor }) => {
  manualLoading.value = 'urination';
  try {
    await manualMark('urination', { urinationStatus, urinationColor });
    ElMessage.success(
      `已记录小便（${getUrinationRecordSummary({ urinationStatus, urinationColor })}）`
    );
  } finally {
    manualLoading.value = '';
  }
};

const handleBowelConfirm = async ({ bowelStatus, bowelCustomText }) => {
  manualLoading.value = 'bowel';
  try {
    await manualMark('bowel', { bowelStatus, bowelCustomText });
    ElMessage.success(
      `已记录大便（${getBowelRecordSummary({ bowelStatus, bowelCustomText })}）`
    );
  } finally {
    manualLoading.value = '';
  }
};

const handleDeleteRecord = async (record) => {
  const typeLabel = typeLabelMap[record.reminderType] || '如厕';
  try {
    await ElMessageBox.confirm(`确定删除这条${typeLabel}记录吗？`, '删除记录', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    const result = await deleteRecord(record.dateKey || todayKey, record.id);
    if (result?.ok === false) {
      ElMessage.warning('记录不存在或已删除');
      return;
    }
    ElMessage.success('记录已删除');
  } catch {
    // cancelled
  }
};

let unsubscribeRecord = null;
let unsubscribeRecordDeleted = null;

onMounted(async () => {
  await refreshRecords();
  await loadToiletReminderStatus();
  unsubscribeRecord = onToiletRecord();
  unsubscribeRecordDeleted = onToiletRecordDeleted();
});

onBeforeUnmount(() => {
  unsubscribeRecord?.();
  unsubscribeRecordDeleted?.();
});
</script>

<template>
  <section class="water-layout">
    <header class="header">
      <div>
        <p class="eyebrow">健康习惯</p>
        <h2>如厕提醒</h2>
      </div>
      <el-tag type="primary" effect="plain" size="large">
        今日完成 {{ todayDoneCount }} 次
      </el-tag>
    </header>

    <div class="water-grid">
      <article class="settings-panel water-progress-panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">今日概览</p>
            <h3>{{ todayKey }}</h3>
          </div>
          <div class="habit-manual-actions">
            <el-button
              type="primary"
              plain
              :loading="manualLoading === 'urination'"
              @click="handleManualMark('urination')"
            >
              标记小便
            </el-button>
            <el-button
              type="primary"
              :loading="manualLoading === 'bowel'"
              @click="handleManualMark('bowel')"
            >
              标记大便
            </el-button>
          </div>
        </div>

        <div class="water-stats-row">
          <article class="summary-card done water-stat-card">
            <el-icon><Guide /></el-icon>
            <div>
              <span>小便提醒</span>
              <strong>{{ todayUrinationCount }} 次</strong>
              <em>下次约 {{ formatNextUrination }}</em>
            </div>
          </article>
          <article class="summary-card attendance water-stat-card">
            <el-icon><Calendar /></el-icon>
            <div>
              <span>大便提醒</span>
              <strong>{{ todayBowelCount }} 次</strong>
              <em>
                上午 {{ todaySchedule.morningBowelTime || '--:--' }} /
                下午 {{ todaySchedule.afternoonBowelTime || '--:--' }}
              </em>
            </div>
          </article>
          <article class="summary-card performance water-stat-card">
            <el-icon><Clock /></el-icon>
            <div>
              <span>已完成</span>
              <strong>{{ todayDoneCount }} 次</strong>
              <em>含手动响应与系统提醒</em>
            </div>
          </article>
        </div>
      </article>

      <article class="settings-panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">系统提醒</p>
            <h3>工作日如厕提醒</h3>
          </div>
          <AppSwitch
            v-model="toiletReminderEnabled"
            label="如厕提醒"
            :loading="toiletReminderLoading"
            @change="updateToiletReminder"
          />
        </div>

        <el-alert
          title="仅在工作日上班时段提醒：小便从上班起至下班，随机 1~1.5 小时一次；点「已完成」或关闭弹窗后重新随机计时，点「稍后提醒」则 15 分钟后再提醒；大便上午、下午各一次；任意两次提醒间隔不少于 30 分钟。"
          type="success"
          show-icon
          :closable="false"
        />

        <ul class="water-rule-list">
          <li>
            <el-icon><Calendar /></el-icon>
            <div>
              <strong>提醒时段</strong>
              <span>{{ reminderHoursText }}</span>
            </div>
          </li>
          <li>
            <el-icon><Clock /></el-icon>
            <div>
              <strong>小便频率</strong>
              <span>
                上班后至下班，间隔约 1~1.5 小时随机提醒；「已完成」或关闭弹窗后重新随机，「稍后提醒」15 分钟后再提醒
              </span>
            </div>
          </li>
          <li>
            <el-icon><Guide /></el-icon>
            <div>
              <strong>大便安排</strong>
              <span>
                上午 {{ toiletRules.reminder.bowelWindows.morning.startTime }} -
                {{ toiletRules.reminder.bowelWindows.morning.endTime }}、下午
                {{ toiletRules.reminder.bowelWindows.afternoon.startTime }} -
                {{ toiletRules.reminder.bowelWindows.afternoon.endTime }} 各提醒一次
              </span>
            </div>
          </li>
        </ul>
      </article>

      <article class="settings-panel water-log-panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">记录查询</p>
            <h3>{{ recordView === 'today' ? '今日响应' : '历史记录' }}</h3>
          </div>
          <el-tag effect="plain">{{ displayedRecords.length }} 条</el-tag>
        </div>

        <div class="habit-history-toolbar">
          <el-radio-group v-model="recordView" size="small">
            <el-radio-button value="today">今日</el-radio-button>
            <el-radio-button value="history">历史</el-radio-button>
          </el-radio-group>
          <el-date-picker
            v-if="recordView === 'history'"
            v-model="historyRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            unlink-panels
            :clearable="false"
          />
        </div>

        <el-empty
          v-if="!displayedRecords.length"
          :description="recordView === 'today' ? '今天还没有如厕记录' : '所选日期范围内暂无记录'"
        />

        <ul v-else class="water-log-list">
          <li v-for="record in displayedRecords" :key="record.id" class="habit-record-item">
            <div class="water-log-main">
              <el-tag :type="actionTypeMap[record.action]" effect="light" size="small">
                {{ actionLabelMap[record.action] }}
              </el-tag>
              <el-tag effect="plain" size="small">
                {{ typeLabelMap[record.reminderType] || record.reminderType }}
              </el-tag>
              <el-tag
                v-if="record.reminderType === 'urination'"
                :type="getUrinationStatusTagType(record.urinationStatus)"
                effect="light"
                size="small"
              >
                {{ getUrinationRecordSummary(record) }}
              </el-tag>
              <el-tag
                v-if="record.reminderType === 'bowel'"
                :type="getBowelStatusTagType(record.bowelStatus)"
                effect="light"
                size="small"
              >
                {{ getBowelRecordSummary(record) }}
              </el-tag>
              <strong>{{ record.scheduledLabel || '手动记录' }}</strong>
              <span v-if="recordView === 'history'" class="habit-record-date">{{ record.dateKey }}</span>
              <span>{{ formatRecordClock(record.recordedAt) }}</span>
            </div>
            <div class="habit-record-item__footer">
              <em>{{ getSourceLabel(record) }}</em>
              <el-button
                class="habit-record-item__delete"
                type="danger"
                link
                size="small"
                :icon="Delete"
                @click="handleDeleteRecord(record)"
              >
                删除
              </el-button>
            </div>
          </li>
        </ul>
      </article>
    </div>

    <BowelMarkDialog v-model:visible="bowelDialogVisible" @confirm="handleBowelConfirm" />
    <UrinationMarkDialog
      v-model:visible="urinationDialogVisible"
      @confirm="handleUrinationConfirm"
    />
  </section>
</template>
