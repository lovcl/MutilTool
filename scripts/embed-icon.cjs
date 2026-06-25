const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const productFilename = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(__dirname, '..', 'electron', 'assets', 'app-icon.ico');

  if (!fs.existsSync(exePath)) {
    throw new Error(`[afterPack] executable not found: ${exePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`[afterPack] icon not found: ${iconPath}`);
  }

  const { rcedit } = await import('rcedit');
  await rcedit(exePath, { icon: iconPath });
  console.log(`[afterPack] icon embedded into ${exePath}`);
};
