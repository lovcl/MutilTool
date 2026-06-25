const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { REMINDER_TOAST } = require('./reminderSnooze');

const TOAST_HTML_PATH = path.join(__dirname, 'reminder-toast.html');
const TOAST_PRELOAD_PATH = path.join(__dirname, 'reminder-toast.preload.js');

const parseToastResponse = (payload) => {
  if (payload === 'snooze-today') {
    return REMINDER_TOAST.SNOOZE_TODAY;
  }

  if (payload === 'close') {
    return REMINDER_TOAST.CLOSED;
  }

  const index = Number(payload);
  return Number.isNaN(index) ? REMINDER_TOAST.CLOSED : index;
};

const createReminderToastModule = ({ getAppIcon, messageCenter }) => {
  let toastWindow = null;
  let toastResolve = null;
  let pendingToastPayload = null;
  let pendingMessageTracking = null;
  let ipcRegistered = false;

  const finalizeToastResponse = (response) => {
    if (!pendingMessageTracking || !messageCenter || !pendingToastPayload) {
      pendingToastPayload = null;
      pendingMessageTracking = null;
      return;
    }

    messageCenter.recordReminder({
        category: pendingMessageTracking.category,
        kind: pendingMessageTracking.kind || null,
        isTest: Boolean(pendingMessageTracking.isTest),
        title: pendingToastPayload.title,
        body: pendingToastPayload.body,
        buttons: pendingToastPayload.buttons,
        theme: pendingToastPayload.theme,
        meta: pendingToastPayload.meta,
        shownAt: pendingMessageTracking.shownAt,
        response,
    });

    pendingToastPayload = null;
    pendingMessageTracking = null;
  };

  const closeToastWindow = (response = REMINDER_TOAST.CLOSED) => {
    const resolve = toastResolve;
    toastResolve = null;

    finalizeToastResponse(response);

    if (toastWindow && !toastWindow.isDestroyed()) {
      toastWindow.removeAllListeners('closed');
      toastWindow.destroy();
    }

    toastWindow = null;
    // 延后 resolve，避免在 IPC 回调里同步跑后续提醒逻辑阻塞主进程/窗口销毁
    if (resolve) {
      setImmediate(() => resolve(response));
    }
  };

  const registerIpc = () => {
    if (ipcRegistered) {
      return;
    }

    ipcMain.on('reminder-toast:response', (event, payload) => {
      if (!toastWindow || event.sender !== toastWindow.webContents) {
        return;
      }

      closeToastWindow(parseToastResponse(payload));
    });

    ipcRegistered = true;
  };

  const showActionReminder = ({
    title,
    body,
    buttons = [],
    timeoutMs = 0,
    cancelIndex = buttons.length - 1,
    theme = 'default',
    meta = {},
    messageTracking = null,
  }) =>
    new Promise((resolve) => {
      if (!Array.isArray(buttons) || !buttons.length) {
        resolve(REMINDER_TOAST.CLOSED);
        return;
      }

      if (toastWindow && !toastWindow.isDestroyed()) {
        closeToastWindow(REMINDER_TOAST.CLOSED);
      }

      toastResolve = resolve;
      pendingToastPayload = { title, body, buttons, theme, meta };
      pendingMessageTracking = messageTracking
        ? {
            ...messageTracking,
            shownAt: messageTracking.shownAt || new Date().toISOString(),
          }
        : null;

      const width = 404;
      const themedHeight = {
        water: 356,
        'toilet-bowel': 332,
        'toilet-urination': 332,
        'punch-morning': 320,
        'punch-early': 320,
        'punch-late': 320,
        task: 300,
      };
      const bodyLines = Math.ceil(String(body || '').length / 30);
      const height = Math.min(
        420,
        (themedHeight[theme] || 300) + Math.max(0, bodyLines - 3) * 16
      );
      const { workArea } = screen.getPrimaryDisplay();
      const margin = 16;

      toastWindow = new BrowserWindow({
        width,
        height,
        x: workArea.x + workArea.width - width - margin,
        y: workArea.y + workArea.height - height - margin,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        focusable: true,
        show: false,
        transparent: true,
        hasShadow: true,
        icon: getAppIcon?.() || undefined,
        webPreferences: {
          preload: TOAST_PRELOAD_PATH,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      let timeoutId = null;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          closeToastWindow(cancelIndex);
        }, timeoutMs);
      }

      toastWindow.on('closed', () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        toastWindow = null;

        if (toastResolve) {
          const pending = toastResolve;
          toastResolve = null;
          finalizeToastResponse(REMINDER_TOAST.CLOSED);
          setImmediate(() => pending(REMINDER_TOAST.CLOSED));
        }
      });

      toastWindow.webContents.once('did-finish-load', () => {
        toastWindow?.webContents.send('reminder-toast:init', {
          title,
          body,
          buttons,
          theme,
          meta,
        });
        toastWindow?.show();
      });

      toastWindow.loadFile(TOAST_HTML_PATH).catch((error) => {
        console.error('[reminder-toast] 加载失败:', error.message);
        closeToastWindow(REMINDER_TOAST.CLOSED);
      });
    });

  return {
    registerIpc,
    showActionReminder,
    closeToastWindow,
  };
};

module.exports = { createReminderToastModule, REMINDER_TOAST };
