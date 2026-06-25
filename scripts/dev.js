const { spawn } = require('child_process');
const path = require('path');

process.env.OPEN_DEVTOOLS = '1';

const electronPath = require('electron');
const appRoot = path.join(__dirname, '..');
const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const viteCli = path.join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js');

let electron = null;

const vite = spawn(process.execPath, [
  viteCli,
  '--host',
  '127.0.0.1',
  '--port',
  '5173',
  '--strictPort',
], {
  cwd: appRoot,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const startElectron = () => {
  if (electron) {
    return;
  }

  electron = spawn(electronPath, [
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-gpu-sandbox',
    '--disable-features=VizDisplayCompositor',
    '.',
  ], {
    cwd: appRoot,
    env: {
      ...process.env,
      OPEN_DEVTOOLS: '1',
      VITE_DEV_SERVER_URL: viteUrl,
    },
    stdio: 'inherit',
  });

  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code || 0);
  });
};

const handleViteOutput = (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  if (text.includes('Local:') || text.includes('ready in')) {
    startElectron();
  }
};

vite.stdout.on('data', handleViteOutput);
vite.stderr.on('data', (chunk) => {
  process.stderr.write(chunk.toString());
});

vite.on('exit', (code) => {
  if (!electron) {
    process.exit(code || 1);
  }
});

vite.on('error', (error) => {
  console.error('[vite] 启动失败:', error);
  process.exit(1);
});

const stop = () => {
  if (electron) {
    electron.kill();
  }
  vite.kill();
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
