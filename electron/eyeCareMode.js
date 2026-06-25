const { BrowserWindow, screen } = require('electron');
const path = require('path');

const OVERLAY_HTML_PATH = path.join(__dirname, 'eye-care-overlay.html');

const createEyeCareModeModule = ({
  loadAppSettings,
  saveAppSettings,
  getDefaultEnabled,
  getEyeCareConfig,
}) => {
  const overlayWindows = new Set();
  let displayListenersBound = false;

  const getIntensityBounds = () => {
    const config = getEyeCareConfig?.() || {};
    return {
      min: Number.isFinite(config.minIntensity) ? config.minIntensity : 1,
      max: Number.isFinite(config.maxIntensity) ? config.maxIntensity : 20,
      defaultIntensity: Number.isFinite(config.defaultIntensity) ? config.defaultIntensity : 2,
      opacityScale: Number.isFinite(config.opacityScale) ? config.opacityScale : 0.45,
      rgb: Array.isArray(config.overlayRgb) ? config.overlayRgb : [255, 248, 238],
    };
  };

  const clampIntensity = (value) => {
    const { min, max } = getIntensityBounds();
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return getIntensityBounds().defaultIntensity;
    }

    return Math.min(max, Math.max(min, Math.round(numeric)));
  };

  const getEyeCareModeEnabled = () => {
    const settings = loadAppSettings();
    if (typeof settings.eyeCareModeEnabled === 'boolean') {
      return settings.eyeCareModeEnabled;
    }

    return Boolean(getDefaultEnabled?.());
  };

  const getEyeCareModeIntensity = () => {
    const settings = loadAppSettings();
    if (typeof settings.eyeCareModeIntensity === 'number') {
      return clampIntensity(settings.eyeCareModeIntensity);
    }

    return clampIntensity(getIntensityBounds().defaultIntensity);
  };

  const buildOverlayColor = (intensity = getEyeCareModeIntensity()) => {
    const { rgb, opacityScale } = getIntensityBounds();
    const opacity = (clampIntensity(intensity) / 100) * opacityScale;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity.toFixed(3)})`;
  };

  const destroyOverlays = () => {
    for (const overlayWindow of overlayWindows) {
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.destroy();
      }
    }

    overlayWindows.clear();
  };

  const applyOverlayColor = (overlayWindow, color = buildOverlayColor()) => {
    overlayWindow.webContents
      .executeJavaScript(
        `document.documentElement.style.setProperty('--eye-care-color', ${JSON.stringify(color)})`,
        true
      )
      .catch((error) => {
        console.error('[eye-care] 设置遮罩颜色失败:', error.message);
      });
  };

  const refreshOverlayColors = () => {
    const color = buildOverlayColor();

    for (const overlayWindow of overlayWindows) {
      if (!overlayWindow.isDestroyed()) {
        applyOverlayColor(overlayWindow, color);
      }
    }
  };

  const createOverlayForDisplay = (display) => {
    const { x, y, width, height } = display.bounds;

    const overlayWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      hasShadow: false,
      show: false,
      enableLargerThanScreen: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    overlayWindow.setAlwaysOnTop(true, 'floating');
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    overlayWindow.webContents.once('did-finish-load', () => {
      if (overlayWindow.isDestroyed()) {
        return;
      }

      applyOverlayColor(overlayWindow);
      overlayWindow.show();
    });

    overlayWindow.loadFile(OVERLAY_HTML_PATH).catch((error) => {
      console.error('[eye-care] 加载遮罩失败:', error.message);
    });

    overlayWindows.add(overlayWindow);
    return overlayWindow;
  };

  const bindDisplayListeners = () => {
    if (displayListenersBound) {
      return;
    }

    const refresh = () => {
      if (!getEyeCareModeEnabled()) {
        return;
      }

      showOverlays();
    };

    screen.on('display-added', refresh);
    screen.on('display-removed', refresh);
    screen.on('display-metrics-changed', refresh);
    displayListenersBound = true;
  };

  const showOverlays = () => {
    destroyOverlays();

    for (const display of screen.getAllDisplays()) {
      createOverlayForDisplay(display);
    }
  };

  const applyEyeCareMode = (enabled) => {
    if (enabled) {
      bindDisplayListeners();
      showOverlays();
      return;
    }

    destroyOverlays();
  };

  const setEyeCareModeEnabled = (enabled) => {
    const nextEnabled = Boolean(enabled);

    saveAppSettings({
      ...loadAppSettings(),
      eyeCareModeEnabled: nextEnabled,
    });

    applyEyeCareMode(nextEnabled);
    return getEyeCareModeEnabled();
  };

  const setEyeCareModeIntensity = (intensity) => {
    const nextIntensity = clampIntensity(intensity);

    saveAppSettings({
      ...loadAppSettings(),
      eyeCareModeIntensity: nextIntensity,
    });

    if (getEyeCareModeEnabled()) {
      refreshOverlayColors();
    }

    return getEyeCareModeIntensity();
  };

  const syncEyeCareModeFromSettings = () => {
    applyEyeCareMode(getEyeCareModeEnabled());
  };

  return {
    getEyeCareModeEnabled,
    getEyeCareModeIntensity,
    getIntensityBounds,
    setEyeCareModeEnabled,
    setEyeCareModeIntensity,
    syncEyeCareModeFromSettings,
    destroyOverlays,
  };
};

module.exports = { createEyeCareModeModule };
