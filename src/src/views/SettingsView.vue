<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useTheme, reloadThemeFromStorage } from '../composables/useTheme';
import { useElectronBridge } from '../composables/useElectronBridge';
import { usePerformanceRecords } from '../composables/usePerformanceRecords';
import {
  BACKUP_SECTIONS,
  exportFullBackup,
  importFullBackup,
  importFullBackupFromDialog,
  logBackupAction,
} from '../composables/useDataBackup';
import {
  exportAttendanceExcel,
  handleAttendanceImportFile,
} from '../utils/attendanceImportExport';
import AppSwitch from '../components/common/AppSwitch.vue';
import PrivacySetupDialog from '../components/privacy/PrivacySetupDialog.vue';
import PrivacyDisableDialog from '../components/privacy/PrivacyDisableDialog.vue';
import PrivacyChangePasswordDialog from '../components/privacy/PrivacyChangePasswordDialog.vue';
import { usePrivacyMode } from '../composables/usePrivacyMode';

const {
  themeMode,
  themeOptions,
  resolvedTheme,
  activeThemeLabel,
  activeThemeDescription,
  resolvedThemeLabel,
} = useTheme();

const {
  autoLaunchEnabled,
  autoLaunchLoading,
  systemPunchEnabled,
  systemPunchLoading,
  eyeCareModeEnabled,
  eyeCareModeLoading,
  eyeCareModeIntensity,
  eyeCareIntensityLoading,
  eyeCareIntensityMin,
  eyeCareIntensityMax,
  loadAutoLaunchStatus,
  updateAutoLaunch,
  updateSystemPunch,
  loadEyeCareModeStatus,
  updateEyeCareMode,
  updateEyeCareModeIntensity,
} = useElectronBridge();

const {
  privacyModeEnabled,
  privacyConfigured,
  syncStatus: syncPrivacyStatus,
  enablePrivacyMode,
} = usePrivacyMode();

const { performanceRecords, mergePerformanceRecords, clearAllPerformanceRecords } =
  usePerformanceRecords();
const attendanceImportInput = ref(null);
const backupImportInput = ref(null);
const backupLoading = ref(false);
const resetAttendanceLoading = ref(false);
const reminderTestLoading = ref(false);
const privacySetupVisible = ref(false);
const privacyDisableVisible = ref(false);
const privacyChangePasswordVisible = ref(false);
const isDesktopApp = Boolean(window.electronAPI?.reminder);

const attendanceRecordCount = computed(() => Object.keys(performanceRecords.value).length);

const refreshPreferences = async () => {
  reloadThemeFromStorage();
  await loadAutoLaunchStatus();
  await loadEyeCareModeStatus();
  await syncPrivacyStatus();
};

const triggerAttendanceImport = () => {
  attendanceImportInput.value?.click();
};

const handleAttendanceImport = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) {
    return;
  }

  try {
    await handleAttendanceImportFile(file, performanceRecords.value, mergePerformanceRecords);
  } catch (error) {
    ElMessage.error(`xlsx 解析失败：${error.message}`);
  }
};

const handleExport = () => {
  exportAttendanceExcel(performanceRecords.value);
};

const handleResetAttendance = async () => {
  if (!attendanceRecordCount.value) {
    ElMessage.info('当前没有考勤/绩效记录');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `将清空全部 ${attendanceRecordCount.value} 条考勤/绩效打卡记录，此操作不可恢复。`,
      '重置所有考勤',
      {
        type: 'warning',
        confirmButtonText: '确认重置',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      }
    );
  } catch {
    return;
  }

  resetAttendanceLoading.value = true;
  try {
    const count = clearAllPerformanceRecords();
    ElMessage.success(`已重置 ${count} 条考勤/绩效记录`);
  } finally {
    resetAttendanceLoading.value = false;
  }
};

const handleExportBackup = async () => {
  backupLoading.value = true;
  try {
    const result = await exportFullBackup();
    if (result.canceled) {
      return;
    }

    await logBackupAction('export', '已导出应用全量备份');
    ElMessage.success('全量备份已导出');
  } catch (error) {
    ElMessage.error(error.message || '导出失败');
  } finally {
    backupLoading.value = false;
  }
};

