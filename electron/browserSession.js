const { session } = require('electron');

const BROWSER_PARTITION = 'persist:browser';

const getBrowserSession = () => session.fromPartition(BROWSER_PARTITION);

const clearBrowserSessionData = async () => {
  const browserSession = getBrowserSession();

  await browserSession.clearCache();
  await browserSession.clearStorageData({
    storages: [
      'cookies',
      'filesystem',
      'indexdb',
      'localstorage',
      'shadercache',
      'websql',
      'serviceworkers',
      'cachestorage',
    ],
  });

  return { ok: true };
};

module.exports = {
  BROWSER_PARTITION,
  getBrowserSession,
  clearBrowserSessionData,
};
