<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  Calendar,
  CoffeeCup,
  Guide,
  List,
} from '@element-plus/icons-vue';
import {
  APP_RULES_CONFIG,
  CALENDAR_YEAR,
  formatDateKey,
  getDateMeta,
} from '../data/workCalendar';
import { useHomePunch } from '../composables/useHomePunch';
import { usePerformanceRecords } from '../composables/usePerformanceRecords';
import { useTasks } from '../composables/useTasks';
import { useWaterRecords } from '../composables/useWaterRecords';
import { useToiletRecords } from '../composables/useToiletRecords';
import { createAttendanceBase, getMonthlyAttendanceDetails } from '../utils/attendance';
import { canPerformHomePunch, getDisplayPunchTimes } from '../utils/homePunch';
import { PERFORMANCE_HOURS_PER_WORKDAY, restdayDefaultRecord } from '../utils/performance';
import {
  getPerformanceAchievement,
} from '../utils/performanceAchievement';
import { formatHours } from '../utils/time';
import PerformanceAchievementTag from '../components/common/PerformanceAchievementTag.vue';
import PerformancePrivacyToggle from '../components/common/PerformancePrivacyToggle.vue';
import { usePerformancePrivacy } from '../composables/usePerformancePrivacy';

const router = useRouter();
const calendarTypeTags = APP_RULES_CONFIG.calendar.typeTags;
const punchLoading = ref(false);
const leavePunchLoading = ref(false);

const {
  performancePrivacyVisible,
  showPrivate,
  showPrivateHoursPair,
  PRIVATE_MASK,
} = usePerformancePrivacy();

const { performanceRecords, refreshRecords: refreshPerformanceRecords } = usePerformanceRecords();
const { performHomePunch, performLeavePunch, getHomePunchLabel, getLeavePunchLabel } = useHomePunch();
const { tasks, taskReminderEnabled, refreshTasks, loadTaskReminderStatus } = useTasks();
const {
  waterConfig,
  todayDrinkCount,
  todayProgress,
  waterReminderEnabled,
  refreshRecords: refreshWaterRecords,
  loadWaterReminderStatus,
} = useWaterRecords();
const {
  todayDoneCount,
  todayUrinationCount,
  todayBowelCount,
  todaySchedule,
  toiletReminderEnabled,
  refreshRecords: refreshToiletRecords,
  loadToiletReminderStatus,
  onToiletRecord,
} = useToiletRecords();

const today = new Date();
const todayKey = formatDateKey(today);
const todayMeta = computed(() => getDateMeta(today));
const currentMonth = today.getMonth();

const todayRecord = computed(() => performanceRecords.value[todayKey] || null);
const punchTimes = computed(() => getDisplayPunchTimes(todayRecord.value));
const punchButtonLabel = computed(() => getHomePunchLabel(todayRecord.value));
const leavePunchButtonLabel = computed(() => getLeavePunchLabel(todayRecord.value));
const canHomePunch = computed(() => canPerformHomePunch(todayRecord.value));

const todayAttendance = computed(() => {
  if (!todayMeta.value.isWorkday) {
    return null;
  }

  if (!todayRecord.value) {
    return { text: '今日未打卡', type: 'info' };
  }

  return createAttendanceBase(todayKey, todayRecord.value);
});

const monthTargetHours = computed(() => {
  const lastDay = new Date(CALENDAR_YEAR, currentMonth + 1, 0).getDate();
  const workdays = Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(CALENDAR_YEAR, currentMonth, index + 1);
    return getDateMeta(date).isWorkday ? 1 : 0;
  }).reduce((sum, value) => sum + value, 0);

  return workdays * PERFORMANCE_HOURS_PER_WORKDAY;
});

const monthCompletedHours = computed(() => {
  const monthText = `${CALENDAR_YEAR}-${String(currentMonth + 1).padStart(2, '0')}`;

  return Object.entries(performanceRecords.value)
    .filter(([date]) => date.startsWith(monthText))
    .reduce((sum, [, record]) => sum + Number(record.hours || 0), 0);
});

