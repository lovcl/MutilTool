const fs = require('fs');
const path = require('path');

const MAX_LOGS = 3000;

const createActivityLogModule = ({ userDataPath, getMainWindow }) => {
  const logsPath = path.join(userDataPath, 'activity-logs.json');

  const loadLogs = () => {
    if (!fs.existsSync(logsPath)) {
      return [];
    }

    try {
      const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
      return Array.isArray(logs) ? logs : [];
    } catch (error) {
      console.error('[activity-log] 读取失败:', error.message);
      return [];
    }
  };

  const saveLogs = (logs) => {
    fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
  };

  const appendLog = (entry) => {
    const log = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: entry.category,
      action: entry.action,
      title: entry.title,
      summary: entry.summary,
      detail: entry.detail || null,
      recordedAt: entry.recordedAt || new Date().toISOString(),
    };

    const logs = loadLogs();
    logs.unshift(log);

    if (logs.length > MAX_LOGS) {
      logs.length = MAX_LOGS;
    }

    saveLogs(logs);
    getMainWindow()?.webContents.send('activityLog:append', log);

    return log;
  };

  const clearLogs = () => {
    saveLogs([]);
    getMainWindow()?.webContents.send('activityLog:clear');
  };

  return {
    loadLogs,
    appendLog,
    clearLogs,
  };
};

module.exports = { createActivityLogModule };
