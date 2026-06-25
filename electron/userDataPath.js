const fs = require('fs');
const path = require('path');

const DATA_DIR_NAME = 'app-data';

const copyDirectoryRecursive = (sourceDir, targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true });

  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
      return;
    }

    fs.copyFileSync(sourcePath, targetPath);
  });
};

const directoryHasEntries = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    return false;
  }

  return fs.readdirSync(dirPath).length > 0;
};

const resolveUserDataPath = (app, appName) => {
  if (!app.isPackaged) {
    return path.join(__dirname, '../.electron-data');
  }

  return path.join(path.dirname(app.getPath('exe')), DATA_DIR_NAME);
};

const getLegacyUserDataPath = (app, appName) => {
  if (!app.isPackaged) {
    return null;
  }

  return path.join(app.getPath('appData'), appName);
};

const migrateLegacyUserDataIfNeeded = (app, appName, userDataPath) => {
  const legacyPath = getLegacyUserDataPath(app, appName);
  if (!legacyPath || legacyPath === userDataPath) {
    return false;
  }

  if (!directoryHasEntries(legacyPath) || directoryHasEntries(userDataPath)) {
    return false;
  }

  copyDirectoryRecursive(legacyPath, userDataPath);
  console.log(`[user-data] 已从旧目录迁移数据: ${legacyPath} -> ${userDataPath}`);
  return true;
};

const getStoragePaths = (app, appName, userDataPath) => ({
  userDataPath,
  vaultFilesDir: path.join(userDataPath, 'vault-files'),
  installDir: app.isPackaged ? path.dirname(app.getPath('exe')) : null,
  legacyUserDataPath: getLegacyUserDataPath(app, appName),
});

module.exports = {
  DATA_DIR_NAME,
  resolveUserDataPath,
  migrateLegacyUserDataIfNeeded,
  getStoragePaths,
};