const quarterTargetHours = computed(() => {
  const quarterIndex = Math.floor(currentMonth / 3);
  let workdays = 0;

  for (let month = quarterIndex * 3; month < quarterIndex * 3 + 3; month += 1) {
    const lastDay = new Date(CALENDAR_YEAR, month + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day += 1) {
      if (getDateMeta(new Date(CALENDAR_YEAR, month, day)).isWorkday) {
        workdays += 1;
      }
    }
  }

  return workdays * PERFORMANCE_HOURS_PER_WORKDAY;
});

const quarterCompletedHours = computed(() => {
  const quarterIndex = Math.floor(currentMonth / 3);
  const monthPrefixes = Array.from({ length: 3 }, (_, index) => {
    const month = quarterIndex * 3 + index + 1;
    return `${CALENDAR_YEAR}-${String(month).padStart(2, '0')}`;
  });

  return Object.entries(performanceRecords.value)
    .filter(([date]) => monthPrefixes.some((prefix) => date.startsWith(prefix)))
    .reduce((sum, [, record]) => sum + Number(record.hours || 0), 0);
});

const todayTargetHours = computed(() =>
  todayMeta.value.isWorkday ? PERFORMANCE_HOURS_PER_WORKDAY : restdayDefaultRecord.hours
);

const todayCompletedHours = computed(() => Number(todayRecord.value?.hours || 0));

const todayAchievement = computed(() =>
  getPerformanceAchievement(todayCompletedHours.value, todayTargetHours.value, 'today')
);

const monthAchievement = computed(() =>
  getPerformanceAchievement(monthCompletedHours.value, monthTargetHours.value, 'month')
);

const quarterAchievement = computed(() =>
  getPerformanceAchievement(quarterCompletedHours.value, quarterTargetHours.value, 'quarter')
);

const monthAttendanceSummary = computed(() => {
  const details = Object.values(getMonthlyAttendanceDetails(currentMonth, performanceRecords.value));

  return {
    freeLateCount: details.filter((detail) => detail.status === 'freeLate').length,
    lateCount: details.filter((detail) => detail.status === 'late').length,
    leaveCount: details.filter((detail) => detail.status === 'leave').length,
  };
});

const displayTodayPerformance = computed(() => {
  if (!performancePrivacyVisible.value) {
    return PRIVATE_MASK;
  }

  if (todayRecord.value) {
    return `${formatHours(todayRecord.value.hours)} h`;
  }

  if (todayMeta.value.isWorkday) {
    return '未打卡';
  }

  return '休息日';
});

const displayTodayAttendance = computed(() => {
  if (!performancePrivacyVisible.value) {
    return PRIVATE_MASK;
  }

  if (todayAttendance.value) {
    return todayAttendance.value.text;
  }

  return '无需考勤';
});

const displayMonthAttendanceFooter = computed(() => {
  if (!performancePrivacyVisible.value) {
    return PRIVATE_MASK;
  }

  return `迟到 ${monthAttendanceSummary.value.lateCount} · 请假 ${monthAttendanceSummary.value.leaveCount}`;
});

const taskStats = computed(() => ({
  total: tasks.value.length,
  pending: tasks.value.filter((task) => !task.completed).length,
  completed: tasks.value.filter((task) => task.completed).length,
  overdue: tasks.value.filter(
    (task) => !task.completed && new Date(task.dueAt).getTime() <= Date.now()
  ).length,
}));

const upcomingTasks = computed(() =>
  tasks.value
    .filter((task) => !task.completed)
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime())
    .slice(0, 2)
);

const formatNextUrination = computed(() => {
  if (!todaySchedule.value.nextUrinationAt) {
    return '--:--';
  }

  const date = new Date(todaySchedule.value.nextUrinationAt);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
});

