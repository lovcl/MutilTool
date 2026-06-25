const { contextBridge, ipcRenderer, webUtils } = require('electron');

const readAppRules = () => {
  try {
    const rules = ipcRenderer.sendSync('config:getAppRulesSync');
    if (rules && typeof rules === 'object' && Object.keys(rules).length > 0) {
      return rules;
    }
  } catch {
    // preload 沙箱环境下无法直接读取配置文件，回退由前端 bundled 配置兜底
  }

  return null;
};

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  appRules: readAppRules(),
  getStoragePaths: () => ipcRenderer.invoke('app:getStoragePaths'),
  getPathForFile: (file) => {
    if (!file) {
      return '';
    }

    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  autoLaunch: {
    get: () => ipcRenderer.invoke('autoLaunch:get'),
    set: (enabled) => ipcRenderer.invoke('autoLaunch:set', enabled),
  },
  eyeCareMode: {
    get: () => ipcRenderer.invoke('eyeCareMode:get'),
    set: (enabled) => ipcRenderer.invoke('eyeCareMode:set', enabled),
    getIntensity: () => ipcRenderer.invoke('eyeCareMode:getIntensity'),
    setIntensity: (intensity) => ipcRenderer.invoke('eyeCareMode:setIntensity', intensity),
  },
  privacyMode: {
    getStatus: () => ipcRenderer.invoke('privacyMode:getStatus'),
    getSetupQuestions: () => ipcRenderer.invoke('privacyMode:getSetupQuestions'),
    setup: (payload) => ipcRenderer.invoke('privacyMode:setup', payload),
    enable: () => ipcRenderer.invoke('privacyMode:enable'),
    verifyPassword: (password) => ipcRenderer.invoke('privacyMode:verifyPassword', password),
    disable: (password) => ipcRenderer.invoke('privacyMode:disable', password),
    changePassword: (payload) => ipcRenderer.invoke('privacyMode:changePassword', payload),
    getSecurityQuestions: () => ipcRenderer.invoke('privacyMode:getSecurityQuestions'),
    recover: (payload) => ipcRenderer.invoke('privacyMode:recover', payload),
    resetAllData: () => ipcRenderer.invoke('privacyMode:resetAllData'),
    beginProtectedFlow: () => ipcRenderer.invoke('privacyMode:beginProtectedFlow'),
    endProtectedFlow: () => ipcRenderer.invoke('privacyMode:endProtectedFlow'),
    onLockRequired: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('privacyMode:lockRequired', listener);
      return () => ipcRenderer.removeListener('privacyMode:lockRequired', listener);
    },
    onResetComplete: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('privacyMode:resetComplete', listener);
      return () => ipcRenderer.removeListener('privacyMode:resetComplete', listener);
    },
    onShowSetupDialog: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('privacyMode:showSetupDialog', listener);
      return () => ipcRenderer.removeListener('privacyMode:showSetupDialog', listener);
    },
    onShowDisableDialog: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('privacyMode:showDisableDialog', listener);
      return () => ipcRenderer.removeListener('privacyMode:showDisableDialog', listener);
    },
    onStatusChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('privacyMode:statusChanged', listener);
      return () => ipcRenderer.removeListener('privacyMode:statusChanged', listener);
    },
  },
  reminder: {
    getEnabled: () => ipcRenderer.invoke('systemPunch:get'),
    setEnabled: (enabled) => ipcRenderer.invoke('systemPunch:set', enabled),
    onPunchReminder: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('punchReminder:record', listener);
      return () => ipcRenderer.removeListener('punchReminder:record', listener);
    },
    onClockInReminder: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('punchReminder:clockIn', listener);
      return () => ipcRenderer.removeListener('punchReminder:clockIn', listener);
    },
    testPunch: () => ipcRenderer.invoke('reminder:testPunch'),
    testMorningPunch: () => ipcRenderer.invoke('reminder:testMorningPunch'),
    testWater: () => ipcRenderer.invoke('reminder:testWater'),
    testToilet: (type) => ipcRenderer.invoke('reminder:testToilet', type),
    testTask: () => ipcRenderer.invoke('reminder:testTask'),
  },
  water: {
    getEnabled: () => ipcRenderer.invoke('waterReminder:get'),
    setEnabled: (enabled) => ipcRenderer.invoke('waterReminder:set', enabled),
    getRecords: () => ipcRenderer.invoke('waterRecords:get'),
    addRecord: (record) => ipcRenderer.invoke('waterRecords:add', record),
    onRecord: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('water:record', listener);
      return () => ipcRenderer.removeListener('water:record', listener);
    },
  },
  toilet: {
    getEnabled: () => ipcRenderer.invoke('toiletReminder:get'),
    setEnabled: (enabled) => ipcRenderer.invoke('toiletReminder:set', enabled),
    getRecords: () => ipcRenderer.invoke('toiletRecords:get'),
    addRecord: (record) => ipcRenderer.invoke('toiletRecords:add', record),
    deleteRecord: (payload) => ipcRenderer.invoke('toiletRecords:delete', payload),
    onRecord: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('toilet:record', listener);
      return () => ipcRenderer.removeListener('toilet:record', listener);
    },
    onRecordDeleted: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('toilet:record-deleted', listener);
      return () => ipcRenderer.removeListener('toilet:record-deleted', listener);
    },
  },
  activityLog: {
    getAll: () => ipcRenderer.invoke('activityLog:getAll'),
    append: (entry) => ipcRenderer.invoke('activityLog:append', entry),
    clear: () => ipcRenderer.invoke('activityLog:clear'),
    onAppend: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('activityLog:append', listener);
      return () => ipcRenderer.removeListener('activityLog:append', listener);
    },
    onClear: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('activityLog:clear', listener);
      return () => ipcRenderer.removeListener('activityLog:clear', listener);
    },
  },
  messages: {
    getAll: () => ipcRenderer.invoke('messages:getAll'),
    clear: () => ipcRenderer.invoke('messages:clear'),
    onAppend: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('messages:append', listener);
      return () => ipcRenderer.removeListener('messages:append', listener);
    },
    onClear: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('messages:clear', listener);
      return () => ipcRenderer.removeListener('messages:clear', listener);
    },
    onReplaced: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('messages:replaced', listener);
      return () => ipcRenderer.removeListener('messages:replaced', listener);
    },
  },
  browser: {
    setPageActive: (active) => ipcRenderer.send('browser:setPageActive', Boolean(active)),
    clearCache: () => ipcRenderer.invoke('browser:clearCache'),
    getBookmarks: () => ipcRenderer.invoke('browser:getBookmarks'),
    saveBookmarks: (bookmarks) => ipcRenderer.invoke('browser:saveBookmarks', bookmarks),
    onToggleDevTools: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('browser:toggle-devtools', listener);
      return () => ipcRenderer.removeListener('browser:toggle-devtools', listener);
    },
    onOpenUrlInTab: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('browser:open-url-in-tab', listener);
      return () => ipcRenderer.removeListener('browser:open-url-in-tab', listener);
    },
  },
  tasks: {
    getAll: () => ipcRenderer.invoke('tasks:getAll'),
    create: (payload) => ipcRenderer.invoke('tasks:create', payload),
    update: (taskId, payload) => ipcRenderer.invoke('tasks:update', taskId, payload),
    delete: (taskId) => ipcRenderer.invoke('tasks:delete', taskId),
    toggleComplete: (taskId, completed) => ipcRenderer.invoke('tasks:toggleComplete', taskId, completed),
    getReminderEnabled: () => ipcRenderer.invoke('tasks:getReminderEnabled'),
    setReminderEnabled: (enabled) => ipcRenderer.invoke('tasks:setReminderEnabled', enabled),
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('tasks:changed', listener);
      return () => ipcRenderer.removeListener('tasks:changed', listener);
    },
    onNavigate: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('tasks:navigate', listener);
      return () => ipcRenderer.removeListener('tasks:navigate', listener);
    },
  },
  memos: {
    getAll: () => ipcRenderer.invoke('memos:getAll'),
    create: (payload) => ipcRenderer.invoke('memos:create', payload),
    update: (memoId, payload) => ipcRenderer.invoke('memos:update', memoId, payload),
    delete: (memoId) => ipcRenderer.invoke('memos:delete', memoId),
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('memos:changed', listener);
      return () => ipcRenderer.removeListener('memos:changed', listener);
    },
  },
  vaultFiles: {
    getAll: () => ipcRenderer.invoke('vaultFiles:getAll'),
    pickAndAdd: (folderId) => ipcRenderer.invoke('vaultFiles:pickAndAdd', folderId || null),
    pickAndImportFolder: (folderId) =>
      ipcRenderer.invoke('vaultFiles:pickAndImportFolder', folderId || null),
    addFromPaths: (payload) => ipcRenderer.invoke('vaultFiles:addFromPaths', payload),
    addFromDrop: (payload) => ipcRenderer.invoke('vaultFiles:addFromDrop', payload),
    createFolder: (payload) => ipcRenderer.invoke('vaultFiles:createFolder', payload),
    updateFolder: (folderId, payload) => ipcRenderer.invoke('vaultFiles:updateFolder', folderId, payload),
    deleteFolder: (folderId) => ipcRenderer.invoke('vaultFiles:deleteFolder', folderId),
    update: (fileId, payload) => ipcRenderer.invoke('vaultFiles:update', fileId, payload),
    delete: (fileId) => ipcRenderer.invoke('vaultFiles:delete', fileId),
    open: (fileId) => ipcRenderer.invoke('vaultFiles:open', fileId),
    reveal: (fileId) => ipcRenderer.invoke('vaultFiles:reveal', fileId),
    getPreview: (fileId) => ipcRenderer.invoke('vaultFiles:getPreview', fileId),
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('vaultFiles:changed', listener);
      return () => ipcRenderer.removeListener('vaultFiles:changed', listener);
    },
  },
  dataBackup: {
    export: (clientPayload) => ipcRenderer.invoke('dataBackup:export', clientPayload),
    import: () => ipcRenderer.invoke('dataBackup:import'),
    apply: (snapshot) => ipcRenderer.invoke('dataBackup:apply', snapshot),
    getPerformanceRecords: () => ipcRenderer.invoke('dataBackup:getPerformanceRecords'),
    savePerformanceRecords: (records) => ipcRenderer.invoke('dataBackup:savePerformanceRecords', records),
    onImported: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('dataBackup:imported', listener);
      return () => ipcRenderer.removeListener('dataBackup:imported', listener);
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    close: () => ipcRenderer.invoke('window:close'),
    onMaximizeChanged: (callback) => {
      const listener = (_event, maximized) => callback(Boolean(maximized));
      ipcRenderer.on('window:maximize-changed', listener);
      return () => ipcRenderer.removeListener('window:maximize-changed', listener);
    },
  },
});
