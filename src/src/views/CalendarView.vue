<script setup>
import { computed, ref } from 'vue';
import { Calendar, Clock, InfoFilled, OfficeBuilding } from '@element-plus/icons-vue';
import {
  APP_RULES_CONFIG,
  CALENDAR_YEAR,
  formatDateKey,
  getDateMeta,
  holidayRanges,
  makeupWorkdays,
} from '../data/workCalendar';
import { useCalendarState } from '../composables/useCalendarState';
import { usePerformanceRecords } from '../composables/usePerformanceRecords';
import {
  attendanceRule,
  createAttendanceBase,
  buildAttendanceStatusText,
  getMonthlyAttendanceDetails,
} from '../utils/attendance';
import { resolveDayRecordForm } from '../utils/homePunch';
import {
  formatBreaks,
  getDayModeLabel,
  getEndTimeByEffectiveHours,
  getRecordDayModeHours,
  getRecordPerformanceHours,
  getRestdayPerformanceTimes,
  isDayPerformanceExcluded,
  normalizeDayMode,
  PERFORMANCE_HOURS_PER_WORKDAY,
  DAY_MODE_OPTIONS,
  resolveRecordDisplayHours,
  resolveRecordPerformanceHours,
  restdayDefaultRecord,
  restdayQuickHours,
  restdayRule,
  workdayDefaultRecord,
  workdayQuickHours,
  workdayRule,
} from '../utils/performance';
import { getPerformanceAchievement } from '../utils/performanceAchievement';
import { formatHours, getEndTimeByHours } from '../utils/time';
import {
  createDefaultLeavePeriod,
  formatLeavePeriodLabel,
  getEffectiveLeavePeriods,
  mergeEarlyCheckoutLeavePeriods,
  normalizeLeavePeriods,
} from '../utils/leavePeriods';
import PerformanceAchievementTag from '../components/common/PerformanceAchievementTag.vue';
import PerformancePrivacyToggle from '../components/common/PerformancePrivacyToggle.vue';
import { usePerformancePrivacy } from '../composables/usePerformancePrivacy';

const { selectedMonth, setMonth } = useCalendarState();
const { performanceRecords, savePerformanceRecord, removePerformanceRecord } = usePerformanceRecords();
const {
  performancePrivacyVisible,
  showPrivate,
  showPrivateHoursText,
  PRIVATE_MASK,
} = usePerformancePrivacy();

const todayKey = formatDateKey(new Date());
const performanceDialogVisible = ref(false);
const dayRecordDialogVisible = ref(false);
const selectedDay = ref(null);
const dayRecordForm = ref({ ...workdayDefaultRecord });
const showPunchRulesHint = ref(false);
const showDayModeRulesHint = ref(false);
const showLeavePeriodRulesHint = ref(false);

const weekLabels = APP_RULES_CONFIG.calendar.weekLabels;
const dayRecordInfoTitle = `工作日默认打卡 ${workdayDefaultRecord.startTime} - ${workdayDefaultRecord.endTime}，只统计 ${workdayRule.performanceStartTime} 以后的绩效，共 ${workdayDefaultRecord.hours} 小时；周末/节假日默认 ${restdayDefaultRecord.startTime} - ${restdayDefaultRecord.endTime}，扣除 ${formatBreaks(restdayRule.breaks)} 后完成 ${restdayDefaultRecord.hours} 小时。工作日与周末加班均按 0.5 小时向下取整；周末加班早于 ${restdayDefaultRecord.startTime} 打卡从 ${restdayDefaultRecord.startTime} 起算，下班时间向下取整到 30 分钟。`;
const restdayBreakTitle = `${formatBreaks(restdayRule.breaks)} 不计入结算/调休与额外出勤时长。`;
const dayModeInfoTitle =
  '额外出勤计入绩效。结算/调休不计入绩效：工作日从 19:00 计到下班；休息日按打卡时段计，扣除午休与晚休 1 小时。';
const leavePeriodInfoTitle =
  '可手动添加多次离岗，例如 10:00 至 13:30 表示上午请假；会自动扣除午休重叠时间并按 30 分钟折算请假小时。也可在首页考勤管理使用「离岗打卡 / 返岗打卡」记录中间请假。早于 18:00 的最终下班均按请假折算；17:55 系统弹窗选择「按 18:00 打卡」视为正常下班，不计提前请假。';

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  label: `${index + 1}月`,
  value: index,
}));