const formatTaskDueAt = (value) => {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${month}-${day} ${hour}:${minute}`;
};

const getDayTypeTag = (type) => calendarTypeTags[type] || { text: '普通日', tagType: 'info' };

const handleHomePunch = async () => {
  if (!todayMeta.value.isWorkday) {
    ElMessage.info('今日非工作日，无需打卡');
    return;
  }

  punchLoading.value = true;
  try {
    const result = performHomePunch();
    if (result.ok) {
      ElMessage.success(result.message);
      return;
    }

    ElMessage.warning(result.message);
  } finally {
    punchLoading.value = false;
  }
};

const handleLeavePunch = async () => {
  if (!todayMeta.value.isWorkday) {
    ElMessage.info('今日非工作日，无需打卡');
    return;
  }

  leavePunchLoading.value = true;
  try {
    const result = performLeavePunch();
    if (result.ok) {
      ElMessage.success(result.message);
      return;
    }

    ElMessage.warning(result.message);
  } finally {
    leavePunchLoading.value = false;
  }
};

const goCalendar = () => {
  router.push('/calendar');
};

let unsubscribeToiletRecord = null;

onMounted(async () => {
  await Promise.all([
    refreshPerformanceRecords(),
    refreshTasks(),
    refreshWaterRecords(),
    refreshToiletRecords(),
    loadTaskReminderStatus(),
    loadWaterReminderStatus(),
    loadToiletReminderStatus(),
  ]);
  unsubscribeToiletRecord = onToiletRecord();
});

onBeforeUnmount(() => {
  unsubscribeToiletRecord?.();
});
</script>

<template>
  <section class="home-layout">
    <header class="header">
      <div>
        <p class="eyebrow">工作台</p>
        <h2>首页概览</h2>
      </div>
      <div class="header-actions">
        <el-button
          v-if="todayMeta.isWorkday"
          type="primary"
          size="large"
          :loading="punchLoading"
          :disabled="!canHomePunch"
          @click="handleHomePunch"
        >
          {{ punchButtonLabel }}
        </el-button>
        <el-tag type="primary" effect="plain" size="large">
          {{ todayKey }}
        </el-tag>
      </div>
    </header>

    <div class="home-grid">
      <article class="home-card home-card--attendance">
        <div class="home-card__head">
          <div class="home-card__icon">
            <el-icon><Calendar /></el-icon>
          </div>
          <div>
            <p class="home-card__eyebrow">考勤管理</p>
            <h3>今日考勤</h3>
          </div>
          <div class="home-card__head-meta">
            <el-tag :type="getDayTypeTag(todayMeta.type).tagType" effect="plain" size="small">
              {{ todayMeta.label }}
            </el-tag>
            <PerformancePrivacyToggle />
          </div>
        </div>

        <div class="home-card__stats">
          <div class="home-card__stat">
            <span>上班时间</span>
            <strong>{{ showPrivate(punchTimes.checkInTime) }}</strong>
          </div>
          <div class="home-card__stat">
            <span>下班时间</span>
            <strong>{{ showPrivate(punchTimes.checkOutTime) }}</strong>
          </div>
          <div class="home-card__stat">
            <span>今日绩效</span>
            <strong>{{ displayTodayPerformance }}</strong>
          </div>
          <div class="home-card__stat">
            <span>考勤状态</span>
            <strong>{{ displayTodayAttendance }}</strong>
          </div>
        </div>

        <div
          v-if="performancePrivacyVisible && (todayAchievement || monthAchievement || quarterAchievement)"
          class="home-card__achievements"
        >
          <PerformanceAchievementTag v-if="todayAchievement" :text="todayAchievement.text" />
          <PerformanceAchievementTag v-if="monthAchievement" :text="monthAchievement.text" />
          <PerformanceAchievementTag v-if="quarterAchievement" :text="quarterAchievement.text" />
        </div>

        <div class="home-card__actions">
          <el-button
            v-if="todayMeta.isWorkday"
            type="primary"
            :loading="punchLoading"
            :disabled="!canHomePunch"
            @click="handleHomePunch"
          >
            {{ punchButtonLabel }}
          </el-button>
          <el-button
            v-if="todayMeta.isWorkday && leavePunchButtonLabel"
            type="warning"
            plain
            :loading="leavePunchLoading"
            @click="handleLeavePunch"
          >
            {{ leavePunchButtonLabel }}
          </el-button>
          <el-button plain @click="goCalendar">查看考勤详情</el-button>
        </div>

        <div class="home-card__footer">
          <span>本月绩效 {{ showPrivateHoursPair(monthCompletedHours, monthTargetHours) }}</span>
          <span>{{ displayMonthAttendanceFooter }}</span>
        </div>
      </article>

      <router-link to="/tasks" class="home-card home-card--tasks">
        <div class="home-card__head">
          <div class="home-card__icon">
            <el-icon><List /></el-icon>
          </div>
          <div>
            <p class="home-card__eyebrow">任务管理</p>
            <h3>任务概览</h3>
          </div>
          <el-tag :type="taskReminderEnabled ? 'success' : 'info'" effect="plain" size="small">
            {{ taskReminderEnabled ? '提醒开启' : '提醒关闭' }}
          </el-tag>
        </div>

        <div class="home-card__stats">
          <div class="home-card__stat">
            <span>未完成</span>
            <strong>{{ taskStats.pending }} 项</strong>
          </div>
          <div class="home-card__stat">
            <span>已逾期</span>
            <strong>{{ taskStats.overdue }} 项</strong>
          </div>
          <div class="home-card__stat">
            <span>已完成</span>
            <strong>{{ taskStats.completed }} 项</strong>
          </div>
        </div>

        <div class="home-card__footer">
          <template v-if="upcomingTasks.length">
            <span v-for="task in upcomingTasks" :key="task.id">
              {{ task.title }} · {{ formatTaskDueAt(task.dueAt) }}
            </span>
          </template>
          <span v-else>暂无待办任务</span>
        </div>
      </router-link>

      <router-link to="/water" class="home-card home-card--water">
        <div class="home-card__head">
          <div class="home-card__icon">
            <el-icon><CoffeeCup /></el-icon>
          </div>
          <div>
            <p class="home-card__eyebrow">喝水管理</p>
            <h3>今日饮水</h3>
          </div>
          <el-tag :type="waterReminderEnabled ? 'success' : 'info'" effect="plain" size="small">
            {{ waterReminderEnabled ? '提醒开启' : '提醒关闭' }}
          </el-tag>
        </div>

        <div class="home-card__stats">
          <div class="home-card__stat">
            <span>今日已喝</span>
            <strong>{{ todayDrinkCount }} / {{ waterConfig.targetGlassesPerDay }} 杯</strong>
          </div>
          <div class="home-card__stat">
            <span>完成进度</span>
            <strong>{{ todayProgress }}%</strong>
          </div>
        </div>

        <div class="home-card__progress">
          <el-progress :percentage="todayProgress" :stroke-width="8" :show-text="false" />
        </div>

        <div class="home-card__footer">
          <span>约 {{ todayDrinkCount * waterConfig.glassVolumeMl }} ml</span>
          <span>目标 {{ waterConfig.targetGlassesPerDay * waterConfig.glassVolumeMl }} ml</span>
        </div>
      </router-link>

      <router-link to="/toilet" class="home-card home-card--toilet">
        <div class="home-card__head">
          <div class="home-card__icon">
            <el-icon><Guide /></el-icon>
          </div>
          <div>
            <p class="home-card__eyebrow">如厕提醒</p>
            <h3>今日如厕</h3>
          </div>
          <el-tag :type="toiletReminderEnabled ? 'success' : 'info'" effect="plain" size="small">
            {{ toiletReminderEnabled ? '提醒开启' : '提醒关闭' }}
          </el-tag>
        </div>

        <div class="home-card__stats">
          <div class="home-card__stat">
            <span>小号提醒</span>
            <strong>{{ todayUrinationCount }} 次</strong>
          </div>
          <div class="home-card__stat">
            <span>大号提醒</span>
            <strong>{{ todayBowelCount }} 次</strong>
          </div>
          <div class="home-card__stat">
            <span>已完成</span>
            <strong>{{ todayDoneCount }} 次</strong>
          </div>
        </div>

        <div class="home-card__footer">
          <span>下次小号约 {{ formatNextUrination }}</span>
          <span>
            大号档期
            {{ todaySchedule.morningBowelTime || '--:--' }} /
            {{ todaySchedule.afternoonBowelTime || '--:--' }}
          </span>
        </div>
      </router-link>
    </div>
  </section>
</template>
