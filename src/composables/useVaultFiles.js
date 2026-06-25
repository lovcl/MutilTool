import { ref } from 'vue';

const electronAPI = window.electronAPI;

export const VAULT_CATEGORY_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'document', label: '文档' },
  { value: 'other', label: '其他' },
];

export const vaultFiles = ref([]);
export const vaultFolders = ref([]);
const previewCache = new Map();
let initialized = false;

export const getVaultCategoryLabel = (category) => {
  if (category === 'image') {
    return '图片';
  }

  if (category === 'document') {
    return '文档';
  }

  return '其他';
};

export const formatVaultFileSize = (size) => {
  const value = Number(size || 0);
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const applyVaultState = (state) => {
  if (Array.isArray(state)) {
    vaultFiles.value = state;
    vaultFolders.value = [];
    return;
  }

  vaultFiles.value = Array.isArray(state?.files) ? state.files : [];
  vaultFolders.value = Array.isArray(state?.folders) ? state.folders : [];
};

export const hydrateVaultFiles = async () => {
  if (electronAPI?.vaultFiles?.getAll) {
    applyVaultState(await electronAPI.vaultFiles.getAll());
    previewCache.clear();
    return;
  }

  vaultFiles.value = JSON.parse(localStorage.getItem('vault-files') || '[]');
  vaultFolders.value = JSON.parse(localStorage.getItem('vault-folders') || '[]');
};

const persistFallbackVaultState = () => {
  if (!electronAPI?.vaultFiles) {
    localStorage.setItem('vault-files', JSON.stringify(vaultFiles.value));
    localStorage.setItem('vault-folders', JSON.stringify(vaultFolders.value));
  }
};

const refreshVaultState = async () => {
  if (electronAPI?.vaultFiles?.getAll) {
    applyVaultState(await electronAPI.vaultFiles.getAll());
    previewCache.clear();
    return;
  }

  persistFallbackVaultState();
};

export function useVaultFiles() {
  if (!initialized) {
    hydrateVaultFiles();
    initialized = true;
  }

  const isDesktopVault = Boolean(electronAPI?.vaultFiles);

  const syncVaultState = (state) => {
    applyVaultState(state);
    previewCache.clear();
    persistFallbackVaultState();
  };

  const pickAndAddFiles = async (folderId = null) => {
    if (!electronAPI?.vaultFiles?.pickAndAdd) {
      return { ok: false, message: '当前环境不支持文件管理，请使用桌面版应用' };
    }

    const result = await electronAPI.vaultFiles.pickAndAdd(folderId);
    if (result.canceled) {
      return { ok: false, canceled: true };
    }

    if (result.items?.length) {
      await refreshVaultState();
    }

    return {
      ok: true,
      addedCount: result.items?.length || 0,
      errors: result.errors || [],
    };
  };

  const addFilesFromPaths = async (filePaths, folderId = null) => {
    if (!electronAPI?.vaultFiles?.addFromPaths) {
      return { ok: false, message: '当前环境不支持文件管理，请使用桌面版应用' };
    }

    const result = await electronAPI.vaultFiles.addFromPaths({
      filePaths,
      folderId,
    });

    if (result.items?.length) {
      await refreshVaultState();
    }

    return {
      ok: true,
      addedCount: result.items?.length || 0,
      errors: result.errors || [],
    };
  };

  const pickAndImportFolder = async (folderId = null) => {
    if (!electronAPI?.vaultFiles?.pickAndImportFolder) {
      return { ok: false, message: '当前环境不支持文件管理，请使用桌面版应用' };
    }

    const result = await electronAPI.vaultFiles.pickAndImportFolder(folderId);
    if (result.canceled) {
      return { ok: false, canceled: true };
    }

    if (result.items?.length || result.importedFolderCount) {
      await refreshVaultState();
    }

    return {
      ok: true,
      addedCount: result.items?.length || 0,
      importedFolderCount: result.importedFolderCount || 0,
      errors: result.errors || [],
    };
  };

  const collectDropPayload = async (input) => {
    const fileList = [];
    const dataTransfer = input?.dataTransfer;

    if (dataTransfer) {
      fileList.push(...(dataTransfer.files || []));

      if (!fileList.length) {
        for (const item of dataTransfer.items || []) {
          if (item.kind !== 'file') {
            continue;
          }

          const file = item.getAsFile();
          if (file) {
            fileList.push(file);
          }
        }
      }
    } else if (Array.isArray(input)) {
      fileList.push(...input);
    } else if (input) {
      fileList.push(input);
    }

    const paths = [];
    const pathSet = new Set();
    const buffers = [];

    for (const file of fileList) {
      const filePath = electronAPI.getPathForFile?.(file) || file.path || '';

      if (filePath && !pathSet.has(filePath)) {
        pathSet.add(filePath);
        paths.push(filePath);
      }
    }

    for (const file of fileList) {
      const filePath = electronAPI.getPathForFile?.(file) || file.path || '';
      if (filePath) {
        continue;
      }

      if (!file?.name) {
        continue;
      }

      const data = Array.from(new Uint8Array(await file.arrayBuffer()));
      if (data.length) {
        buffers.push({ name: file.name, data });
      }
    }

    return { paths, buffers };
  };

  const addFilesFromDrop = async (input, folderId = null) => {
    if (!electronAPI?.vaultFiles?.addFromDrop) {
      return { ok: false, message: '当前环境不支持文件管理，请使用桌面版应用' };
    }

    const { paths, buffers } = await collectDropPayload(input);

    if (!paths.length && !buffers.length) {
      return {
        ok: false,
        message: '无法读取拖拽内容，请拖拽文件或文件夹',
      };
    }

    const result = await electronAPI.vaultFiles.addFromDrop({
      paths,
      buffers,
      folderId,
    });

    if (result.items?.length || result.importedFolderCount) {
      await refreshVaultState();
    }

    return {
      ok: true,
      addedCount: result.items?.length || 0,
      importedFolderCount: result.importedFolderCount || 0,
      errors: result.errors || [],
    };
  };

  const createVaultFolder = async (payload) => {
    if (electronAPI?.vaultFiles?.createFolder) {
      await electronAPI.vaultFiles.createFolder(payload);
      await refreshVaultState();
      return;
    }

    const now = new Date().toISOString();
    vaultFolders.value = [
      {
        id: `${Date.now()}`,
        name: payload.name,
        parentId: payload.parentId || null,
        createdAt: now,
        updatedAt: now,
      },
      ...vaultFolders.value,
    ];
    persistFallbackVaultState();
  };

  const updateVaultFolder = async (folderId, payload) => {
    if (electronAPI?.vaultFiles?.updateFolder) {
      await electronAPI.vaultFiles.updateFolder(folderId, payload);
      await refreshVaultState();
      return;
    }

    vaultFolders.value = vaultFolders.value.map((folder) =>
      folder.id === folderId
        ? { ...folder, ...payload, updatedAt: new Date().toISOString() }
        : folder
    );
    persistFallbackVaultState();
  };

  const deleteVaultFolder = async (folderId) => {
    if (electronAPI?.vaultFiles?.deleteFolder) {
      await electronAPI.vaultFiles.deleteFolder(folderId);
      await refreshVaultState();
      return;
    }

    vaultFolders.value = vaultFolders.value.filter((folder) => folder.id !== folderId);
    vaultFiles.value = vaultFiles.value.filter((file) => file.folderId !== folderId);
    persistFallbackVaultState();
  };

  const updateVaultFile = async (fileId, payload) => {
    if (electronAPI?.vaultFiles?.update) {
      const item = await electronAPI.vaultFiles.update(fileId, payload);
      vaultFiles.value = vaultFiles.value.map((entry) => (entry.id === fileId ? item : entry));
      return item;
    }

    vaultFiles.value = vaultFiles.value.map((entry) =>
      entry.id === fileId
        ? { ...entry, ...payload, updatedAt: new Date().toISOString() }
        : entry
    );
    persistFallbackVaultState();
    return vaultFiles.value.find((entry) => entry.id === fileId) || null;
  };

  const deleteVaultFile = async (fileId) => {
    if (electronAPI?.vaultFiles?.delete) {
      await electronAPI.vaultFiles.delete(fileId);
    }

    vaultFiles.value = vaultFiles.value.filter((entry) => entry.id !== fileId);
    previewCache.delete(fileId);
    persistFallbackVaultState();
  };

  const openVaultFile = async (fileId) => {
    if (!electronAPI?.vaultFiles?.open) {
      return { ok: false, message: '当前环境不支持打开文件' };
    }

    try {
      await electronAPI.vaultFiles.open(fileId);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message || '打开文件失败' };
    }
  };

  const revealVaultFile = async (fileId) => {
    if (!electronAPI?.vaultFiles?.reveal) {
      return { ok: false, message: '当前环境不支持定位文件' };
    }

    try {
      await electronAPI.vaultFiles.reveal(fileId);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message || '定位文件失败' };
    }
  };

  const getVaultPreview = async (fileId) => {
    if (previewCache.has(fileId)) {
      return previewCache.get(fileId);
    }

    if (!electronAPI?.vaultFiles?.getPreview) {
      return null;
    }

    const dataUrl = await electronAPI.vaultFiles.getPreview(fileId);
    if (dataUrl) {
      previewCache.set(fileId, dataUrl);
    }

    return dataUrl;
  };

  const onVaultFilesChanged = (callback) => electronAPI?.vaultFiles?.onChanged(callback) || null;

  return {
    vaultFiles,
    vaultFolders,
    isDesktopVault,
    refreshVaultFiles: hydrateVaultFiles,
    syncVaultState,
    pickAndAddFiles,
    pickAndImportFolder,
    addFilesFromPaths,
    addFilesFromDrop,
    createVaultFolder,
    updateVaultFolder,
    deleteVaultFolder,
    updateVaultFile,
    deleteVaultFile,
    openVaultFile,
    revealVaultFile,
    getVaultPreview,
    onVaultFilesChanged,
  };
};