const calendarTypeTags = APP_RULES_CONFIG.calendar.typeTags;
const tagTypeMap = Object.fromEntries(
  Object.entries(calendarTypeTags).map(([type, tag]) => [type, tag.tagType])
);
const tagTextMap = Object.fromEntries(
  Object.entries(calendarTypeTags).map(([type, tag]) => [type, tag.text])
);

const getAttendanceDetail = (dateKey) => {
  const month = Number(dateKey.slice(5, 7)) - 1;
  return getMonthlyAttendanceDetails(month, performanceRecords.value)[dateKey] || null;
};

const calendarDays = computed(() => {
  const month = selectedMonth.value;
  const firstDate = new Date(CALENDAR_YEAR, month, 1);
  const startDate = new Date(firstDate);
  startDate.setDate(firstDate.getDate() - firstDate.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const meta = getDateMeta(date);

    const record = performanceRecords.value[meta.key];
    const dayMode = normalizeDayMode(record?.dayMode ?? record?.restdayMode);

    return {
      ...meta,
      date,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
      isToday: meta.key === todayKey,
      hasRecord: Boolean(record),
      completedHours: resolveRecordPerformanceHours(meta.key, record),
      displayHours: resolveRecordDisplayHours(meta.key, record),
      dayModeLabel: record ? getDayModeLabel(dayMode) : '',
      performanceExcluded: Boolean(record) && isDayPerformanceExcluded(dayMode),
      attendance: getAttendanceDetail(meta.key),
    };
  });
});

const currentMonthDays = computed(() => calendarDays.value.filter((day) => day.inCurrentMonth));

const workdayCount = computed(() => currentMonthDays.value.filter((day) => day.isWorkday).length);

const statutoryHolidayCount = computed(() =>
  currentMonthDays.value.filter((day) => day.type === 'statutoryHoliday').length
);

const makeupWorkdayCount = computed(() =>
  currentMonthDays.value.filter((day) => day.type === 'makeupWorkday').length
);

const monthHolidays = computed(() => {
  const monthText = `${CALENDAR_YEAR}-${String(selectedMonth.value + 1).padStart(2, '0')}`;

  return holidayRanges
    .map((holiday) => ({
      ...holiday,
      dates: holiday.dates.filter((date) => date.startsWith(monthText)),
    }))
    .filter((holiday) => holiday.dates.length);
});

const monthMakeupWorkdays = computed(() => {
  const monthText = `${CALENDAR_YEAR}-${String(selectedMonth.value + 1).padStart(2, '0')}`;

  return Object.entries(makeupWorkdays)
    .filter(([date]) => date.startsWith(monthText))
    .map(([date, label]) => ({ date, label }));
});

const countWorkdaysInMonth = (month) => {
  const lastDay = new Date(CALENDAR_YEAR, month + 1, 0).getDate();

  return Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(CALENDAR_YEAR, month, index + 1);
    return getDateMeta(date).isWorkday ? 1 : 0;
  }).reduce((sum, value) => sum + value, 0);
};

const monthlyPerformance = computed(() =>
  monthOptions.map((month) => {
    const workdays = countWorkdaysInMonth(month.value);

    return {
      ...month,
      workdays,
      hours: workdays * PERFORMANCE_HOURS_PER_WORKDAY,
      quarter: Math.floor(month.value / 3) + 1,
    };
  })
);

const quarterlyPerformance = computed(() =>
  Array.from({ length: 4 }, (_, index) => {
    const months = monthlyPerformance.value.slice(index * 3, index * 3 + 3);
    const workdays = months.reduce((sum, month) => sum + month.workdays, 0);

    return {
      label: `Q${index + 1}`,
      range: `${index * 3 + 1}月 - ${index * 3 + 3}月`,
      workdays,
      hours: workdays * PERFORMANCE_HOURS_PER_WORKDAY,
    };
  })
);

const selectedMonthPerformance = computed(() => monthlyPerformance.value[selectedMonth.value]);

const selectedQuarterPerformance = computed(() => {
  const quarterIndex = Math.floor(selectedMonth.value / 3);
  return quarterlyPerformance.value[quarterIndex];
});

const selectedQuarterMonths = computed(() => {
  const quarterIndex = Math.floor(selectedMonth.value / 3);
  return monthlyPerformance.value.slice(quarterIndex * 3, quarterIndex * 3 + 3);
});

const sumResolvedRecordHours = (entries) =>
  entries.reduce(
    (sum, [dateKey, record]) => sum + resolveRecordPerformanceHours(dateKey, record),
    0
  );

