<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Calendar, Clock, CoffeeCup } from '@element-plus/icons-vue';
import { APP_RULES_CONFIG } from '../data/workCalendar';
import { useWaterRecords } from '../composables/useWaterRecords';
import AppSwitch from '../components/common/AppSwitch.vue';
import {
  filterRecordsByDateRange,
  flattenWaterRecords,
  formatRecordClock,
  getDefaultHistoryRange,
  sortRecordsNewestFirst,
} from '../utils/habitRecords';

const waterRules = APP_RULES_CONFIG.water;
const {
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
  manualDrink,
  refreshRecords,
  onWaterRecord,
} = useWaterRecords();

const recordView = ref('today');
const historyRange = ref(getDefaultHistoryRange());

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
    filterRecordsByDateRange(flattenWaterRecords(waterRecords.value), historyRange.value)
  )
);

const displayedRecords = computed(() =>
  recordView.value === 'today' ? sortedTodayRecords.value : historyRecords.value
);

const reminderHoursText = computed(() => {
  const { workHours, breaks } = waterRules.reminder;
  return `${workHours.startTime} - ${workHours.endTime}（午休 ${breaks[0].startTime} - ${breaks[0].endTime} 不提醒）`;
});

const actionLabelMap = {
  drink: '已喝水',
  later: '稍后提醒',
  skip: '此次不喝',
};

const actionTypeMap = {
  drink: 'success',
  later: 'warning',
  skip: 'info',
};

const getSourceLabel = (record) => {
  if (record.source === 'manual') {
    return '手动补录';
  }

  if (record.source === 'later-follow-up') {
    return '稍后跟进提醒';
  }

  return '系统整点提醒';
};

const handleManualDrink = async () => {
  await manualDrink();
  ElMessage.success('已记录喝水 1 杯');
};

let unsubscribeRecord = null;

onMounted(async () => {
  await refreshRecords();
  await loadWaterReminderStatus();
  unsubscribeRecord = onWaterRecord();
});

onBeforeUnmount(() => {
  unsubscribeRecord?.();
});
</script>

<template>
  <section class="water-layout">
    <header class="header">
      <div>
        <p class="eyebrow">健康习惯</p>
        <h2>喝水管理</h2>
      </div>
      <el-tag type="primary" effect="plain" size="large">
        今日 {{ todayDrinkCount }} / {{ waterConfig.targetGlassesPerDay }} 杯
      </el-tag>
    </header>

    <div class="water-grid">
      <article class="settings-panel water-progress-panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">今日进度</p>
            <h3>饮水目标</h3>
          </div>
          <el-button type="primary" @click="handleManualDrink">
            手动记录一杯
          </el-button>
        </div>

        <div class="water-progress-ring">
          <el-progress type="dashboard" :percentage="todayProgress" :width="168">
            <template #default>
              <div class="water-progress-center">
                <strong>{{ todayDrinkCount }}</strong>
                <span>/ {{ waterConfig.targetGlassesPerDay }} 杯</span>
              </div>
            </template>
          </el-progress>
        </div>

        <div class="water-stats-row">
          <article class="summary-card done water-stat-card">
            <el-icon><CoffeeCup /></el-icon>
            <div>
              <span>已喝水</span>
              <strong>{{ todayDrinkCount }} 杯</strong>
              <em>约 {{ todayDrinkCount * waterConfig.glassVolumeMl }} ml</em>
            </div>
          </article>
          <article class="summary-card attendance water-stat-card">
            <el-icon><Clock /></el-icon>
            <div>
              <span>稍后提醒</span>
              <strong>{{ todayLaterCount }} 次</strong>
              <em>选择「稍后提醒」会记录</em>
            </div>
          </article>
          <article class="summary-card performance water-stat-card">
            <el-icon><Calendar /></el-icon>
            <div>
              <span>此次不喝</span>
              <strong>{{ todaySkipCount }} 次</strong>
              <em>选择「此次不喝」会记录</em>
            </div>
          </article>
        </div>
      </article>

      <article class="settings-panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">系统提醒</p>
            <h3>整点喝水提醒</h3>
          </div>
          <AppSwitch
            v-model="waterReminderEnabled"
            label="喝水提醒"
            :loading="waterReminderLoading"
            @change="updateWaterReminder"
          />
        </div>

        <el-alert
          title="工作日上班时段内，每个整点弹出系统级提醒；点击「已喝水」「稍后提醒」或「此次不喝」都会写入记录，也可手动补录。"
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
              <strong>提醒频率</strong>
              <span>上班时段内每逢整点提醒一次（如 09:00、10:00、11:00…）</span>
            </div>
          </li>
          <li>
            <el-icon><CoffeeCup /></el-icon>
            <div>
              <strong>建议饮水量</strong>
              <span>每次约 {{ waterConfig.glassVolumeMl }} ml，每日目标 {{ waterConfig.targetGlassesPerDay }} 杯</span>
            </div>
          </li>
        </ul>
      </article>

      <article class="settings-panel water-log-panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">记录查询</p>
            <h3>{{ recordView === 'today' ? todayKey : '历史记录' }}</h3>
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
            size="default"
            unlink-panels
            :clearable="false"
          />
        </div>

        <el-empty
          v-if="!displayedRecords.length"
          :description="recordView === 'today' ? '今天还没有喝水记录' : '所选日期范围内暂无记录'"
        />

        <ul v-else class="water-log-list">
          <li v-for="record in displayedRecords" :key="record.id">
            <div class="water-log-main">
              <el-tag :type="actionTypeMap[record.action]" effect="light" size="small">
                {{ actionLabelMap[record.action] }}
              </el-tag>
              <strong>{{ record.scheduledLabel || '手动记录' }}</strong>
              <span v-if="recordView === 'history'" class="habit-record-date">{{ record.dateKey }}</span>
              <span>{{ formatRecordClock(record.recordedAt) }}</span>
            </div>
            <em>{{ getSourceLabel(record) }}</em>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>
