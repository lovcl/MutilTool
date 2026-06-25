const {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  Menu,
  Tray,
  globalShortcut,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { createWaterReminderModule } = require('./waterReminder');
const { createToiletReminderModule } = require('./toiletReminder');
const { createActivityLogModule } = require('./activityLog');
const { createMessageCenterModule } = require('./messageCenter');
const { createTaskManagerModule } = require('./taskManager');
const { createMemoManagerModule } = require('./memoManager');
const { createFileManagerModule } = require('./fileManager');
const { createDataBackupModule } = require('./dataBackup');
const { createConfigLoader } = require('./configLoader');
const { createReminderToastModule } = require('./reminderToast');
const { createEyeCareModeModule } = require('./eyeCareMode');
const { createPrivacyModeModule } = require('./privacyMode');
const { clearBrowserSessionData } = require('./browserSession');
const { createBrowserBookmarksModule } = require('./browserBookmarks');
const {
  resolveUserDataPath,
  migrateLegacyUserDataIfNeeded,
  getStoragePaths,
} = require('./userDataPath');
const { getDateMeta } = require('./workCalendar');
const {
  REMINDER_TOAST,
  isReminderSnoozedToday,
  snoozeReminderToday,
  msUntilSnoozeExpires,
} = require('./reminderSnooze');

const APP_ROOT = path.join(__dirname, '..');
const WEB_ROOT = path.join(APP_ROOT, 'web');
const DEFAULT_APP_RULES_CONFIG = require('../app.rules.config.json');
const OPEN_DEVTOOLS = process.env.OPEN_DEVTOOLS === '1';
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const WEB_INDEX_PATH = path.join(WEB_ROOT, 'index.html');
const HIDDEN_STARTUP_ARG = DEFAULT_APP_RULES_CONFIG.app.hiddenStartupArg;
const APP_NAME = DEFAULT_APP_RULES_CONFIG.app.displayName;
const APP_ICON_PNG_PATH = path.join(__dirname, 'assets', 'app-icon.png');
const TRAY_ICON_SIZE = process.platform === 'win32' ? 32 : 16;
const TASKBAR_ICON_SIZE = 256;
const APP_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABHElEQVR4nO3TSU7DMBTG8d6gV8FTjtGDMZVCmceSMpVpyzm4B8JNbFh+iKCuqO2XJk5BypPeKor+v1hOp9POf5puLwVlW0AjgDLPKk/yaJE8WKh7CzWxUHcG6tZA3RioawN1ZSDHBjLNIS9zyFEOeZFXgyTPH0ieLBaNy/OfFWcZxGlWDlN3XJxkEMdERKy4OMogDqdhRMw4P6AAIsb5fgBAjePzbe6G4nxvCr7rQVC/3AkgxPnQA+j20hfKugDU91vA3wVQfzUXYN6F4zsafFuDDTTYlgbra/clrOM/D8XZ5rsH0ECcbXgAgWN/LbOuOFv3AApEDfHZlo4XgEjH/h1naxRAxPjKKgFQIJYZn81S478wC8YrRdtpar4AznjKcQYmLbUAAAAASUVORK5CYII=';
const USER_DATA_PATH = resolveUserDataPath(app, APP_NAME);
migrateLegacyUserDataIfNeeded(app, APP_NAME, USER_DATA_PATH);
const SETTINGS_PATH = path.join(USER_DATA_PATH, 'settings.json');

let mainWindow = null;
let tray = null;
let isQuitting = false;
const reminderTimers = new Map();
let waterReminder = null;
let toiletReminder = null;
let activityLog = null;
let messageCenter = null;
let isBrowserPageActive = false;
let taskManager = null;
let memoManager = null;
let fileManager = null;
let dataBackup = null;
let browserBookmarks = null;
let configLoader = null;
let eyeCareMode = null;
let privacyMode = null;
let reminderToast = null;

const getConfigLoader = () => {
  if (!configLoader) {
    configLoader = createConfigLoader({
      userDataPath: USER_DATA_PATH,
      appRootPath: APP_ROOT,
    });
  }

  return configLoader;
};

const getAppRulesConfig = () => getConfigLoader().readAppRules();

const PERFORMANCE_RECORDS_PATH = path.join(USER_DATA_PATH, 'performance-records.json');

fs.mkdirSync(USER_DATA_PATH, { recursive: true });
app.setPath('userData', USER_DATA_PATH);
app.setName(APP_NAME);
app.setAppUserModelId('com.devassistant.tool');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

const getLoginItemOptions = () => ({
  openAtLogin: true,
  openAsHidden: true,
  args: [HIDDEN_STARTUP_ARG],
});

const loadAppSettings = () => {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (error) {
    console.error('[settings] 读取失败:', error.message);
    return {};
  }
};

const saveAppSettings = (settings) => {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
};

const getAutoLaunchEnabled = () => {
  const settings = loadAppSettings();
  if (typeof settings.autoLaunchEnabled === 'boolean') {
    return settings.autoLaunchEnabled;
  }

  return Boolean(getAppRulesConfig().app.autoLaunchDefaultEnabled);
};

const applyAutoLaunchEnabled = (enabled) => {
  app.setLoginItemSettings({
    ...getLoginItemOptions(),
    openAtLogin: enabled,
  });

  return getAutoLaunchEnabled();
};

const setAutoLaunchEnabled = (enabled) => {
  const nextEnabled = Boolean(enabled);
  const actualEnabled = applyAutoLaunchEnabled(nextEnabled);

  saveAppSettings({
    ...loadAppSettings(),
    autoLaunchInitialized: true,
    autoLaunchUserConfigured: true,
    autoLaunchEnabled: actualEnabled,
  });

  return actualEnabled;
};

const setupDefaultAutoLaunch = () => {
  const settings = loadAppSettings();

  if (settings.autoLaunchUserConfigured) {
    return;
  }

  const defaultEnabled = Boolean(getAppRulesConfig().app.autoLaunchDefaultEnabled);
  const actualEnabled = applyAutoLaunchEnabled(defaultEnabled);
  saveAppSettings({
    ...settings,
    autoLaunchInitialized: true,
    autoLaunchEnabled: actualEnabled,
  });
};

const getSystemPunchEnabled = () => {
  const settings = loadAppSettings();
  if (typeof settings.systemPunchEnabled === 'boolean') {
    return settings.systemPunchEnabled;
  }

  return Boolean(getAppRulesConfig().app.systemPunchDefaultEnabled);
};

const clearPunchReminderTimers = () => {
  for (const timer of reminderTimers.values()) {
    clearTimeout(timer);
  }
  reminderTimers.clear();
};

const setSystemPunchEnabled = (enabled) => {
  const nextEnabled = Boolean(enabled);
  saveAppSettings({
    ...loadAppSettings(),
    systemPunchEnabled: nextEnabled,
  });

  if (nextEnabled) {
    scheduleAllPunchReminders();
  } else {
    clearPunchReminderTimers();
  }

  return getSystemPunchEnabled();
};

const loadAppContent = (window) => {
  if (VITE_DEV_SERVER_URL) {
    window.loadURL(VITE_DEV_SERVER_URL);
    return;
  }

  window.loadFile(WEB_INDEX_PATH);
};

const isAllowedBrowserUrl = (url) => {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const attachBrowserWebviewHandlers = (window) => {
  window.webContents.on('did-attach-webview', (_event, webContents) => {
    webContents.setWindowOpenHandler(({ url, disposition }) => {
      if (isAllowedBrowserUrl(url)) {
        window.webContents.send('browser:open-url-in-tab', {
          url,
          background: disposition === 'background-tab',
        });
      }

      return { action: 'deny' };
    });
  });
};

const toggleDevTools = () => {
  if (!mainWindow) {
    return;
  }

  if (isBrowserPageActive) {
    mainWindow.webContents.send('browser:toggle-devtools');
    return;
  }

  if (mainWindow.webContents.isDevToolsOpened()) {
    mainWindow.webContents.closeDevTools();
  } else {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

const showMainWindow = (options = {}) => {
  if (!mainWindow) {
    createWindow();
    if (!options.skipPrivacyLock) {
      privacyMode?.notifyLockRequired();
    }
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();

  if (!options.skipPrivacyLock) {
    privacyMode?.notifyLockRequired();
  }
};

const getPunchReminderConfig = () => getAppRulesConfig().reminders.punch;

const morningSnoozeState = { dateKey: '', count: 0 };

const getTodayDateKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const getMorningSnoozeCount = () => {
  const today = getTodayDateKey();
  if (morningSnoozeState.dateKey !== today) {
    morningSnoozeState.dateKey = today;
    morningSnoozeState.count = 0;
  }

  return morningSnoozeState.count;
};

const incrementMorningSnoozeCount = () => {
  getMorningSnoozeCount();
  morningSnoozeState.count += 1;
};

const parseClockTime = (timeText, baseDate = new Date()) => {
  const match = String(timeText || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const parsed = new Date(baseDate);
  parsed.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return parsed;
};

const isWithinMorningReminderWindow = (config) => {
  const cutoff = parseClockTime(config?.cutoffTime || '10:00');
  if (!cutoff) {
    return true;
  }

  return Date.now() <= cutoff.getTime();
};

const scheduleNextMorningReminder = (delayMs = null) => {
  schedulePunchReminder('morning', delayMs);
};

const getMorningReminderMeta = (config) => {
  const now = new Date();
  return {
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    punchTime: config.punchTime || null,
  };
};

const getMsUntilNextWorkdayTime = (hour, minute) => {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  if (target <= now || !getDateMeta(target).isWorkday) {
    target.setDate(target.getDate() + 1);
    target.setHours(hour, minute, 0, 0);

    while (!getDateMeta(target).isWorkday) {
      target.setDate(target.getDate() + 1);
    }
  }

  return target.getTime() - now.getTime();
};

const getMsUntilWorkdayTimeTodayOrNext = (hour, minute) => {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  if (target > now && getDateMeta(target).isWorkday) {
    return target.getTime() - now.getTime();
  }

  return getMsUntilNextWorkdayTime(hour, minute);
};

const sendPunchReminderRecord = (kind) => {
  const config = getPunchReminderConfig()[kind];
  if (!config) {
    return;
  }

  const send = () => {
    mainWindow?.webContents.send('punchReminder:record', {
      kind,
      punchTime: config.punchTime,
    });
  };

  if (!mainWindow) {
    return;
  }

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
    return;
  }

  send();
};

const sendClockInReminder = () => {
  const send = () => {
    mainWindow?.webContents.send('punchReminder:clockIn', {});
  };

  if (!mainWindow) {
    return;
  }

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
    return;
  }

  send();
};

const scheduleAllPunchReminders = () => {
  schedulePunchReminder('morning');
  schedulePunchReminder('early');
};

const clearLatePunchReminder = () => {
  const timer = reminderTimers.get('late');
  if (timer) {
    clearTimeout(timer);
    reminderTimers.delete('late');
  }
};

const schedulePunchReminder = (kind, delayMs = null) => {
  if (!getSystemPunchEnabled()) {
    clearPunchReminderTimers();
    return;
  }

  if (isReminderSnoozedToday(loadAppSettings, 'punch')) {
    const waitMs = msUntilSnoozeExpires(loadAppSettings, 'punch');
    if (waitMs > 0) {
      const existingTimer = reminderTimers.get('snooze-resume');
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        reminderTimers.delete('snooze-resume');
        scheduleAllPunchReminders();
      }, waitMs);
      reminderTimers.set('snooze-resume', timer);
    }
    return;
  }

  const config = getPunchReminderConfig()[kind];
  if (!config) {
    return;
  }

  const existingTimer = reminderTimers.get(kind);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timeout =
    delayMs ?? getMsUntilNextWorkdayTime(config.hour, config.minute);

  const timer = setTimeout(async () => {
    reminderTimers.delete(kind);

    if (!getDateMeta(new Date()).isWorkday) {
      schedulePunchReminder(kind);
      return;
    }

    await showPunchReminder(kind);

    if (kind === 'early' && getSystemPunchEnabled()) {
      schedulePunchReminder('early');
    }
  }, timeout);

  reminderTimers.set(kind, timer);
};

const scheduleLatePunchReminder = () => {
  if (!getSystemPunchEnabled()) {
    return;
  }

  const { hour, minute } = getPunchReminderConfig().late;
  schedulePunchReminder('late', getMsUntilWorkdayTimeTodayOrNext(hour, minute));
};

const showPunchReminder = async (kind, options = {}) => {
  if (!options.force && !getSystemPunchEnabled()) {
    return;
  }

  if (!options.force && isReminderSnoozedToday(loadAppSettings, 'punch')) {
    return;
  }

  const config = getPunchReminderConfig()[kind];
  if (!config) {
    return;
  }

  if (kind === 'morning' && !options.force && !isWithinMorningReminderWindow(config)) {
    scheduleNextMorningReminder();
    return;
  }

  const response = await reminderToast.showActionReminder({
    title: options.isTest ? `[预览] ${config.title}` : config.title,
    body: config.message,
    buttons: config.buttons,
    cancelIndex: config.buttons.length - 1,
    theme: `punch-${kind}`,
    meta:
      kind === 'morning'
        ? getMorningReminderMeta(config)
        : {
            time: `${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')}`,
            punchTime: config.punchTime || null,
          },
    messageTracking: {
      category: 'attendance',
      kind,
      isTest: Boolean(options.isTest),
    },
  });

  if (options.isTest) {
    return;
  }

  if (response === REMINDER_TOAST.SNOOZE_TODAY) {
    snoozeReminderToday(loadAppSettings, saveAppSettings, 'punch');
    clearPunchReminderTimers();
    scheduleAllPunchReminders();
    activityLog?.appendLog({
      category: 'attendance',
      action: 'snooze-today',
      title: '打卡提醒',
      summary: '已设置今日不再提醒打卡',
      detail: { kind },
    });
    return;
  }

  if (response === REMINDER_TOAST.CLOSED || response < 0) {
    if (kind === 'morning') {
      scheduleNextMorningReminder();
    }
    if (kind === 'early') {
      scheduleLatePunchReminder();
    }
    return;
  }

  if (kind === 'morning') {
    if (response === 0) {
      sendClockInReminder();
      scheduleNextMorningReminder();
      return;
    }

    if (response === 1) {
      const snoozeMinutes = Number(config.snoozeMinutes || 15);
      const maxSnoozes = Number(config.maxSnoozesPerDay ?? 2);

      if (
        getMorningSnoozeCount() < maxSnoozes &&
        isWithinMorningReminderWindow(config)
      ) {
        incrementMorningSnoozeCount();
        scheduleNextMorningReminder(snoozeMinutes * 60 * 1000);
      } else {
        scheduleNextMorningReminder();
      }
    }
    return;
  }

  if (response === 0) {
    if (kind === 'early') {
      clearLatePunchReminder();
    }
    sendPunchReminderRecord(kind);
    return;
  }

  if (kind === 'early' && response === 1) {
    scheduleLatePunchReminder();
  }
};

let appIconSource = null;

const loadAppIconSource = () => {
  if (appIconSource && !appIconSource.isEmpty()) {
    return appIconSource;
  }

  if (fs.existsSync(APP_ICON_PNG_PATH)) {
    appIconSource = nativeImage.createFromPath(APP_ICON_PNG_PATH);
  } else {
    appIconSource = nativeImage.createFromDataURL(APP_ICON_DATA_URL);
  }

  return appIconSource;
};

const resizeAppIcon = (size) => {
  const source = loadAppIconSource();
  const { width, height } = source.getSize();

  if (width === size && height === size) {
    return source;
  }

  return source.resize({
    width: size,
    height: size,
    quality: 'best',
  });
};

const createTrayIcon = () => resizeAppIcon(TRAY_ICON_SIZE);

const createTaskbarIcon = () => {
  const source = loadAppIconSource();
  const { width } = source.getSize();
  return width >= TASKBAR_ICON_SIZE
    ? source
    : resizeAppIcon(TASKBAR_ICON_SIZE);
};

const applyWindowIcon = (window) => {
  const icon = createTaskbarIcon();
  window.setIcon(icon);

  if (process.platform === 'darwin' || process.platform === 'linux') {
    app.setIcon(icon);
  }
};

const quitApp = () => {
  isQuitting = true;
  app.quit();
};

const createTray = () => {
  tray = new Tray(createTrayIcon());
  tray.setToolTip(APP_NAME);
  updateTrayMenu();
  tray.on('double-click', showMainWindow);
};

const notifyPrivacyStatusChanged = () => {
  updateTrayMenu();
  mainWindow?.webContents.send('privacyMode:statusChanged');
};

const handleTrayPrivacyModeClick = () => {
  const enabled = Boolean(privacyMode?.isEnabled());

  if (!enabled) {
    if (!privacyMode.isConfigured()) {
      privacyMode.beginProtectedFlow();
      showMainWindow({ skipPrivacyLock: true });
      mainWindow?.webContents.send('privacyMode:showSetupDialog');
      return;
    }

    try {
      privacyMode.enablePrivacyMode();
      notifyPrivacyStatusChanged();
    } catch (error) {
      console.error('[privacy-mode] 托盘开启失败:', error.message);
    }
    return;
  }

  privacyMode.beginProtectedFlow();
  showMainWindow({ skipPrivacyLock: true });
  mainWindow?.webContents.send('privacyMode:showDisableDialog');
};

const updateTrayMenu = () => {
  if (!tray) {
    return;
  }

  const privacyEnabled = Boolean(privacyMode?.isEnabled());

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `打开${APP_NAME}`,
        click: showMainWindow,
      },
      { type: 'separator' },
      {
        label: privacyEnabled ? '关闭隐私模式' : '开启隐私模式',
        click: handleTrayPrivacyModeClick,
      },
      { type: 'separator' },
      {
        label: '退出',
        click: quitApp,
      },
    ])
  );
};