const selectedMonthCompletedHours = computed(() => {
  const monthText = `${CALENDAR_YEAR}-${String(selectedMonth.value + 1).padStart(2, '0')}`;

  return sumResolvedRecordHours(
    Object.entries(performanceRecords.value).filter(([date]) => date.startsWith(monthText))
  );
});

const selectedQuarterCompletedHours = computed(() => {
  const monthPrefixes = selectedQuarterMonths.value.map(
    (month) => `${CALENDAR_YEAR}-${String(month.value + 1).padStart(2, '0')}`
  );

  return sumResolvedRecordHours(
    Object.entries(performanceRecords.value).filter(([date]) =>
      monthPrefixes.some((prefix) => date.startsWith(prefix))
    )
  );
});

const todayMeta = computed(() => getDateMeta(new Date()));

const todayCompletedHours = computed(() =>
  resolveRecordPerformanceHours(todayKey, performanceRecords.value[todayKey])
);

const todayTargetHours = computed(() =>
  todayMeta.value.isWorkday ? PERFORMANCE_HOURS_PER_WORKDAY : restdayDefaultRecord.hours
);

const todayAchievement = computed(() =>
  getPerformanceAchievement(todayCompletedHours.value, todayTargetHours.value, 'today')
);

const monthAchievement = computed(() =>
  getPerformanceAchievement(
    selectedMonthCompletedHours.value,
    selectedMonthPerformance.value.hours,
    'month'
  )
);

const quarterAchievement = computed(() =>
  getPerformanceAchievement(
    selectedQuarterCompletedHours.value,
    selectedQuarterPerformance.value.hours,
    'quarter'
  )
);

const selectedMonthAttendanceDetails = computed(() =>
  getMonthlyAttendanceDetails(selectedMonth.value, performanceRecords.value)
);

const selectedMonthAttendanceSummary = computed(() => {
  const details = Object.values(selectedMonthAttendanceDetails.value);

  return {
    freeLateCount: details.filter((detail) => detail.status === 'freeLate').length,
    lateCount: details.filter((detail) => detail.status === 'late').length,
    leaveCount: details.filter((detail) => detail.status === 'leave').length,
    leaveHours: details.reduce((sum, detail) => sum + Number(detail.leaveHours || 0), 0),
  };
});

const selectedMonthAttendanceHeadline = computed(() => {
  const { lateCount, leaveCount } = selectedMonthAttendanceSummary.value;

  if (lateCount > 0) {
    return `额外迟到 ${lateCount} 次`;
  }

  if (leaveCount > 0) {
    return `${leaveCount} 次`;
  }

  return '0 次';
});

const selectedDayRecord = computed(() => {
  if (!selectedDay.value) {
    return null;
  }

  return performanceRecords.value[selectedDay.value.key] || null;
});

const dayRecordAttendancePreview = computed(() => {
  if (!selectedDay.value?.isWorkday) {
    return null;
  }

  const earlyCheckoutContext = buildEarlyCheckoutContext();
  const detail = createAttendanceBase(selectedDay.value.key, {
    startTime: dayRecordForm.value.startTime,
    endTime: dayRecordForm.value.endTime,
    attendance: {
      checkInTime: dayRecordForm.value.startTime,
      leavePeriods: mergeEarlyCheckoutLeavePeriods(
        dayRecordForm.value.leavePeriods,
        dayRecordForm.value.endTime,
        earlyCheckoutContext
      ),
      checkoutViaReminder: earlyCheckoutContext.attendance.checkoutViaReminder,
    },
  });

  if (!detail) {
    return null;
  }

  if (detail.status === 'late' && detail.freeCandidate) {
    const month = Number(selectedDay.value.key.slice(5, 7)) - 1;
    const usedFreeLateCount = Object.entries(getMonthlyAttendanceDetails(month, performanceRecords.value))
      .filter(([date, attendance]) => date !== selectedDay.value.key && attendance.status === 'freeLate')
      .length;

    if (usedFreeLateCount < attendanceRule.freeLateTimesPerMonth) {
      return {
        ...detail,
        status: 'freeLate',
        freeLate: true,
        text: buildAttendanceStatusText(detail.lateMinutes, 'freeLate'),
        type: 'info',
      };
    }
  }

  return detail;
});

const selectedDayQuickHours = computed(() => {
  if (!selectedDay.value) {
    return workdayQuickHours;
  }

  return selectedDay.value.isWorkday ? workdayQuickHours : restdayQuickHours;
});