const handleImportBackupClick = async () => {
  if (window.electronAPI?.dataBackup?.import) {
    backupLoading.value = true;
    try {
      const result = await importFullBackupFromDialog();
      if (result.canceled) {
        return;
      }

      await afterImportSuccess(result);
    } catch (error) {
      ElMessage.error(error.message || '导入失败');
    } finally {
      backupLoading.value = false;
    }
    return;
  }

  backupImportInput.value?.click();
};

const handleImportBackupFile = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) {
    return;
  }

  backupLoading.value = true;
  try {
    const result = await importFullBackup(file);
    await afterImportSuccess(result);
  } catch (error) {
    ElMessage.error(error.message || '导入失败');
  } finally {
    backupLoading.value = false;
  }
};

const afterImportSuccess = async (result) => {
  await logBackupAction('import', '已导入应用全量备份');
  await refreshPreferences();

  if (result.requiresRestart) {
    await ElMessageBox.alert(
      '业务规则已写入用户目录，请重启应用后完全生效。',
      '导入完成',
      { type: 'success' }
    );
    return;
  }

  ElMessage.success('全量备份已导入，数据和偏好已刷新');
};

const handleTestPunchReminder = async () => {
  if (!window.electronAPI?.reminder?.testPunch) {
    ElMessage.warning('当前环境不支持测试打卡提醒');
    return;
  }

  reminderTestLoading.value = true;
  try {
    await window.electronAPI.reminder.testPunch();
  } catch (error) {
    ElMessage.error(error.message || '测试打卡提醒失败');
  } finally {
    reminderTestLoading.value = false;
  }
};

const handleTestMorningPunchReminder = async () => {
  if (!window.electronAPI?.reminder?.testMorningPunch) {
    ElMessage.warning('当前环境不支持测试上班打卡提醒');
    return;
  }

  reminderTestLoading.value = true;
  try {
    await window.electronAPI.reminder.testMorningPunch();
  } catch (error) {
    ElMessage.error(error.message || '测试上班打卡提醒失败');
  } finally {
    reminderTestLoading.value = false;
  }
};

const handleTestWaterReminder = async () => {
  if (!window.electronAPI?.reminder?.testWater) {
    ElMessage.warning('当前环境不支持测试喝水提醒');
    return;
  }

  reminderTestLoading.value = true;
  try {
    await window.electronAPI.reminder.testWater();
  } catch (error) {
    ElMessage.error(error.message || '测试喝水提醒失败');
  } finally {
    reminderTestLoading.value = false;
  }
};

const handleTestTaskReminder = async () => {
  if (!window.electronAPI?.reminder?.testTask) {
    ElMessage.warning('当前环境不支持测试任务提醒');
    return;
  }

  reminderTestLoading.value = true;
  try {
    await window.electronAPI.reminder.testTask();
  } catch (error) {
    ElMessage.error(error.message || '测试任务提醒失败');
  } finally {
    reminderTestLoading.value = false;
  }
};

const handlePrivacyModeToggle = async (enabled) => {
  if (enabled) {
    if (!privacyConfigured.value) {
      privacyModeEnabled.value = false;
      privacySetupVisible.value = true;
      return;
    }

    try {
      await enablePrivacyMode();
    } catch (error) {
      privacyModeEnabled.value = false;
      ElMessage.error(error.message || '开启失败');
    }
    return;
  }

  privacyModeEnabled.value = true;
  privacyDisableVisible.value = true;
};

const handlePrivacySetupCompleted = async () => {
  await syncPrivacyStatus();
};

const handlePrivacyDisableCompleted = async () => {
  await syncPrivacyStatus();
};

onMounted(() => {
  loadAutoLaunchStatus();
  loadEyeCareModeStatus();
  syncPrivacyStatus();
});
</script>