const createMenu = () => {
  const template = [
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { type: 'separator' },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: toggleDevTools,
        },
        { role: 'toggleDevTools', label: '切换开发者工具', accelerator: 'CmdOrCtrl+Shift+I' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { label: '隐藏到托盘', click: () => mainWindow?.hide() },
        { label: '退出', click: quitApp },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const notifyWindowMaximizeChanged = () => {
  mainWindow?.webContents.send('window:maximize-changed', Boolean(mainWindow?.isMaximized()));
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    icon: createTaskbarIcon(),
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    backgroundColor: '#111318',
    show: !process.argv.includes(HIDDEN_STARTUP_ARG),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: true,
      devTools: true,
    },
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      toggleDevTools();
    }
  });

  attachBrowserWebviewHandlers(mainWindow);

  applyWindowIcon(mainWindow);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[load] ${errorCode} ${errorDescription} -> ${validatedURL}`);
  });

  loadAppContent(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes(HIDDEN_STARTUP_ARG)) {
      mainWindow.show();
    }
    if (OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
    privacyMode?.notifyLockRequired();
  });

  mainWindow.on('maximize', notifyWindowMaximizeChanged);
  mainWindow.on('unmaximize', notifyWindowMaximizeChanged);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const setupIpcHandlers = () => {
  ipcMain.on('config:getAppRulesSync', (event) => {
    event.returnValue = getAppRulesConfig();
  });
  ipcMain.handle('app:getStoragePaths', () => getStoragePaths(app, APP_NAME, USER_DATA_PATH));
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) {
      return false;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }

    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()));
  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });
  ipcMain.handle('autoLaunch:get', () => getAutoLaunchEnabled());
  ipcMain.handle('autoLaunch:set', (_event, enabled) => setAutoLaunchEnabled(Boolean(enabled)));
  ipcMain.handle('systemPunch:get', () => getSystemPunchEnabled());
  ipcMain.handle('systemPunch:set', (_event, enabled) => setSystemPunchEnabled(Boolean(enabled)));
  ipcMain.handle('eyeCareMode:get', () => eyeCareMode.getEyeCareModeEnabled());
  ipcMain.handle('eyeCareMode:set', (_event, enabled) => eyeCareMode.setEyeCareModeEnabled(Boolean(enabled)));
  ipcMain.handle('eyeCareMode:getIntensity', () => eyeCareMode.getEyeCareModeIntensity());
  ipcMain.handle('eyeCareMode:setIntensity', (_event, intensity) =>
    eyeCareMode.setEyeCareModeIntensity(intensity)
  );
  ipcMain.handle('privacyMode:getStatus', () => privacyMode.getStatus());
  ipcMain.handle('privacyMode:getSetupQuestions', () => privacyMode.getSetupQuestions());
  ipcMain.handle('privacyMode:setup', (_event, payload) => {
    const result = privacyMode.setupPrivacyMode(payload);
    notifyPrivacyStatusChanged();
    return result;
  });
  ipcMain.handle('privacyMode:enable', () => {
    const result = privacyMode.enablePrivacyMode();
    notifyPrivacyStatusChanged();
    return result;
  });
  ipcMain.handle('privacyMode:verifyPassword', (_event, password) =>
    privacyMode.verifyPassword(password)
  );
  ipcMain.handle('privacyMode:disable', (_event, password) => {
    const result = privacyMode.disablePrivacyMode(password);
    notifyPrivacyStatusChanged();
    return result;
  });
  ipcMain.handle('privacyMode:changePassword', (_event, payload) =>
    privacyMode.changePrivacyPassword(payload)
  );
  ipcMain.handle('privacyMode:getSecurityQuestions', () => privacyMode.getSecurityQuestions());
  ipcMain.handle('privacyMode:recover', (_event, payload) => {
    const result = privacyMode.recoverWithSecurityAnswer(payload);
    notifyPrivacyStatusChanged();
    return result;
  });
  ipcMain.handle('privacyMode:resetAllData', () => {
    const result = privacyMode.resetAllDataAndPrivacy();
    notifyPrivacyStatusChanged();
    return result;
  });
  ipcMain.handle('privacyMode:beginProtectedFlow', () => privacyMode.beginProtectedFlow());
  ipcMain.handle('privacyMode:endProtectedFlow', () => privacyMode.endProtectedFlow());
  ipcMain.handle('waterReminder:get', () => waterReminder.getWaterReminderEnabled());
  ipcMain.handle('waterReminder:set', (_event, enabled) => waterReminder.setWaterReminderEnabled(Boolean(enabled)));
  ipcMain.handle('waterRecords:get', () => waterReminder.loadWaterRecords());
  ipcMain.handle('waterRecords:add', (_event, record) => waterReminder.appendWaterRecord(record));
  ipcMain.handle('toiletReminder:get', () => toiletReminder.getToiletReminderEnabled());
  ipcMain.handle('toiletReminder:set', (_event, enabled) =>
    toiletReminder.setToiletReminderEnabled(Boolean(enabled))
  );
  ipcMain.handle('toiletRecords:get', () => toiletReminder.loadToiletRecords());
  ipcMain.handle('toiletRecords:add', (_event, record) => toiletReminder.appendToiletRecord(record));
  ipcMain.handle('toiletRecords:delete', (_event, payload) =>
    toiletReminder.removeToiletRecord(payload?.dateKey, payload?.recordId)
  );
  ipcMain.handle('reminder:testToilet', (_event, type) =>
    toiletReminder.showTestReminder(type)
  );
  ipcMain.handle('reminder:testPunch', () =>
    showPunchReminder('early', { force: true, isTest: true })
  );
  ipcMain.handle('reminder:testMorningPunch', () =>
    showPunchReminder('morning', { force: true, isTest: true })
  );
  ipcMain.handle('reminder:testWater', () => waterReminder.showTestReminder());
  ipcMain.handle('reminder:testTask', () => taskManager.showTestReminder());
  ipcMain.handle('activityLog:getAll', () => activityLog.loadLogs());
  ipcMain.handle('activityLog:append', (_event, entry) => activityLog.appendLog(entry));
  ipcMain.handle('activityLog:clear', () => activityLog.clearLogs());
  ipcMain.handle('messages:getAll', () => messageCenter.loadMessages());
  ipcMain.handle('messages:clear', () => messageCenter.clearMessages());
  ipcMain.on('browser:setPageActive', (_event, active) => {
    isBrowserPageActive = Boolean(active);
  });
  ipcMain.handle('browser:clearCache', () => clearBrowserSessionData());
  ipcMain.handle('browser:getBookmarks', () => browserBookmarks.loadBookmarks());
  ipcMain.handle('browser:saveBookmarks', (_event, bookmarks) =>
    browserBookmarks.saveBookmarks(bookmarks)
  );
  ipcMain.handle('tasks:getAll', () => taskManager.loadTasks());
  ipcMain.handle('tasks:create', (_event, payload) => taskManager.createTask(payload));
  ipcMain.handle('tasks:update', (_event, taskId, payload) => taskManager.updateTask(taskId, payload));
  ipcMain.handle('tasks:delete', (_event, taskId) => taskManager.deleteTask(taskId));
  ipcMain.handle('tasks:toggleComplete', (_event, taskId, completed) =>
    taskManager.toggleTaskComplete(taskId, completed)
  );
  ipcMain.handle('tasks:getReminderEnabled', () => taskManager.getTaskReminderEnabled());
  ipcMain.handle('tasks:setReminderEnabled', (_event, enabled) =>
    taskManager.setTaskReminderEnabled(Boolean(enabled))
  );
  ipcMain.handle('memos:getAll', () => memoManager.loadMemos());
  ipcMain.handle('memos:create', (_event, payload) => memoManager.createMemo(payload));
  ipcMain.handle('memos:update', (_event, memoId, payload) => memoManager.updateMemo(memoId, payload));
  ipcMain.handle('memos:delete', (_event, memoId) => memoManager.deleteMemo(memoId));
  ipcMain.handle('vaultFiles:getAll', () => fileManager.getState());
  ipcMain.handle('vaultFiles:pickAndAdd', (_event, folderId) => fileManager.pickAndAddFiles(folderId || null));
  ipcMain.handle('vaultFiles:pickAndImportFolder', (_event, folderId) =>
    fileManager.pickAndImportFolder(folderId || null)
  );
  ipcMain.handle('vaultFiles:addFromPaths', (_event, payload) =>
    fileManager.addFilesFromPaths(payload?.filePaths || [], { folderId: payload?.folderId || null })
  );
  ipcMain.handle('vaultFiles:addFromDrop', (_event, payload) => fileManager.addFilesFromDrop(payload || {}));
  ipcMain.handle('vaultFiles:createFolder', (_event, payload) => fileManager.createFolder(payload));
  ipcMain.handle('vaultFiles:updateFolder', (_event, folderId, payload) =>
    fileManager.updateFolder(folderId, payload)
  );
  ipcMain.handle('vaultFiles:deleteFolder', (_event, folderId) => fileManager.deleteFolder(folderId));
  ipcMain.handle('vaultFiles:update', (_event, fileId, payload) =>
    fileManager.updateFileMeta(fileId, payload)
  );
  ipcMain.handle('vaultFiles:delete', (_event, fileId) => fileManager.deleteFile(fileId));
  ipcMain.handle('vaultFiles:open', async (_event, fileId) => fileManager.openFile(fileId));
  ipcMain.handle('vaultFiles:reveal', async (_event, fileId) => fileManager.revealFile(fileId));
  ipcMain.handle('vaultFiles:getPreview', (_event, fileId) => fileManager.getPreviewDataUrl(fileId));
  ipcMain.handle('dataBackup:export', (_event, clientPayload) => dataBackup.exportBackup(clientPayload));
  ipcMain.handle('dataBackup:import', () => dataBackup.importBackup());
  ipcMain.handle('dataBackup:apply', (_event, snapshot) => dataBackup.applySnapshot(snapshot));
  ipcMain.handle('dataBackup:getPerformanceRecords', () => {
    if (!fs.existsSync(PERFORMANCE_RECORDS_PATH)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(PERFORMANCE_RECORDS_PATH, 'utf8'));
    } catch {
      return {};
    }
  });
  ipcMain.handle('dataBackup:savePerformanceRecords', (_event, records) => {
    fs.writeFileSync(PERFORMANCE_RECORDS_PATH, JSON.stringify(records || {}, null, 2));
  });
};

app.whenReady().then(async () => {
  if (!VITE_DEV_SERVER_URL && !fs.existsSync(WEB_INDEX_PATH)) {
    console.error(`网页文件不存在: ${WEB_INDEX_PATH}`);
    console.error('请先执行: npm run build:vue');
    app.quit();
    return;
  }

  setupDefaultAutoLaunch();
  activityLog = createActivityLogModule({
    userDataPath: USER_DATA_PATH,
    getMainWindow: () => mainWindow,
  });
  messageCenter = createMessageCenterModule({
    userDataPath: USER_DATA_PATH,
    getMainWindow: () => mainWindow,
  });
  reminderToast = createReminderToastModule({
    getAppIcon: createTaskbarIcon,
    messageCenter,
  });
  reminderToast.registerIpc();
  waterReminder = createWaterReminderModule({
    userDataPath: USER_DATA_PATH,
    loadAppSettings,
    saveAppSettings,
    getMainWindow: () => mainWindow,
    showActionReminder: (options) => reminderToast.showActionReminder(options),
    activityLog,
  });
  toiletReminder = createToiletReminderModule({
    userDataPath: USER_DATA_PATH,
    loadAppSettings,
    saveAppSettings,
    getMainWindow: () => mainWindow,
    showActionReminder: (options) => reminderToast.showActionReminder(options),
    activityLog,
  });
  taskManager = createTaskManagerModule({
    userDataPath: USER_DATA_PATH,
    loadAppSettings,
    saveAppSettings,
    getMainWindow: () => mainWindow,
    showActionReminder: (options) => reminderToast.showActionReminder(options),
    activityLog,
  });
  memoManager = createMemoManagerModule({
    userDataPath: USER_DATA_PATH,
    getMainWindow: () => mainWindow,
    activityLog,
  });
  fileManager = createFileManagerModule({
    userDataPath: USER_DATA_PATH,
    getMainWindow: () => mainWindow,
    activityLog,
  });
  dataBackup = createDataBackupModule({
    userDataPath: USER_DATA_PATH,
    appRootPath: path.join(__dirname, '..'),
    appName: APP_NAME,
    appVersion: require('../package.json').version,
    getMainWindow: () => mainWindow,
    getVaultFilesSnapshot: () => fileManager.exportSnapshot(),
    importVaultFilesSnapshot: (entries) => fileManager.importSnapshot(entries),
    resetVaultFiles: () => fileManager.resetAll(),
    onImported: (normalized) => {
      messageCenter?.replaceMessages(normalized?.data?.messages || []);
      waterReminder?.scheduleNextWaterReminder();
      toiletReminder?.scheduleNextToiletReminder();
      taskManager?.scheduleNextTaskReminder();
      eyeCareMode?.syncEyeCareModeFromSettings();
    },
  });
  eyeCareMode = createEyeCareModeModule({
    loadAppSettings,
    saveAppSettings,
    getDefaultEnabled: () => getAppRulesConfig().app.eyeCareModeDefaultEnabled,
    getEyeCareConfig: () => getAppRulesConfig().app.eyeCareMode,
  });
  privacyMode = createPrivacyModeModule({
    userDataPath: USER_DATA_PATH,
    getPrivacyRules: () => getAppRulesConfig().app.privacyMode,
    resetAllUserData: () => dataBackup.resetAllUserData(),
    getMainWindow: () => mainWindow,
  });
  browserBookmarks = createBrowserBookmarksModule({
    userDataPath: USER_DATA_PATH,
  });
  setupIpcHandlers();
  createMenu();
  createTray();
  createWindow();
  if (getSystemPunchEnabled()) {
    scheduleAllPunchReminders();
  }
  if (waterReminder.getWaterReminderEnabled()) {
    waterReminder.scheduleNextWaterReminder();
  }
  if (toiletReminder.getToiletReminderEnabled()) {
    toiletReminder.scheduleNextToiletReminder();
  }
  if (taskManager.getTaskReminderEnabled()) {
    taskManager.scheduleNextTaskReminder();
  }
  eyeCareMode.syncEyeCareModeFromSettings();

  globalShortcut.register('F12', toggleDevTools);
  if (!globalShortcut.isRegistered('F12')) {
    console.warn('[shortcut] F12 全局快捷键注册失败，已启用 before-input-event 兜底');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  clearPunchReminderTimers();
  waterReminder?.clearWaterReminderTimers();
  toiletReminder?.clearToiletReminderTimers();
  taskManager?.clearTaskReminderTimer();
  eyeCareMode?.destroyOverlays();
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});
