const fs = require('fs');
const path = require('path');
const { dialog, shell } = require('electron');

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const PREVIEW_MAX_BYTES = 3 * 1024 * 1024;
const MAX_FOLDER_IMPORT_FILES = 500;
const MAX_FOLDER_IMPORT_DEPTH = 12;
const SKIP_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'svg',
  'ico',
]);
const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'md',
  'csv',
  'json',
  'xml',
  'zip',
  'rar',
  '7z',
]);

const guessMimeType = (fileName) => {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    zip: 'application/zip',
  };

  return map[ext] || 'application/octet-stream';
};

const detectCategory = (fileName, mimeType) => {
  const ext = path.extname(fileName).slice(1).toLowerCase();

  if (mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }

  if (DOCUMENT_EXTENSIONS.has(ext)) {
    return 'document';
  }

  return 'other';
};

const formatFileSize = (size) => {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const createFileManagerModule = ({ userDataPath, getMainWindow, activityLog }) => {
  const indexPath = path.join(userDataPath, 'vault-files.json');
  const foldersPath = path.join(userDataPath, 'vault-folders.json');
  const storageDir = path.join(userDataPath, 'vault-files');

  const ensureStorageDir = () => {
    fs.mkdirSync(storageDir, { recursive: true });
  };

  const loadIndex = () => {
    if (!fs.existsSync(indexPath)) {
      return [];
    }

    try {
      const items = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error('[vault-files] 读取索引失败:', error.message);
      return [];
    }
  };

  const loadFolders = () => {
    if (!fs.existsSync(foldersPath)) {
      return [];
    }

    try {
      const items = JSON.parse(fs.readFileSync(foldersPath, 'utf8'));
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error('[vault-folders] 读取失败:', error.message);
      return [];
    }
  };

  const saveIndex = (items) => {
    ensureStorageDir();
    fs.writeFileSync(indexPath, JSON.stringify(items, null, 2));
  };

  const saveFolders = (folders) => {
    ensureStorageDir();
    fs.writeFileSync(foldersPath, JSON.stringify(folders, null, 2));
  };

  const broadcastChange = () => {
    getMainWindow()?.webContents.send('vaultFiles:changed', getState());
  };

  const normalizeFolderId = (folderId) => folderId || null;

  const normalizeItem = (item) => ({
    id: item.id,
    name: String(item.name || '').trim(),
    originalName: String(item.originalName || item.name || '').trim(),
    storedName: item.storedName,
    mimeType: item.mimeType || guessMimeType(item.originalName || item.name || ''),
    size: Number(item.size || 0),
    category: ['image', 'document', 'other'].includes(item.category) ? item.category : 'other',
    note: String(item.note || ''),
    folderId: normalizeFolderId(item.folderId),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });

  const normalizeFolder = (folder) => ({
    id: folder.id,
    name: String(folder.name || '').trim(),
    parentId: normalizeFolderId(folder.parentId),
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  });

  const listAllFiles = () =>
    loadIndex()
      .map(normalizeItem)
      .sort(
        (left, right) =>
          new Date(right.updatedAt || right.createdAt).getTime() -
          new Date(left.updatedAt || left.createdAt).getTime()
      );

  const listAllFolders = () =>
    loadFolders()
      .map(normalizeFolder)
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));

  const getState = () => ({
    files: listAllFiles(),
    folders: listAllFolders(),
  });

  const findItem = (fileId) => loadIndex().find((item) => item.id === fileId) || null;

  const findFolder = (folderId) => loadFolders().find((folder) => folder.id === folderId) || null;

  const getStoredPath = (item) => path.join(storageDir, item.storedName);

  const assertFolderExists = (folderId) => {
    if (!folderId) {
      return;
    }

    if (!findFolder(folderId)) {
      throw new Error('目标文件夹不存在');
    }
  };

  const hasDuplicateFolderName = (name, parentId, excludeId = null, folderList = null) =>
    (folderList || loadFolders()).some((folder) => {
      if (excludeId && folder.id === excludeId) {
        return false;
      }

      return (
        String(folder.name || '').trim() === name &&
        normalizeFolderId(folder.parentId) === normalizeFolderId(parentId)
      );
    });

  const resolveUniqueFolderName = (name, parentId, folderList) => {
    const baseName = String(name || '').trim() || '未命名文件夹';
    let candidate = baseName;
    let index = 2;

    while (hasDuplicateFolderName(candidate, parentId, null, folderList)) {
      candidate = `${baseName} (${index})`;
      index += 1;
    }

    return candidate;
  };

  const buildFolderRecord = (name, parentId) => {
    const now = new Date().toISOString();

    return normalizeFolder({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      parentId: parentId || null,
      createdAt: now,
      updatedAt: now,
    });
  };

  const countDirectoryFiles = (sourceDirPath, depth = 0) => {
    if (depth >= MAX_FOLDER_IMPORT_DEPTH) {
      throw new Error(`文件夹层级超过 ${MAX_FOLDER_IMPORT_DEPTH} 层限制`);
    }

    let count = 0;
    const entries = fs.readdirSync(sourceDirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_FILE_NAMES.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(sourceDirPath, entry.name);

      if (entry.isDirectory()) {
        count += countDirectoryFiles(fullPath, depth + 1);
        continue;
      }

      if (entry.isFile()) {
        count += 1;
      }
    }

    return count;
  };

  const assertDirectoryImportable = (sourceDirPath) => {
    const fileCount = countDirectoryFiles(sourceDirPath);

    if (fileCount > MAX_FOLDER_IMPORT_FILES) {
      throw new Error(`文件夹文件超过 ${MAX_FOLDER_IMPORT_FILES} 个，无法导入`);
    }

    return fileCount;
  };

  const importDirectoryFromPath = (sourceDirPath, parentVaultFolderId, workingFolders, counters) => {
    if (counters.depth >= MAX_FOLDER_IMPORT_DEPTH) {
      throw new Error(`文件夹层级超过 ${MAX_FOLDER_IMPORT_DEPTH} 层限制`);
    }

    const baseName = path.basename(sourceDirPath);
    const folderName = resolveUniqueFolderName(baseName, parentVaultFolderId, workingFolders);
    const folder = buildFolderRecord(folderName, parentVaultFolderId);
    workingFolders.push(folder);

    const newItems = [];
    const errors = [];
    let entries = [];

    try {
      entries = fs.readdirSync(sourceDirPath, { withFileTypes: true });
    } catch (error) {
      errors.push(`${baseName}：无法读取目录（${error.message}）`);
      return { items: newItems, errors, rootFolder: folder };
    }

    for (const entry of entries) {
      if (SKIP_FILE_NAMES.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(sourceDirPath, entry.name);

      if (entry.isDirectory()) {
        counters.depth += 1;

        try {
          const nested = importDirectoryFromPath(fullPath, folder.id, workingFolders, counters);
          newItems.push(...nested.items);
          errors.push(...nested.errors);
        } catch (error) {
          errors.push(`${entry.name}：${error.message}`);
        } finally {
          counters.depth -= 1;
        }

        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const stats = fs.statSync(fullPath);

        if (stats.size > MAX_FILE_SIZE_BYTES) {
          throw new Error(`单个文件不能超过 ${formatFileSize(MAX_FILE_SIZE_BYTES)}`);
        }

        const item = buildFileItem(entry.name, stats.size, { folderId: folder.id });
        ensureStorageDir();
        fs.copyFileSync(fullPath, path.join(storageDir, item.storedName));
        newItems.push(item);
      } catch (error) {
        errors.push(`${entry.name}：${error.message}`);
      }
    }

    return { items: newItems, errors, rootFolder: folder };
  };

  const collectDescendantFolderIds = (folderId) => {
    const ids = [folderId];
    loadFolders()
      .filter((folder) => normalizeFolderId(folder.parentId) === folderId)
      .forEach((folder) => {
        ids.push(...collectDescendantFolderIds(folder.id));
      });
    return ids;
  };

  const buildFileItem = (originalName, size, options = {}) => {
    const now = new Date().toISOString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storedName = `${id}${path.extname(originalName)}`;
    const mimeType = guessMimeType(originalName);

    return normalizeItem({
      id,
      name: options.name || originalName,
      originalName,
      storedName,
      mimeType,
      size,
      category: detectCategory(originalName, mimeType),
      note: options.note || '',
      folderId: options.folderId || null,
      createdAt: now,
      updatedAt: now,
    });
  };

  const persistNewItems = (newItems) => {
    if (!newItems.length) {
      return;
    }

    saveIndex([...newItems, ...loadIndex()]);
    broadcastChange();

    newItems.forEach((item) => {
      activityLog?.appendLog({
        category: 'vault',
        action: 'add',
        title: '添加文件',
        summary: item.name,
        detail: {
          fileId: item.id,
          size: item.size,
          category: item.category,
          folderId: item.folderId,
        },
      });
    });
  };

  const addFileFromPath = (sourcePath, options = {}) => {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error('文件不存在');
    }

    const stats = fs.statSync(sourcePath);
    if (!stats.isFile()) {
      throw new Error('不支持文件夹');
    }

    if (stats.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`单个文件不能超过 ${formatFileSize(MAX_FILE_SIZE_BYTES)}`);
    }

    assertFolderExists(options.folderId);

    const originalName = path.basename(sourcePath);
    const item = buildFileItem(originalName, stats.size, options);

    ensureStorageDir();
    fs.copyFileSync(sourcePath, path.join(storageDir, item.storedName));
    persistNewItems([item]);

    return item;
  };

  const addFileFromBuffer = (fileName, data, options = {}) => {
    assertFolderExists(options.folderId);

    const originalName = path.basename(String(fileName || '').trim() || '未命名文件');
    const buffer = Buffer.from(data);

    if (!buffer.length) {
      throw new Error('文件内容为空');
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(`单个文件不能超过 ${formatFileSize(MAX_FILE_SIZE_BYTES)}`);
    }

    const item = buildFileItem(originalName, buffer.length, options);

    ensureStorageDir();
    fs.writeFileSync(path.join(storageDir, item.storedName), buffer);
    persistNewItems([item]);

    return item;
  };

  const addFilesFromDrop = ({ paths = [], buffers = [], folderId = null }) => {
    assertFolderExists(folderId);

    const newItems = [];
    const errors = [];
    const workingFolders = [...loadFolders()];
    const initialFolderCount = workingFolders.length;
    const importedFolderNames = [];
    const importCounters = { depth: 0 };

    paths.forEach((sourcePath) => {
      const label = path.basename(sourcePath || '未知文件');

      try {
        if (!sourcePath || !fs.existsSync(sourcePath)) {
          throw new Error('路径不存在');
        }

        const stats = fs.statSync(sourcePath);

        if (stats.isDirectory()) {
          assertDirectoryImportable(sourcePath);

          const result = importDirectoryFromPath(
            sourcePath,
            folderId,
            workingFolders,
            importCounters
          );
          newItems.push(...result.items);
          errors.push(...result.errors);

          if (result.rootFolder) {
            importedFolderNames.push(result.rootFolder.name);
          }

          return;
        }

        if (!stats.isFile()) {
          throw new Error('不支持的类型');
        }

        if (stats.size > MAX_FILE_SIZE_BYTES) {
          throw new Error(`单个文件不能超过 ${formatFileSize(MAX_FILE_SIZE_BYTES)}`);
        }

        const item = buildFileItem(path.basename(sourcePath), stats.size, { folderId });
        ensureStorageDir();
        fs.copyFileSync(sourcePath, path.join(storageDir, item.storedName));
        newItems.push(item);
      } catch (error) {
        errors.push(`${label}：${error.message}`);
      }
    });

    buffers.forEach(({ name, data }) => {
      const label = path.basename(String(name || '').trim() || '未命名文件');

      try {
        const buffer = Buffer.from(data);

        if (!buffer.length) {
          throw new Error('文件内容为空');
        }

        if (buffer.length > MAX_FILE_SIZE_BYTES) {
          throw new Error(`单个文件不能超过 ${formatFileSize(MAX_FILE_SIZE_BYTES)}`);
        }

        const item = buildFileItem(label, buffer.length, { folderId });
        ensureStorageDir();
        fs.writeFileSync(path.join(storageDir, item.storedName), buffer);
        newItems.push(item);
      } catch (error) {
        errors.push(`${label}：${error.message}`);
      }
    });

    const importedFolderCount = workingFolders.length - initialFolderCount;

    if (importedFolderCount > 0) {
      saveFolders(workingFolders);

      activityLog?.appendLog({
        category: 'vault',
        action: 'import-folder',
        title: '导入文件夹',
        summary: importedFolderNames.join('、') || '文件夹',
        detail: {
          parentFolderId: folderId,
          importedFolderCount,
          importedFileCount: newItems.length,
        },
      });
    }

    persistNewItems(newItems);

    if (importedFolderCount > 0 && !newItems.length) {
      broadcastChange();
    }

    return { items: newItems, errors, importedFolderCount };
  };

  const addFilesFromPaths = (filePaths = [], options = {}) => {
    const items = [];
    const errors = [];

    filePaths.forEach((sourcePath) => {
      try {
        items.push(addFileFromPath(sourcePath, options));
      } catch (error) {
        errors.push(`${path.basename(sourcePath)}：${error.message}`);
      }
    });

    return { items, errors };
  };

  const importFoldersFromPaths = (dirPaths = [], folderId = null) => {
    assertFolderExists(folderId);

    const workingFolders = [...loadFolders()];
    const initialFolderCount = workingFolders.length;
    const newItems = [];
    const errors = [];
    const importedFolderNames = [];
    const importCounters = { depth: 0 };

    dirPaths.forEach((sourcePath) => {
      const label = path.basename(sourcePath || '未知文件夹');

      try {
        if (!sourcePath || !fs.existsSync(sourcePath)) {
          throw new Error('路径不存在');
        }

        const stats = fs.statSync(sourcePath);
        if (!stats.isDirectory()) {
          throw new Error('请选择文件夹');
        }

        assertDirectoryImportable(sourcePath);

        const result = importDirectoryFromPath(
          sourcePath,
          folderId,
          workingFolders,
          importCounters
        );
        newItems.push(...result.items);
        errors.push(...result.errors);

        if (result.rootFolder) {
          importedFolderNames.push(result.rootFolder.name);
        }
      } catch (error) {
        errors.push(`${label}：${error.message}`);
      }
    });

    const importedFolderCount = workingFolders.length - initialFolderCount;

    if (importedFolderCount > 0) {
      saveFolders(workingFolders);

      activityLog?.appendLog({
        category: 'vault',
        action: 'import-folder',
        title: '导入文件夹',
        summary: importedFolderNames.join('、') || '文件夹',
        detail: {
          parentFolderId: folderId,
          importedFolderCount,
          importedFileCount: newItems.length,
        },
      });
    }

    persistNewItems(newItems);

    if (importedFolderCount > 0 && !newItems.length) {
      broadcastChange();
    }

    return { items: newItems, errors, importedFolderCount };
  };

  const pickAndImportFolder = async (folderId = null) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择要导入的文件夹',
      properties: ['openDirectory', 'multiSelections'],
    });

    if (canceled || !filePaths?.length) {
      return { canceled: true, items: [], errors: [], importedFolderCount: 0 };
    }

    return {
      canceled: false,
      ...importFoldersFromPaths(filePaths, folderId),
    };
  };

  const pickAndAddFiles = async (folderId = null) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择要保存的文件',
      properties: ['openFile', 'multiSelections'],
    });

    if (canceled || !filePaths?.length) {
      return { canceled: true, items: [], errors: [] };
    }

    return {
      canceled: false,
      ...addFilesFromPaths(filePaths, { folderId }),
    };
  };

  const createFolder = ({ name, parentId = null }) => {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      throw new Error('文件夹名称不能为空');
    }

    assertFolderExists(parentId);

    if (hasDuplicateFolderName(normalizedName, parentId)) {
      throw new Error('同一目录下已存在同名文件夹');
    }

    const now = new Date().toISOString();
    const folder = normalizeFolder({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: normalizedName,
      parentId: parentId || null,
      createdAt: now,
      updatedAt: now,
    });

    saveFolders([folder, ...loadFolders()]);
    broadcastChange();

    activityLog?.appendLog({
      category: 'vault',
      action: 'create-folder',
      title: '新建文件夹',
      summary: folder.name,
      detail: { folderId: folder.id, parentId: folder.parentId },
    });

    return folder;
  };

  const updateFolder = (folderId, payload = {}) => {
    let updatedFolder = null;
    const nextName = payload.name !== undefined ? String(payload.name || '').trim() : undefined;

    const folders = loadFolders().map((folder) => {
      if (folder.id !== folderId) {
        return folder;
      }

      const name = nextName ?? folder.name;
      if (!name) {
        throw new Error('文件夹名称不能为空');
      }

      if (hasDuplicateFolderName(name, folder.parentId, folderId)) {
        throw new Error('同一目录下已存在同名文件夹');
      }

      updatedFolder = normalizeFolder({
        ...folder,
        name,
        updatedAt: new Date().toISOString(),
      });

      return updatedFolder;
    });

    if (!updatedFolder) {
      throw new Error('文件夹不存在');
    }

    saveFolders(folders);
    broadcastChange();

    activityLog?.appendLog({
      category: 'vault',
      action: 'update-folder',
      title: '更新文件夹',
      summary: updatedFolder.name,
      detail: { folderId: updatedFolder.id },
    });

    return updatedFolder;
  };

  const deleteFolder = (folderId) => {
    const target = findFolder(folderId);
    if (!target) {
      throw new Error('文件夹不存在');
    }

    const folderIds = collectDescendantFolderIds(folderId);
    const filesToDelete = loadIndex().filter((item) => folderIds.includes(normalizeFolderId(item.folderId)));

    filesToDelete.forEach((item) => {
      const storedPath = getStoredPath(item);
      if (fs.existsSync(storedPath)) {
        fs.unlinkSync(storedPath);
      }
    });

    saveIndex(loadIndex().filter((item) => !folderIds.includes(normalizeFolderId(item.folderId))));
    saveFolders(loadFolders().filter((folder) => !folderIds.includes(folder.id)));
    broadcastChange();

    activityLog?.appendLog({
      category: 'vault',
      action: 'delete-folder',
      title: '删除文件夹',
      summary: target.name,
      detail: { folderId, removedFileCount: filesToDelete.length },
    });

    return true;
  };

  const updateFileMeta = (fileId, payload = {}) => {
    let updatedItem = null;

    if (payload.folderId !== undefined) {
      assertFolderExists(payload.folderId);
    }

    const items = loadIndex().map((item) => {
      if (item.id !== fileId) {
        return item;
      }

      updatedItem = normalizeItem({
        ...item,
        name: payload.name ?? item.name,
        note: payload.note ?? item.note,
        folderId: payload.folderId !== undefined ? payload.folderId : item.folderId,
        updatedAt: new Date().toISOString(),
      });

      return updatedItem;
    });

    if (!updatedItem) {
      throw new Error('文件不存在');
    }

    saveIndex(items);
    broadcastChange();

    activityLog?.appendLog({
      category: 'vault',
      action: 'update',
      title: '更新文件信息',
      summary: updatedItem.name,
      detail: { fileId: updatedItem.id, folderId: updatedItem.folderId },
    });

    return updatedItem;
  };

  const deleteFile = (fileId) => {
    const items = loadIndex();
    const target = items.find((item) => item.id === fileId);
    if (!target) {
      throw new Error('文件不存在');
    }

    const storedPath = getStoredPath(target);
    if (fs.existsSync(storedPath)) {
      fs.unlinkSync(storedPath);
    }

    saveIndex(items.filter((item) => item.id !== fileId));
    broadcastChange();

    activityLog?.appendLog({
      category: 'vault',
      action: 'delete',
      title: '删除文件',
      summary: target.name,
      detail: { fileId },
    });

    return true;
  };

  const openFile = async (fileId) => {
    const item = findItem(fileId);
    if (!item) {
      throw new Error('文件不存在');
    }

    const storedPath = getStoredPath(item);
    if (!fs.existsSync(storedPath)) {
      throw new Error('文件内容已丢失');
    }

    const result = await shell.openPath(storedPath);
    if (result) {
      throw new Error(result);
    }

    return true;
  };

  const revealFile = async (fileId) => {
    const item = findItem(fileId);
    if (!item) {
      throw new Error('文件不存在');
    }

    const storedPath = getStoredPath(item);
    if (!fs.existsSync(storedPath)) {
      throw new Error('文件内容已丢失');
    }

    shell.showItemInFolder(storedPath);
    return true;
  };

  const getPreviewDataUrl = (fileId) => {
    const item = findItem(fileId);
    if (!item) {
      return null;
    }

    if (!item.mimeType.startsWith('image/') || item.size > PREVIEW_MAX_BYTES) {
      return null;
    }

    const storedPath = getStoredPath(item);
    if (!fs.existsSync(storedPath)) {
      return null;
    }

    const buffer = fs.readFileSync(storedPath);
    return `data:${item.mimeType};base64,${buffer.toString('base64')}`;
  };

  const exportSnapshot = () => ({
    folders: listAllFolders(),
    files: listAllFiles().map((item) => {
      const storedPath = getStoredPath(item);
      const payload = { ...item };

      if (fs.existsSync(storedPath)) {
        payload.dataBase64 = fs.readFileSync(storedPath).toString('base64');
      }

      return payload;
    }),
  });

  const importSnapshot = (payload = []) => {
    const normalizedPayload = Array.isArray(payload) ? { files: payload, folders: [] } : payload || {};
    const folders = Array.isArray(normalizedPayload.folders) ? normalizedPayload.folders : [];
    const files = Array.isArray(normalizedPayload.files) ? normalizedPayload.files : [];

    ensureStorageDir();

    if (fs.existsSync(storageDir)) {
      fs.readdirSync(storageDir).forEach((fileName) => {
        fs.unlinkSync(path.join(storageDir, fileName));
      });
    } else {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const restoredFiles = [];

    files.forEach((entry) => {
      if (!entry?.id || !entry?.storedName || !entry?.dataBase64) {
        return;
      }

      const item = normalizeItem(entry);
      const storedPath = path.join(storageDir, item.storedName);
      fs.writeFileSync(storedPath, Buffer.from(entry.dataBase64, 'base64'));
      restoredFiles.push(item);
    });

    saveFolders(folders.map(normalizeFolder));
    saveIndex(restoredFiles);
    broadcastChange();
    return getState();
  };

  const resetAll = () => {
    if (fs.existsSync(storageDir)) {
      fs.readdirSync(storageDir).forEach((fileName) => {
        fs.unlinkSync(path.join(storageDir, fileName));
      });
    }

    if (fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }

    if (fs.existsSync(foldersPath)) {
      fs.unlinkSync(foldersPath);
    }

    getMainWindow()?.webContents.send('vaultFiles:changed', { files: [], folders: [] });
  };

  return {
    getState,
    listFiles: getState,
    pickAndAddFiles,
    pickAndImportFolder,
    importFoldersFromPaths,
    addFilesFromPaths,
    addFilesFromDrop,
    createFolder,
    updateFolder,
    deleteFolder,
    updateFileMeta,
    deleteFile,
    openFile,
    revealFile,
    getPreviewDataUrl,
    exportSnapshot,
    importSnapshot,
    resetAll,
    formatFileSize,
  };
};

module.exports = { createFileManagerModule, formatFileSize };
