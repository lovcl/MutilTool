const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const SCHEMA_VERSION = 1;

const createDataBackupModule = ({
  userDataPath,
  appRootPath,
  appName,
  appVersion,
  getMainWindow,
  onImported,
  getVaultFilesSnapshot,
  importVaultFilesSnapshot,
  resetVaultFiles,
}) => {
  const configDir = path.join(userDataPath, 'config');
  const defaultAppRulesPath = path.join(appRootPath, 'app.rules.config.json');

  const dataFiles = {
    settings: 'settings.json',
    waterRecords: 'water-records.json',
    toiletRecords: 'toilet-records.json',
    tasks: 'tasks.json',
    memos: 'memos.json',
    activityLogs: 'activity-logs.json',
    messages: 'messages.json',
    performanceRecords: 'performance-records.json',
  };

  const readJsonFile = (filePath, fallback) => {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`[data-backup] 读取失败 ${filePath}:`, error.message);
      return fallback;
    }
  };

  const writeJsonFile = (filePath, data) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  };

  const resolveConfigPath = (fileName, defaultPath) => {
    const overridePath = path.join(configDir, fileName);
    return fs.existsSync(overridePath) ? overridePath : defaultPath;
  };

  const readConfigSnapshot = () => ({
    appRules: readJsonFile(resolveConfigPath('app.rules.config.json', defaultAppRulesPath), {}),
  });

  const collectSnapshot = (clientPayload = {}) => {
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appName,
      appVersion,
      config: readConfigSnapshot(),
      data: {
        settings: readJsonFile(path.join(userDataPath, dataFiles.settings), {}),
        performanceRecords: clientPayload.performanceRecords || readJsonFile(
          path.join(userDataPath, dataFiles.performanceRecords),
          {}
        ),
        waterRecords: readJsonFile(path.join(userDataPath, dataFiles.waterRecords), {}),
        toiletRecords: readJsonFile(path.join(userDataPath, dataFiles.toiletRecords), {}),
        tasks: readJsonFile(path.join(userDataPath, dataFiles.tasks), []),
        memos: readJsonFile(path.join(userDataPath, dataFiles.memos), []),
        vaultFiles: getVaultFilesSnapshot?.() || [],
        activityLogs: readJsonFile(path.join(userDataPath, dataFiles.activityLogs), []),
        messages: readJsonFile(path.join(userDataPath, dataFiles.messages), []),
        uiPreferences: {
          themeMode: clientPayload.themeMode || 'system',
        },
      },
    };

    return snapshot;
  };

  const validateSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('备份文件格式无效');
    }

    if (snapshot.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`不支持的备份版本：${snapshot.schemaVersion}`);
    }

    if (!snapshot.config || !snapshot.data) {
      throw new Error('备份文件缺少 config 或 data 节点');
    }

    return snapshot;
  };

  const applySnapshot = (snapshot) => {
    const normalized = validateSnapshot(snapshot);

    writeJsonFile(path.join(userDataPath, dataFiles.settings), normalized.data.settings || {});
    writeJsonFile(
      path.join(userDataPath, dataFiles.performanceRecords),
      normalized.data.performanceRecords || {}
    );
    writeJsonFile(path.join(userDataPath, dataFiles.waterRecords), normalized.data.waterRecords || {});
    writeJsonFile(path.join(userDataPath, dataFiles.toiletRecords), normalized.data.toiletRecords || {});
    writeJsonFile(path.join(userDataPath, dataFiles.tasks), normalized.data.tasks || []);
    writeJsonFile(path.join(userDataPath, dataFiles.memos), normalized.data.memos || []);
    importVaultFilesSnapshot?.(normalized.data.vaultFiles || []);
    writeJsonFile(path.join(userDataPath, dataFiles.activityLogs), normalized.data.activityLogs || []);
    writeJsonFile(path.join(userDataPath, dataFiles.messages), normalized.data.messages || []);

    if (normalized.config?.appRules && Object.keys(normalized.config.appRules).length) {
      writeJsonFile(path.join(configDir, 'app.rules.config.json'), normalized.config.appRules);
    }

    onImported?.(normalized);
    getMainWindow()?.webContents.send('dataBackup:imported', normalized);

    return {
      requiresRestart: Boolean(normalized.config?.appRules),
    };
  };

  const exportBackup = async (clientPayload = {}) => {
    const snapshot = collectSnapshot(clientPayload);
    const defaultFileName = `${appName}-备份-${snapshot.exportedAt.slice(0, 10)}.json`;
    const { canceled, filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出应用备份',
      defaultPath: defaultFileName,
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
    });

    if (canceled || !filePath) {
      return { canceled: true };
    }

    writeJsonFile(filePath, snapshot);

    return {
      canceled: false,
      filePath,
      snapshot,
    };
  };

  const importBackup = async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
      title: '导入应用备份',
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (canceled || !filePaths?.length) {
      return { canceled: true };
    }

    const snapshot = readJsonFile(filePaths[0], null);
    const result = applySnapshot(snapshot);

    return {
      canceled: false,
      filePath: filePaths[0],
      snapshot,
      ...result,
    };
  };

  const resetAllUserData = () => {
    writeJsonFile(path.join(userDataPath, dataFiles.settings), {});
    writeJsonFile(path.join(userDataPath, dataFiles.performanceRecords), {});
    writeJsonFile(path.join(userDataPath, dataFiles.waterRecords), {});
    writeJsonFile(path.join(userDataPath, dataFiles.toiletRecords), {});
    writeJsonFile(path.join(userDataPath, dataFiles.tasks), []);
    writeJsonFile(path.join(userDataPath, dataFiles.memos), []);
    resetVaultFiles?.();
    writeJsonFile(path.join(userDataPath, dataFiles.activityLogs), []);
    writeJsonFile(path.join(userDataPath, dataFiles.messages), []);

    const overridePath = path.join(configDir, 'app.rules.config.json');
    if (fs.existsSync(overridePath)) {
      fs.unlinkSync(overridePath);
    }

    onImported?.({ data: { settings: {} } });
    getMainWindow()?.webContents.send('dataBackup:imported', { data: { settings: {} } });
  };

  return {
    collectSnapshot,
    applySnapshot,
    exportBackup,
    importBackup,
    readConfigSnapshot,
    resetAllUserData,
  };
};

module.exports = { createDataBackupModule, SCHEMA_VERSION };