const selectedDayQuickHourText = computed(() => {
  const hours = selectedDayQuickHours.value;
  const prefix = selectedDay.value?.isWorkday ? '工作日快捷' : '周末/节假日快捷';
  return `${prefix}：${hours[0]} - ${hours[hours.length - 1]} 小时`;
});

const isDayFormPerformanceExcluded = computed(() =>
  isDayPerformanceExcluded(dayRecordForm.value.dayMode)
);

const syncDayRecordHours = () => {
  if (!selectedDay.value) {
    return;
  }

  dayRecordForm.value.hours = Number(
    getRecordDayModeHours(
      selectedDay.value,
      dayRecordForm.value.startTime,
      dayRecordForm.value.endTime,
      dayRecordForm.value.dayMode
    ).toFixed(1)
  );
};

const syncLeavePeriodsFromCheckout = () => {
  if (!selectedDay.value?.isWorkday) {
    return;
  }

  dayRecordForm.value.leavePeriods = mergeEarlyCheckoutLeavePeriods(
    dayRecordForm.value.leavePeriods,
    dayRecordForm.value.endTime,
    buildEarlyCheckoutContext()
  );
};

const buildEarlyCheckoutContext = () => {
  const existingRecord = selectedDayRecord.value;
  const normalEndTime = workdayRule.normalWork.endTime;
  const checkoutViaReminder =
    dayRecordForm.value.endTime === normalEndTime &&
    existingRecord?.attendance?.checkoutViaReminder === 'early'
      ? 'early'
      : undefined;

  return {
    endTime: dayRecordForm.value.endTime,
    attendance: { checkoutViaReminder },
  };
};

const setDayMode = (mode) => {
  dayRecordForm.value.dayMode = mode;
  syncDayRecordHours();
};

const setDayRecordHours = (hours) => {
  if (selectedDay.value?.isWorkday) {
    if (hours === 0) {
      dayRecordForm.value.endTime = workdayRule.normalWork.endTime;
      syncDayRecordHours();
      return;
    }

    dayRecordForm.value.endTime = getEndTimeByHours(workdayRule.performanceStartTime, hours);
    syncDayRecordHours();
    return;
  }

  const { startTime } = getRestdayPerformanceTimes(
    dayRecordForm.value.startTime,
    dayRecordForm.value.endTime
  );
  dayRecordForm.value.endTime = getEndTimeByEffectiveHours(startTime, hours, restdayRule.breaks);
  syncDayRecordHours();
};

const addLeavePeriod = () => {
  if (!Array.isArray(dayRecordForm.value.leavePeriods)) {
    dayRecordForm.value.leavePeriods = [];
  }

  dayRecordForm.value.leavePeriods.push(createDefaultLeavePeriod());
};

const removeLeavePeriod = (index) => {
  dayRecordForm.value.leavePeriods = dayRecordForm.value.leavePeriods.filter((_, itemIndex) => itemIndex !== index);
};

const formatLeavePeriodPreview = (period) => formatLeavePeriodLabel(period);

const openDayRecordDialog = (day) => {
  if (!day.inCurrentMonth) {
    return;
  }

  selectedDay.value = day;

  const existingRecord = performanceRecords.value[day.key];
  dayRecordForm.value = resolveDayRecordForm(day, existingRecord, {
    workdayDefaultRecord,
    restdayDefaultRecord,
  });
  syncDayRecordHours();
  showPunchRulesHint.value = false;
  showDayModeRulesHint.value = false;
  showLeavePeriodRulesHint.value = false;

  dayRecordDialogVisible.value = true;
};

const saveDayRecord = () => {
  if (!selectedDay.value) {
    return;
  }

  const dayMode = normalizeDayMode(dayRecordForm.value.dayMode);
  const hours = getRecordDayModeHours(
    selectedDay.value,
    dayRecordForm.value.startTime,
    dayRecordForm.value.endTime,
    dayMode
  );
  const existingRecord = selectedDayRecord.value;
  const normalEndTime = workdayRule.normalWork.endTime;
  const checkoutViaReminder =
    dayRecordForm.value.endTime === normalEndTime &&
    existingRecord?.attendance?.checkoutViaReminder === 'early'
      ? 'early'
      : undefined;
  const earlyCheckoutContext = {
    endTime: dayRecordForm.value.endTime,
    attendance: { checkoutViaReminder },
  };
  const attendance = selectedDay.value.isWorkday
    ? {
        checkInTime: dayRecordForm.value.startTime,
        scheduledStartTime: attendanceRule.scheduledStartTime,
        leavePeriods: mergeEarlyCheckoutLeavePeriods(
          normalizeLeavePeriods(dayRecordForm.value.leavePeriods),
          dayRecordForm.value.endTime,
          earlyCheckoutContext
        ),
        ...(checkoutViaReminder ? { checkoutViaReminder } : {}),
      }
    : null;

  savePerformanceRecord(selectedDay.value.key, {
    ...dayRecordForm.value,
    dayMode,
    hours: Number(hours.toFixed(1)),
    attendance,
    leavePeriods: undefined,
  });
  dayRecordDialogVisible.value = false;
};

