import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const primaryOutput = 'dist-release';
const fallbackOutput = 'dist-release-build';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const killRunningApp = () => {
  if (process.platform !== 'win32') {
    return;
  }

  for (const processName of ['开发辅助工具.exe', 'electron.exe']) {
    try {
      execSync(`taskkill /F /IM "${processName}" /T`, { stdio: 'ignore' });
    } catch {
      // process not running
    }
  }
};

const tryCleanOutput = (outputDir) => {
  const targetPath = path.join(root, outputDir);
  if (!fs.existsSync(targetPath)) {
    return true;
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.warn(`[build] 无法清理 ${outputDir}: ${error.message}`);
    return false;
  }
};

const runBuilder = (outputDir) => {
  execSync(`npx electron-builder --win --config.directories.output=${outputDir}`, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
};

const resolveOutputDir = () => {
  if (tryCleanOutput(primaryOutput)) {
    return primaryOutput;
  }

  if (tryCleanOutput(fallbackOutput)) {
    console.warn(
      `[build] ${primaryOutput} 被占用，改输出到 ${fallbackOutput}。建议关闭正在运行的「开发辅助工具」。`
    );
    return fallbackOutput;
  }

  const stampedOutput = `dist-release-${Date.now()}`;
  console.warn(
    `[build] ${primaryOutput} 与 ${fallbackOutput} 均被占用，改输出到 ${stampedOutput}。请关闭正在运行的「开发辅助工具」后重新构建。`
  );
  return stampedOutput;
};

killRunningApp();
await sleep(800);

runBuilder(resolveOutputDir());