<template>
  <section class="settings-layout">
    <header class="header settings-header">
      <div>
        <p class="eyebrow">系统设置</p>
        <h2>外观主题</h2>
      </div>
      <el-tag type="primary" effect="plain" size="large">
        当前：{{ activeThemeLabel }}
      </el-tag>
    </header>

    <article class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">主题模式</p>
          <h3>选择应用外观</h3>
        </div>
        <el-tag :type="resolvedTheme === 'dark' ? 'info' : 'warning'" effect="light">
          实际生效：{{ resolvedThemeLabel }}
        </el-tag>
      </div>

      <el-radio-group v-model="themeMode" class="theme-options">
        <el-radio-button
          v-for="option in themeOptions"
          :key="option.value"
          :label="option.value"
        >
          <span class="theme-option-label">
            <el-icon><component :is="option.icon" /></el-icon>
            {{ option.label }}
          </span>
        </el-radio-button>
      </el-radio-group>

      <div class="theme-preview">
        <div
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-card"
          :class="{ active: themeMode === option.value }"
          @click="themeMode = option.value"
        >
          <div class="theme-card-icon">
            <el-icon><component :is="option.icon" /></el-icon>
          </div>
          <div>
            <strong>{{ option.label }}</strong>
            <span>{{ option.description }}</span>
          </div>
        </div>
      </div>

      <el-alert
        :title="activeThemeDescription"
        type="info"
        show-icon
        :closable="false"
      />
    </article>

    <article v-if="isDesktopApp" class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">屏幕护眼</p>
          <h3>护眼模式</h3>
        </div>
        <AppSwitch
          v-model="eyeCareModeEnabled"
          label="护眼模式"
          :loading="eyeCareModeLoading"
          @change="updateEyeCareMode"
        />
      </div>
      <el-alert
        title="开启后会在所有显示器上叠加一层暖黄色半透明遮罩，降低蓝光感，减轻长时间看屏疲劳。不影响鼠标和键盘操作，关闭后立即恢复。"
        type="success"
        show-icon
        :closable="false"
      />

      <div class="eye-care-intensity">
        <div class="eye-care-intensity-header">
          <span>暖色深浅</span>
          <strong>{{ eyeCareModeIntensity }}%</strong>
        </div>
        <el-slider
          v-model="eyeCareModeIntensity"
          :min="eyeCareIntensityMin"
          :max="eyeCareIntensityMax"
          :step="1"
          :disabled="!eyeCareModeEnabled || eyeCareModeLoading || eyeCareIntensityLoading"
          @input="updateEyeCareModeIntensity"
        />
        <p class="eye-care-intensity-hint">
          向左更淡，向右更暖。默认 2%，可按需微调。
        </p>
      </div>
    </article>

    <article v-if="isDesktopApp" class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">访问保护</p>
          <h3>隐私模式</h3>
        </div>
        <AppSwitch
          v-model="privacyModeEnabled"
          label="隐私模式"
          @change="handlePrivacyModeToggle"
        />
      </div>
      <el-alert
        title="首次开启需设置密码和 3 个密保问题。开启后再次进入应用需输入密码；忘记密码可回答任意一个密保问题重置。连续输错 5 次后只能手动重置所有配置和数据。"
        type="warning"
        show-icon
        :closable="false"
      />

      <div v-if="privacyConfigured" class="privacy-settings-actions">
        <el-button type="primary" plain @click="privacyChangePasswordVisible = true">
          修改密码
        </el-button>
      </div>
    </article>

    <article class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">启动行为</p>
          <h3>开机自启动</h3>
        </div>
        <AppSwitch
          v-model="autoLaunchEnabled"
          label="开机自启动"
          :loading="autoLaunchLoading"
          @change="updateAutoLaunch"
        />
      </div>
      <el-alert
        title="开启后应用会随系统登录自动启动，并默认隐藏到托盘。"
        type="success"
        show-icon
        :closable="false"
      />
    </article>

    <article class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">打卡提醒</p>
          <h3>系统打卡按钮</h3>
        </div>
        <AppSwitch
          v-model="systemPunchEnabled"
          label="系统打卡提醒"
          :loading="systemPunchLoading"
          @change="updateSystemPunch"
        />
      </div>
      <el-alert
        title="默认开启。开启后会在工作日 08:00 提醒上班打卡，17:55 提醒下班打卡。17:55 时选择「稍后提醒」或点右上角关闭弹窗，会在 20:25 再提醒绩效打卡；选择「按 18:00 打卡」则当天不再提醒绩效打卡。关闭此开关后，不再弹出系统打卡提醒。"
        type="success"
        show-icon
        :closable="false"
      />
    </article>

    <article v-if="isDesktopApp" class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">提醒测试</p>
          <h3>右下角弹窗预览</h3>
        </div>
        <div class="settings-actions">
          <el-button
            type="primary"
            plain
            :loading="reminderTestLoading"
            @click="handleTestMorningPunchReminder"
          >
            测试上班提醒
          </el-button>
          <el-button
            type="primary"
            plain
            :loading="reminderTestLoading"
            @click="handleTestPunchReminder"
          >
            测试下班提醒
          </el-button>
          <el-button
            type="primary"
            :loading="reminderTestLoading"
            @click="handleTestWaterReminder"
          >
            测试喝水提醒
          </el-button>
          <el-button
            type="warning"
            plain
            :loading="reminderTestLoading"
            @click="handleTestTaskReminder"
          >
            测试任务提醒
          </el-button>
        </div>
      </div>
      <el-alert
        title="测试按钮仅预览弹窗样式与文案，标题会带「预览」前缀；不会写入打卡/喝水/如厕/任务数据，也不会改变正式提醒的调度时间。"
        type="info"
        show-icon
        :closable="false"
      />
    </article>

    <article class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">数据与配置</p>
          <h3>全量备份 / 恢复</h3>
        </div>
        <div class="settings-actions">
          <el-button type="primary" plain :loading="backupLoading" @click="handleExportBackup">
            导出全量备份
          </el-button>
          <el-button type="primary" :loading="backupLoading" @click="handleImportBackupClick">
            导入全量备份
          </el-button>
        </div>
      </div>

      <input
        ref="backupImportInput"
        class="file-input-hidden"
        type="file"
        accept=".json,application/json"
        @change="handleImportBackupFile"
      />

      <div class="backup-section-list">
        <article v-for="section in BACKUP_SECTIONS" :key="section.key" class="backup-section-card">
          <strong>{{ section.label }}</strong>
          <ul>
            <li v-for="item in section.items" :key="item">{{ item }}</li>
          </ul>
        </article>
      </div>

      <el-alert
        title="导出为一个 JSON 文件，包含业务规则、考勤/绩效、喝水、如厕（含大小便状态与自定义描述）、任务、备忘录、文件库、操作日志，以及主题和各提醒开关。导入会覆盖当前数据；业务规则建议导入后重启应用。"
        type="warning"
        show-icon
        :closable="false"
      />
    </article>

    <article class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">考勤数据</p>
          <h3>Excel 导入 / 导出</h3>
        </div>
        <div class="settings-actions">
          <el-button type="primary" plain @click="triggerAttendanceImport">
            导入考勤
          </el-button>
          <el-button type="primary" @click="handleExport">
            导出 Excel
          </el-button>
        </div>
      </div>
      <input
        ref="attendanceImportInput"
        class="file-input-hidden"
        type="file"
        accept=".xlsx,.xls,.csv,.tsv,.txt"
        @change="handleAttendanceImport"
      />
      <el-alert
        title="仅导出考勤/绩效打卡数据为 Excel，不含喝水、如厕记录；完整数据请使用上方「导出全量备份」。导入会按当前规则重新计算出勤类型、绩效、迟到和请假；支持本应用导出的 .xlsx，以及包含“日期、上班打卡、下班打卡、出勤类型”的 CSV/TSV。出勤类型留空时默认为额外出勤。"
        type="info"
        show-icon
        :closable="false"
      />
    </article>

    <article class="settings-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">考勤数据</p>
          <h3>重置所有考勤</h3>
        </div>
        <div class="settings-actions">
          <el-tag type="info" effect="plain">
            当前 {{ attendanceRecordCount }} 条记录
          </el-tag>
          <el-button
            type="danger"
            plain
            :loading="resetAttendanceLoading"
            :disabled="!attendanceRecordCount"
            @click="handleResetAttendance"
          >
            重置所有考勤
          </el-button>
        </div>
      </div>
      <el-alert
        title="会清空所有考勤/绩效打卡记录（含手动打卡、导入和系统提醒写入的数据），不影响任务、喝水、如厕和日志。操作前建议先导出 Excel 或全量备份。"
        type="warning"
        show-icon
        :closable="false"
      />
    </article>

    <PrivacySetupDialog
      v-model:visible="privacySetupVisible"
      @completed="handlePrivacySetupCompleted"
    />

    <PrivacyDisableDialog
      v-model:visible="privacyDisableVisible"
      @completed="handlePrivacyDisableCompleted"
    />

    <PrivacyChangePasswordDialog v-model:visible="privacyChangePasswordVisible" />
  </section>
</template>