const removeDayRecord = () => {
  if (!selectedDay.value) {
    return;
  }

  removePerformanceRecord(selectedDay.value.key);
  dayRecordDialogVisible.value = false;
};
</script>

<template>
  <header class="header">
    <div>
        <p class="eyebrow">考勤管理</p>
        <h2>{{ CALENDAR_YEAR }} 年工作日历</h2>
    </div>
    <div class="header-actions">
      <PerformancePrivacyToggle />
      <el-select v-model="selectedMonth" class="month-select" size="large">
        <el-option
          v-for="month in monthOptions"
          :key="month.value"
          :label="month.label"
          :value="month.value"
        />
      </el-select>
    </div>
  </header>

  <section class="calendar-layout">
    <article class="calendar-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">{{ selectedMonth + 1 }}月</p>
          <h3>{{ CALENDAR_YEAR }} 年 {{ selectedMonth + 1 }} 月</h3>
        </div>
        <div class="calendar-actions">
          <el-button :disabled="selectedMonth === 0" @click="setMonth(-1)">
            上月
          </el-button>
          <el-button :disabled="selectedMonth === 11" type="primary" @click="setMonth(1)">
            下月
          </el-button>
        </div>
      </div>

      <div class="calendar-weekdays">
        <span v-for="week in weekLabels" :key="week">周{{ week }}</span>
      </div>

      <div class="calendar-grid">
        <div
          v-for="day in calendarDays"
          :key="day.key"
          class="calendar-day"
          :class="[
            `calendar-day--${day.type}`,
            {
              'is-muted': !day.inCurrentMonth,
              'is-today': day.isToday,
              'has-record':
                performancePrivacyVisible &&
                (day.completedHours > 0 || day.performanceExcluded),
              'has-attendance-late':
                performancePrivacyVisible && day.attendance?.status === 'late',
              'has-attendance-leave':
                performancePrivacyVisible && day.attendance?.status === 'leave',
              'has-attendance-freeLate':
                performancePrivacyVisible && day.attendance?.status === 'freeLate',
            },
          ]"
          @click="openDayRecordDialog(day)"
        >
          <div class="day-topline">
            <div class="day-topline-main">
              <span class="day-number">{{ day.day }}</span>
              <el-tag
                v-if="day.isToday"
                class="day-today-tag"
                type="primary"
                effect="dark"
                size="small"
              >
                今天
              </el-tag>
            </div>
            <el-tag
              v-if="day.inCurrentMonth"
              :type="tagTypeMap[day.type]"
              effect="light"
              size="small"
            >
              {{ tagTextMap[day.type] }}
            </el-tag>
          </div>
          <p v-if="day.inCurrentMonth" class="day-label">{{ day.label }}</p>
          <p v-if="day.inCurrentMonth && day.completedHours" class="day-record">
            {{
              performancePrivacyVisible
                ? `已完成 ${formatHours(day.completedHours)} h`
                : PRIVATE_MASK
            }}
          </p>
          <p
            v-else-if="day.inCurrentMonth && day.performanceExcluded && day.displayHours"
            class="day-record day-record--excluded"
          >
            {{
              performancePrivacyVisible
                ? `${day.dayModeLabel} ${formatHours(day.displayHours)} h · 不计绩效`
                : PRIVATE_MASK
            }}
          </p>
          <p
            v-if="day.inCurrentMonth && day.attendance && day.attendance.status !== 'normal'"
            class="day-attendance"
            :class="performancePrivacyVisible ? `day-attendance--${day.attendance.status}` : null"
          >
            {{ showPrivate(day.attendance.text) }}
          </p>
        </div>
      </div>
    </article>

    <aside class="calendar-side">
      <article class="summary-card work">
        <el-icon><OfficeBuilding /></el-icon>
        <div>
          <span>本月工作日</span>
          <strong>{{ workdayCount }} 天</strong>
        </div>
      </article>
      <article class="summary-card holiday">
        <el-icon><Calendar /></el-icon>
        <div>
          <span>法定节假日</span>
          <strong>{{ statutoryHolidayCount }} 天</strong>
        </div>
      </article>
      <article class="summary-card makeup">
        <el-icon><OfficeBuilding /></el-icon>
        <div>
          <span>补班</span>
          <strong>{{ makeupWorkdayCount }} 天</strong>
        </div>
      </article>
      <article class="summary-card performance">
        <el-icon><Calendar /></el-icon>
        <div>
          <span>本月应完成</span>
          <strong>{{ showPrivateHoursText(selectedMonthPerformance.hours) }}</strong>
        </div>
      </article>
      <article class="summary-card done">
        <el-icon><Clock /></el-icon>
        <div>
          <span>本月已完成</span>
          <strong>{{ showPrivateHoursText(selectedMonthCompletedHours) }}</strong>
          <PerformanceAchievementTag
            v-if="performancePrivacyVisible && monthAchievement"
            :text="monthAchievement.text"
          />
        </div>
      </article>
      <article class="summary-card attendance">
        <el-icon><Clock /></el-icon>
        <div>
          <span>本月考勤</span>
          <strong
            :class="{
              'attendance-extra-late':
                performancePrivacyVisible && selectedMonthAttendanceSummary.lateCount > 0,
            }"
          >
            {{ showPrivate(selectedMonthAttendanceHeadline) }}
          </strong>
          <em v-if="performancePrivacyVisible">
            免费 {{ selectedMonthAttendanceSummary.freeLateCount }} 次 / 请假
            {{ formatHours(selectedMonthAttendanceSummary.leaveHours) }} h
          </em>
          <em v-else>{{ PRIVATE_MASK }}</em>
        </div>
      </article>

      <article class="panel mini-panel">
        <div class="panel-header compact">
          <h3>标记说明</h3>
        </div>
        <ul class="legend-list">
          <li><span class="legend-dot workday"></span>工作日</li>
          <li><span class="legend-dot makeup"></span>补班工作日</li>
          <li><span class="legend-dot statutory"></span>法定节假日</li>
          <li><span class="legend-dot rest"></span>调休/连休</li>
        </ul>
      </article>

      <article class="panel mini-panel">
        <div class="panel-header compact">
          <h3>本月节假日</h3>
        </div>
        <el-empty v-if="!monthHolidays.length" description="本月无法定节假日" />
        <ul v-else class="holiday-list">
          <li v-for="holiday in monthHolidays" :key="holiday.name">
            <strong>{{ holiday.name }}</strong>
            <span>{{ holiday.dates[0] }} 至 {{ holiday.dates.at(-1) }}</span>
          </li>
        </ul>
        <ul v-if="monthMakeupWorkdays.length" class="makeup-list">
          <li v-for="item in monthMakeupWorkdays" :key="item.date">
            <span>{{ item.date }}</span>
            <strong>{{ item.label }}</strong>
          </li>
        </ul>
      </article>
    </aside>

    <article class="performance-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">绩效统计</p>
          <h3>当前月 / 当前季度</h3>
        </div>
        <div class="panel-header-actions">
          <el-tag type="primary" effect="plain">
            1 工作日 = {{ PERFORMANCE_HOURS_PER_WORKDAY }} 小时
          </el-tag>
          <el-button text type="primary" @click="performanceDialogVisible = true">
            更多
          </el-button>
        </div>
      </div>

      <div class="performance-current">
        <article
          class="performance-focus-card"
          :class="{ 'is-achieved': performancePrivacyVisible && monthAchievement }"
        >
          <span>{{ selectedMonthPerformance.label }}</span>
          <strong>{{ showPrivateHoursText(selectedMonthPerformance.hours) }}</strong>
          <em v-if="performancePrivacyVisible">
            应完成 {{ selectedMonthPerformance.workdays }} 个工作日，
            已完成 {{ formatHours(selectedMonthCompletedHours) }} h
          </em>
          <em v-else>{{ PRIVATE_MASK }}</em>
          <PerformanceAchievementTag
            v-if="performancePrivacyVisible && monthAchievement"
            :text="monthAchievement.text"
          />
        </article>
        <article
          class="performance-focus-card quarter"
          :class="{ 'is-achieved': performancePrivacyVisible && quarterAchievement }"
        >
          <span>{{ selectedQuarterPerformance.label }}</span>
          <strong>{{ showPrivateHoursText(selectedQuarterPerformance.hours) }}</strong>
          <em v-if="performancePrivacyVisible">
            {{ selectedQuarterPerformance.range }}，应完成
            {{ selectedQuarterPerformance.workdays }} 个工作日，已完成
            {{ formatHours(selectedQuarterCompletedHours) }} h
          </em>
          <em v-else>{{ PRIVATE_MASK }}</em>
          <PerformanceAchievementTag
            v-if="performancePrivacyVisible && quarterAchievement"
            :text="quarterAchievement.text"
          />
        </article>
      </div>

      <div v-if="performancePrivacyVisible && todayAchievement" class="performance-achievements">
        <PerformanceAchievementTag :text="todayAchievement.text" />
      </div>
    </article>

    <el-dialog
      v-model="performanceDialogVisible"
      title="完整绩效统计"
      width="860px"
      class="performance-dialog"
    >
      <div class="performance-dialog-grid">
        <section class="performance-section">
          <h4>所有月份</h4>
          <div class="performance-list monthly">
            <button
              v-for="month in monthlyPerformance"
              :key="month.value"
              class="performance-row"
              :class="{ active: selectedMonth === month.value }"
              type="button"
              @click="selectedMonth = month.value"
            >
              <span>{{ month.label }}</span>
              <strong>{{ showPrivateHoursText(month.hours) }}</strong>
              <em>{{ month.workdays }} 个工作日</em>
            </button>
          </div>
        </section>

        <section class="performance-section">
          <h4>所有季度</h4>
          <div class="performance-list quarterly">
            <div
              v-for="quarter in quarterlyPerformance"
              :key="quarter.label"
              class="performance-row"
            >
              <span>{{ quarter.label }}</span>
              <strong>{{ showPrivateHoursText(quarter.hours) }}</strong>
              <em>{{ quarter.range }}，{{ quarter.workdays }} 个工作日</em>
            </div>
          </div>
        </section>
      </div>
    </el-dialog>

    <el-dialog
      v-model="dayRecordDialogVisible"
      :title="selectedDay ? `${selectedDay.key} 考勤/绩效打卡` : '考勤/绩效打卡'"
      width="520px"
      class="day-record-dialog"
    >
      <div v-if="selectedDay" class="day-record-content">
        <div class="day-record-meta">
          <el-tag :type="tagTypeMap[selectedDay.type]" effect="light">
            {{ selectedDay.label }}
          </el-tag>
          <span>{{ performancePrivacyVisible ? selectedDayQuickHourText : PRIVATE_MASK }}</span>
        </div>

        <el-form v-if="performancePrivacyVisible" label-position="top">
          <el-form-item>
            <template #label>
              <div class="day-record-field-label">
                <span>出勤类型</span>
                <button
                  type="button"
                  class="day-record-help-trigger"
                  :class="{ active: showDayModeRulesHint }"
                  aria-label="查看出勤类型说明"
                  @click="showDayModeRulesHint = !showDayModeRulesHint"
                >
                  <el-icon><InfoFilled /></el-icon>
                </button>
              </div>
            </template>
            <p v-if="showDayModeRulesHint" class="day-record-help-text">{{ dayModeInfoTitle }}</p>
            <div class="restday-mode-grid">
              <el-button
                v-for="option in DAY_MODE_OPTIONS"
                :key="option.value"
                :type="dayRecordForm.dayMode === option.value ? 'primary' : 'default'"
                @click="setDayMode(option.value)"
              >
                {{ option.label }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item>
            <template #label>
              <div class="day-record-field-label">
                <span>打卡时间段</span>
                <button
                  type="button"
                  class="day-record-help-trigger"
                  :class="{ active: showPunchRulesHint }"
                  aria-label="查看打卡规则说明"
                  @click="showPunchRulesHint = !showPunchRulesHint"
                >
                  <el-icon><InfoFilled /></el-icon>
                </button>
              </div>
            </template>
            <p v-if="showPunchRulesHint" class="day-record-help-text">
              {{ dayRecordInfoTitle }}
              <template v-if="!selectedDay.isWorkday">
                <br /><br />
                {{ restdayBreakTitle }}
              </template>
            </p>
            <div class="time-range-row">
              <el-time-picker
                v-model="dayRecordForm.startTime"
                format="HH:mm"
                value-format="HH:mm"
                :clearable="false"
                placeholder="开始时间"
                @change="() => { syncDayRecordHours(); syncLeavePeriodsFromCheckout(); }"
              />
              <span>至</span>
              <el-time-picker
                v-model="dayRecordForm.endTime"
                format="HH:mm"
                value-format="HH:mm"
                :clearable="false"
                placeholder="结束时间"
                @change="() => { syncDayRecordHours(); syncLeavePeriodsFromCheckout(); }"
              />
            </div>
          </el-form-item>

          <el-form-item v-if="selectedDay.isWorkday">
            <template #label>
              <div class="day-record-field-label">
                <span>中间请假时段</span>
                <button
                  type="button"
                  class="day-record-help-trigger"
                  :class="{ active: showLeavePeriodRulesHint }"
                  aria-label="查看中间请假说明"
                  @click="showLeavePeriodRulesHint = !showLeavePeriodRulesHint"
                >
                  <el-icon><InfoFilled /></el-icon>
                </button>
              </div>
            </template>
            <p v-if="showLeavePeriodRulesHint" class="day-record-help-text">
              {{ leavePeriodInfoTitle }}
            </p>
            <div class="leave-period-list">
              <div
                v-for="(period, index) in dayRecordForm.leavePeriods"
                :key="`leave-period-${index}`"
                class="leave-period-row"
              >
                <div class="time-range-row">
                  <el-time-picker
                    v-model="period.startTime"
                    format="HH:mm"
                    value-format="HH:mm"
                    :clearable="false"
                    placeholder="请假开始"
                  />
                  <span>至</span>
                  <el-time-picker
                    v-model="period.endTime"
                    format="HH:mm"
                    value-format="HH:mm"
                    :clearable="false"
                    placeholder="返岗时间"
                  />
                </div>
                <span class="leave-period-preview">{{ formatLeavePeriodPreview(period) }}</span>
                <el-button type="danger" plain @click="removeLeavePeriod(index)">删除</el-button>
              </div>
            </div>
            <el-button type="primary" plain @click="addLeavePeriod">添加请假时段</el-button>
          </el-form-item>

          <el-form-item v-if="!isDayFormPerformanceExcluded" label="快捷选择">
            <div class="quick-hour-grid">
              <el-button
                v-for="hour in selectedDayQuickHours"
                :key="hour"
                :type="dayRecordForm.hours === hour ? 'primary' : 'default'"
                @click="setDayRecordHours(hour)"
              >
                {{ hour }} 小时
              </el-button>
            </div>
          </el-form-item>

          <el-form-item :label="isDayFormPerformanceExcluded ? '结算/调休时长' : '本次完成绩效'">
            <el-input-number
              v-model="dayRecordForm.hours"
              :min="0"
              :max="12"
              :step="0.5"
              :precision="1"
              :disabled="isDayFormPerformanceExcluded"
              @change="setDayRecordHours(dayRecordForm.hours)"
            />
          </el-form-item>
          <p v-if="isDayFormPerformanceExcluded" class="restday-mode-hint">
            已选择「{{ getDayModeLabel(dayRecordForm.dayMode) }}」{{ formatHours(dayRecordForm.hours) }}
            h，不计入绩效时长。
          </p>
        </el-form>

        <div v-else class="day-record-privacy-mask">
          <p>打卡时间：{{ PRIVATE_MASK }}</p>
          <p>完成绩效：{{ PRIVATE_MASK }}</p>
          <p>考勤状态：{{ PRIVATE_MASK }}</p>
          <el-alert
            title="已隐藏私人数据，点击右上角眼睛图标后可查看和编辑"
            type="info"
            show-icon
            :closable="false"
          />
        </div>

        <el-alert
          v-if="performancePrivacyVisible && selectedDay.isWorkday && dayRecordAttendancePreview"
          :title="`考勤：${dayRecordAttendancePreview.text}`"
          :type="dayRecordAttendancePreview.type"
          show-icon
          :closable="false"
        />
      </div>

      <template #footer>
        <el-button
          v-if="performancePrivacyVisible && selectedDayRecord"
          type="danger"
          plain
          @click="removeDayRecord"
        >
          删除记录
        </el-button>
        <el-button @click="dayRecordDialogVisible = false">取消</el-button>
        <el-button v-if="performancePrivacyVisible" type="primary" @click="saveDayRecord">
          保存
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>
