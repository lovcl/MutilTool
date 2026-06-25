import { APP_RULES_CONFIG } from '../data/workCalendar';
import { activityLogs, hydrateActivityLogs } from './useActivityLog';
import { appendActivityLog } from './useActivityLog';
import { hydratePerformanceRecords, performanceRecords } from './usePerformanceRecords';
import { hydrateTasks, tasks } from './useTasks';
import { hydrateMemos, memos } from './useMemos';
import { hydrateVaultFiles, vaultFiles, vaultFolders } from './useVaultFiles';
import { hydrateWaterRecords, waterRecords } from './useWaterRecords';
import { hydrateToiletRecords, toiletRecords } from './useToiletRecords';
import { replaceMessages } from './useMessages';

const electronAPI = window.electronAPI;
const appInfo = APP_RULES_CONFIG.app;

export const BACKUP_SECTIONS = [
  { key: 'config', label: '应用配置', items: ['业务规则 app.rules.config.json'] },
  {
    key: 'data',
    label: '业务数据',
    items: ['考勤/绩效记录', '喝水记录', '如厕记录（含状态/颜色/自定义）', '任务列表', '备忘录', '文件库', '操作日志', '消息中心'],
  },
  {
    key: 'preferences',
    label: '偏好设置',
    items: ['主题模式', '开机自启动', '打卡/喝水/如厕/任务提醒开关'],
  },
];

export const collectClientBackupPayload = () => ({
  performanceRecords: JSON.parse(JSON.stringify(performanceRecords.value)),
  themeMode: localStorage.getItem('theme-mode') || APP_RULES_CONFIG.app.themeDefaultMode,
});

export const downloadJsonBackup = (snapshot) => {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${appInfo.displayName}-备份-${snapshot.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const readJsonFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || '{}')));
      } catch {
        reject(new Error('备份文件不是有效的 JSON'));
      }
    };
    reader.onerror = () => reject(new Error('读取备份文件失败'));
    reader.readAsText(file, 'utf8');
  });

export const applyDataSnapshotToUi = async (snapshot) => {
  const data = snapshot?.data || {};

  performanceRecords.value = data.performanceRecords || {};
  localStorage.setItem('performance-records', JSON.stringify(performanceRecords.value));

  waterRecords.value = data.waterRecords || {};
  toiletRecords.value = data.toiletRecords || {};
  tasks.value = Array.isArray(data.tasks) ? data.tasks : [];
  memos.value = Array.isArray(data.memos) ? data.memos : [];
  if (Array.isArray(data.vaultFiles)) {
    vaultFiles.value = data.vaultFiles.map(({ dataBase64, ...meta }) => meta);
    vaultFolders.value = [];
  } else {
    vaultFiles.value = Array.isArray(data.vaultFiles?.files)
      ? data.vaultFiles.files.map(({ dataBase64, ...meta }) => meta)
      : [];
    vaultFolders.value = Array.isArray(data.vaultFiles?.folders) ? data.vaultFiles.folders : [];
  }
  activityLogs.value = Array.isArray(data.activityLogs) ? data.activityLogs : [];
  replaceMessages(Array.isArray(data.messages) ? data.messages : []);

  if (data.uiPreferences?.themeMode) {
    localStorage.setItem('theme-mode', data.uiPreferences.themeMode);
  }

  if (!electronAPI?.dataBackup) {
    localStorage.setItem('water-records', JSON.stringify(waterRecords.value));
    localStorage.setItem('toilet-records', JSON.stringify(toiletRecords.value));
    localStorage.setItem('tasks', JSON.stringify(tasks.value));
    localStorage.setItem('memos', JSON.stringify(memos.value));
    localStorage.setItem('activity-logs', JSON.stringify(activityLogs.value));
  }

  await Promise.all([
    hydratePerformanceRecords(),
    hydrateWaterRecords(),
    hydrateToiletRecords(),
    hydrateTasks(),
    hydrateMemos(),
    hydrateVaultFiles(),
    hydrateActivityLogs(),
  ]);
};

export const exportFullBackup = async () => {
  const clientPayload = collectClientBackupPayload();

  if (electronAPI?.dataBackup?.export) {
    return electronAPI.dataBackup.export(clientPayload);
  }

  const snapshot = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appName: appInfo.displayName,
    appVersion: '1.0.0',
    config: {
      appRules: APP_RULES_CONFIG,
    },
    data: {
      settings: {},
      performanceRecords: clientPayload.performanceRecords,
      waterRecords: waterRecords.value,
      toiletRecords: toiletRecords.value,
      tasks: tasks.value,
      memos: memos.value,
      vaultFiles: [],
      activityLogs: activityLogs.value,
      uiPreferences: {
        themeMode: clientPayload.themeMode,
      },
    },
  };

  downloadJsonBackup(snapshot);
  return { canceled: false, snapshot };
};

export const importFullBackupFromDialog = async () => {
  if (!electronAPI?.dataBackup?.import) {
    throw new Error('当前环境不支持系统导入对话框');
  }

  const result = await electronAPI.dataBackup.import();
  if (result.canceled) {
    return { canceled: true };
  }

  await applyDataSnapshotToUi(result.snapshot);
  return {
    canceled: false,
    requiresRestart: Boolean(result.requiresRestart),
  };
};

export const importFullBackup = async (file) => {
  const snapshot = await readJsonFile(file);

  if (!snapshot?.schemaVersion || !snapshot?.data) {
    throw new Error('备份文件格式无效');
  }

  if (electronAPI?.dataBackup?.apply) {
    await electronAPI.dataBackup.apply(snapshot);
  }

  await applyDataSnapshotToUi(snapshot);

  return {
    requiresRestart: Boolean(snapshot.config?.appRules),
  };
};

export const logBackupAction = (action, summary) =>
  appendActivityLog({
    category: 'system',
    action,
    title: action === 'export' ? '导出全量备份' : '导入全量备份',
    summary,
    detail: null,
  });

export const onDataBackupImported = (callback) =>
  electronAPI?.dataBackup?.onImported(callback) || null;
