const fs = require('fs');
const path = require('path');

const readJsonFile = (filePath, fallback = null) => {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[config] 读取失败 ${filePath}:`, error.message);
    return fallback;
  }
};

const createConfigLoader = ({ userDataPath, appRootPath }) => {
  const configDir = path.join(userDataPath, 'config');
  const defaultAppRulesPath = path.join(appRootPath, 'app.rules.config.json');

  const resolveAppRulesPath = () => {
    const overridePath = path.join(configDir, 'app.rules.config.json');
    return fs.existsSync(overridePath) ? overridePath : defaultAppRulesPath;
  };

  return {
    getAppRulesPath: resolveAppRulesPath,
    readAppRules: () => readJsonFile(resolveAppRulesPath(), readJsonFile(defaultAppRulesPath, {})),
  };
};

module.exports = { createConfigLoader };
