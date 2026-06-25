<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Document,
  Folder,
  FolderAdd,
  FolderOpened,
  Picture,
  Plus,
  Upload,
} from '@element-plus/icons-vue';
import {
  formatVaultFileSize,
  getVaultCategoryLabel,
  useVaultFiles,
  VAULT_CATEGORY_OPTIONS,
} from '../composables/useVaultFiles';

const searchKeyword = ref('');
const categoryFilter = ref('all');
const currentFolderId = ref(null);
const dialogVisible = ref(false);
const folderDialogVisible = ref(false);
const renameFolderDialogVisible = ref(false);
const previewVisible = ref(false);
const editingFileId = ref(null);
const editingFolderId = ref(null);
const previewFile = ref(null);
const previewDataUrl = ref('');
const previewLoading = ref(false);
const uploadLoading = ref(false);
const isDragOver = ref(false);
const dragDepth = ref(0);
const dragOverFolderId = ref(null);
const folderDragDepth = ref(0);
const previewUrls = ref({});
const storagePaths = ref(null);

const {
  vaultFiles,
  vaultFolders,
  isDesktopVault,
  refreshVaultFiles,
  syncVaultState,
  pickAndAddFiles,
  pickAndImportFolder,
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
} = useVaultFiles();

const emptyForm = () => ({
  name: '',
  note: '',
  folderId: null,
});

const fileForm = ref(emptyForm());
const folderForm = ref({ name: '' });
const renameFolderForm = ref({ name: '' });

const buildFolderPath = (folderId) => {
  const segments = [];
  let cursor = folderId;

  while (cursor) {
    const folder = vaultFolders.value.find((item) => item.id === cursor);
    if (!folder) {
      break;
    }

    segments.unshift(folder.name);
    cursor = folder.parentId || null;
  }

  return segments.join(' / ') || '根目录';
};

const childFolders = computed(() =>
  vaultFolders.value.filter(
    (folder) => (folder.parentId || null) === (currentFolderId.value || null)
  )
);

const isSearching = computed(() => Boolean(searchKeyword.value.trim()));

const filesInCurrentFolder = computed(() =>
  vaultFiles.value.filter(
    (file) => (file.folderId || null) === (currentFolderId.value || null)
  )
);

const matchesKeyword = (file, keyword) =>
  file.name.toLowerCase().includes(keyword) ||
  (file.note || '').toLowerCase().includes(keyword) ||
  (file.originalName || '').toLowerCase().includes(keyword);

const filteredFiles = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const sourceFiles = isSearching.value ? vaultFiles.value : filesInCurrentFolder.value;

  return sourceFiles.filter((file) => {
    if (categoryFilter.value !== 'all' && file.category !== categoryFilter.value) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return matchesKeyword(file, keyword);
  });
});

const visibleFolders = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();

  if (!keyword) {
    return childFolders.value;
  }

  return vaultFolders.value.filter((folder) => folder.name.toLowerCase().includes(keyword));
});

const imageFiles = computed(() => filteredFiles.value.filter((file) => file.category === 'image'));
const otherFiles = computed(() => filteredFiles.value.filter((file) => file.category !== 'image'));

const breadcrumbItems = computed(() => {
  const items = [{ id: null, name: '全部文件' }];
  if (!currentFolderId.value) {
    return items;
  }

  const chain = [];
  let cursor = currentFolderId.value;

  while (cursor) {
    const folder = vaultFolders.value.find((item) => item.id === cursor);
    if (!folder) {
      break;
    }

    chain.unshift({ id: folder.id, name: folder.name });
    cursor = folder.parentId || null;
  }

  return [...items, ...chain];
});

const folderSelectOptions = computed(() => [
  { value: null, label: '根目录' },
  ...vaultFolders.value.map((folder) => ({
    value: folder.id,
    label: buildFolderPath(folder.id),
  })),
]);

const stats = computed(() => ({
  total: vaultFiles.value.length,
  folders: vaultFolders.value.length,
  images: vaultFiles.value.filter((file) => file.category === 'image').length,
  totalSize: vaultFiles.value.reduce((sum, file) => sum + Number(file.size || 0), 0),
}));

const isCurrentFolderEmpty = computed(
  () => !visibleFolders.value.length && !filteredFiles.value.length
);

const openFolderFromSearch = (folderId) => {
  searchKeyword.value = '';
  openFolder(folderId);
};

const loadPreviewUrls = async () => {
  if (!isDesktopVault) {
    return;
  }

  const next = { ...previewUrls.value };

  await Promise.all(
    imageFiles.value.map(async (file) => {
      if (next[file.id]) {
        return;
      }

      const dataUrl = await getVaultPreview(file.id);
      if (dataUrl) {
        next[file.id] = dataUrl;
      }
    })
  );

  previewUrls.value = next;
};

const formatImportFailureMessage = (errors = []) => {
  if (!errors.length) {
    return '导入失败';
  }

  return errors[0];
};

const handleImportResult = async (result, emptyMessage = '未选择内容') => {
  if (result.canceled) {
    return;
  }

  if (!result.ok) {
    ElMessage.error(result.message || '导入失败');
    return;
  }

  const hasImported = result.addedCount > 0 || result.importedFolderCount > 0;

  if (!hasImported && result.errors?.length) {
    ElMessage.error(formatImportFailureMessage(result.errors));
    return;
  }

  if (hasImported) {
    const parts = [];

    if (result.importedFolderCount > 0) {
      parts.push(`${result.importedFolderCount} 个文件夹`);
    }

    if (result.addedCount > 0) {
      parts.push(`${result.addedCount} 个文件`);
    }

    ElMessage.success(`已导入 ${parts.join('、')}`);
    await loadPreviewUrls();
  }

  if (result.errors?.length) {
    ElMessage.warning(result.errors.join('；'));
  }

  if (!hasImported && !result.errors?.length) {
    ElMessage.info(emptyMessage);
  }
};

const handleUpload = async () => {
  uploadLoading.value = true;
  try {
    await handleImportResult(await pickAndAddFiles(currentFolderId.value), '未选择文件');
  } finally {
    uploadLoading.value = false;
  }
};

const handleFolderImport = async () => {
  uploadLoading.value = true;
  try {
    await handleImportResult(await pickAndImportFolder(currentFolderId.value), '未选择文件夹');
  } finally {
    uploadLoading.value = false;
  }
};

const resetDragState = () => {
  dragDepth.value = 0;
  folderDragDepth.value = 0;
  isDragOver.value = false;
  dragOverFolderId.value = null;
};

const processFileDrop = async (event, folderId) => {
  resetDragState();

  if (!isDesktopVault) {
    return;
  }

  uploadLoading.value = true;
  try {
    const result = await addFilesFromDrop(event, folderId);

    if (!result.ok) {
      ElMessage.error(result.message || '保存失败');
      return;
    }

    const hasImported = result.addedCount > 0 || result.importedFolderCount > 0;

    if (!hasImported && result.errors?.length) {
      ElMessage.error(formatImportFailureMessage(result.errors));
      return;
    }

    if (hasImported) {
      const folder = vaultFolders.value.find((item) => item.id === folderId);
      const parts = [];

      if (result.importedFolderCount > 0) {
        parts.push(`${result.importedFolderCount} 个文件夹`);
      }

      if (result.addedCount > 0) {
        parts.push(`${result.addedCount} 个文件`);
      }

      const summary = parts.join('、');
      ElMessage.success(
        folder ? `已导入 ${summary} 到「${folder.name}」` : `已导入 ${summary}`
      );
      await loadPreviewUrls();
    }

    if (result.errors?.length) {
      ElMessage.warning(result.errors.join('；'));
    }
  } finally {
    uploadLoading.value = false;
  }
};

const onDragEnter = () => {
  if (!isDesktopVault) {
    return;
  }

  dragDepth.value += 1;
  if (!dragOverFolderId.value) {
    isDragOver.value = true;
  }
};

const onDragLeave = () => {
  dragDepth.value = Math.max(0, dragDepth.value - 1);
  if (dragDepth.value === 0 && !dragOverFolderId.value) {
    isDragOver.value = false;
  }
};

const onDrop = async (event) => {
  if (dragOverFolderId.value) {
    return;
  }

  await processFileDrop(event, currentFolderId.value);
};

const onFolderDragEnter = (folderId, event) => {
  event.stopPropagation();
  folderDragDepth.value += 1;
  dragOverFolderId.value = folderId;
  isDragOver.value = false;
};

const onFolderDragLeave = (event) => {
  event.stopPropagation();
  folderDragDepth.value = Math.max(0, folderDragDepth.value - 1);
  if (folderDragDepth.value === 0) {
    dragOverFolderId.value = null;
  }
};

const onFolderDrop = async (folderId, event) => {
  event.stopPropagation();
  await processFileDrop(event, folderId);
};

const openFolder = (folderId) => {
  currentFolderId.value = folderId;
  categoryFilter.value = 'all';
};

const openCreateFolderDialog = () => {
  folderForm.value = { name: '' };
  folderDialogVisible.value = true;
};

const saveFolder = async () => {
  if (!folderForm.value.name.trim()) {
    ElMessage.warning('请填写文件夹名称');
    return;
  }

  try {
    await createVaultFolder({
      name: folderForm.value.name.trim(),
      parentId: currentFolderId.value,
    });
    ElMessage.success('文件夹已创建');
    folderDialogVisible.value = false;
  } catch (error) {
    ElMessage.warning(error.message || '创建失败');
  }
};

const openRenameFolderDialog = (folder) => {
  editingFolderId.value = folder.id;
  renameFolderForm.value = { name: folder.name };
  renameFolderDialogVisible.value = true;
};

const saveRenameFolder = async () => {
  if (!renameFolderForm.value.name.trim()) {
    ElMessage.warning('请填写文件夹名称');
    return;
  }

  try {
    await updateVaultFolder(editingFolderId.value, {
      name: renameFolderForm.value.name.trim(),
    });
    ElMessage.success('文件夹已更新');
    renameFolderDialogVisible.value = false;
  } catch (error) {
    ElMessage.warning(error.message || '更新失败');
  }
};

const handleDeleteFolder = async (folder) => {
  try {
    await ElMessageBox.confirm(
      `确定删除文件夹「${folder.name}」吗？其中的子文件夹和文件也会一并删除。`,
      '删除文件夹',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      }
    );
    await deleteVaultFolder(folder.id);
    if (currentFolderId.value === folder.id) {
      currentFolderId.value = folder.parentId || null;
    }
    ElMessage.success('文件夹已删除');
  } catch {
    // cancelled
  }
};

const openEditDialog = (file) => {
  editingFileId.value = file.id;
  fileForm.value = {
    name: file.name,
    note: file.note || '',
    folderId: file.folderId || null,
  };
  dialogVisible.value = true;
};

const saveFileMeta = async () => {
  if (!fileForm.value.name.trim()) {
    ElMessage.warning('请填写文件名称');
    return;
  }

  try {
    await updateVaultFile(editingFileId.value, {
      name: fileForm.value.name.trim(),
      note: fileForm.value.note,
      folderId: fileForm.value.folderId,
    });
    ElMessage.success('文件信息已更新');
    dialogVisible.value = false;
  } catch (error) {
    ElMessage.warning(error.message || '保存失败');
  }
};

const handleOpenFile = async (file) => {
  const result = await openVaultFile(file.id);
  if (!result.ok) {
    ElMessage.warning(result.message || '打开失败');
  }
};

const handleRevealFile = async (file) => {
  const result = await revealVaultFile(file.id);
  if (!result.ok) {
    ElMessage.warning(result.message || '定位失败');
  }
};

const openPreview = async (file) => {
  previewFile.value = file;
  previewVisible.value = true;
  previewLoading.value = true;

  try {
    previewDataUrl.value = previewUrls.value[file.id] || (await getVaultPreview(file.id)) || '';
  } finally {
    previewLoading.value = false;
  }
};

const handleDelete = async (file) => {
  try {
    await ElMessageBox.confirm(`确定删除文件「${file.name}」吗？`, '删除文件', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await deleteVaultFile(file.id);
    delete previewUrls.value[file.id];
    ElMessage.success('文件已删除');
  } catch {
    // cancelled
  }
};

const getCategoryTagType = (category) => {
  if (category === 'image') {
    return 'success';
  }

  if (category === 'document') {
    return 'warning';
  }

  return 'info';
};

const storageHint = computed(() => {
  if (!isDesktopVault) {
    return '文件管理需要在桌面版应用中使用，浏览器模式无法保存本地文件。';
  }

  const vaultDir = storagePaths.value?.vaultFilesDir;
  const baseText = vaultDir
    ? `文件会复制保存到安装目录下：${vaultDir}。`
    : '文件会复制保存到安装目录下的 app-data/vault-files 文件夹。';

  return `${baseText}支持创建文件夹、添加文件、导入文件夹，或拖拽文件/文件夹到页面保存。单个文件最大 50 MB，单次文件夹导入最多 500 个文件。`;
});

let removeVaultChangedListener = null;

onMounted(async () => {
  if (window.electronAPI?.getStoragePaths) {
    storagePaths.value = await window.electronAPI.getStoragePaths();
  }

  await refreshVaultFiles();
  await loadPreviewUrls();
  removeVaultChangedListener = onVaultFilesChanged(async (state) => {
    syncVaultState(state);
    await loadPreviewUrls();
  });
});

onBeforeUnmount(() => {
  removeVaultChangedListener?.();
});
</script>

<template>
  <section class="files-layout">
    <header class="header">
      <div>
        <p class="eyebrow">资料归档</p>
        <h2>文件管理</h2>
      </div>
      <div class="header-actions">
        <el-button
          :icon="FolderAdd"
          :disabled="!isDesktopVault"
          @click="openCreateFolderDialog"
        >
          新建文件夹
        </el-button>
        <el-button
          :icon="FolderOpened"
          :loading="uploadLoading"
          :disabled="!isDesktopVault"
          @click="handleFolderImport"
        >
          导入文件夹
        </el-button>
        <el-button
          type="primary"
          :icon="Upload"
          :loading="uploadLoading"
          :disabled="!isDesktopVault"
          @click="handleUpload"
        >
          添加文件
        </el-button>
      </div>
    </header>

    <div class="files-stats">
      <article class="summary-card work tasks-stat-card">
        <el-icon><FolderOpened /></el-icon>
        <div>
          <span>全部文件</span>
          <strong>{{ stats.total }} 个</strong>
        </div>
      </article>
      <article class="summary-card attendance tasks-stat-card">
        <el-icon><Folder /></el-icon>
        <div>
          <span>文件夹</span>
          <strong>{{ stats.folders }} 个</strong>
        </div>
      </article>
      <article class="summary-card done tasks-stat-card">
        <el-icon><Picture /></el-icon>
        <div>
          <span>图片</span>
          <strong>{{ stats.images }} 个</strong>
        </div>
      </article>
      <article class="summary-card performance tasks-stat-card">
        <el-icon><Plus /></el-icon>
        <div>
          <span>总大小</span>
          <strong>{{ formatVaultFileSize(stats.totalSize) }}</strong>
        </div>
      </article>
    </div>

    <article
      class="settings-panel files-panel"
      :class="{ 'is-dragover': isDragOver }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div v-if="isDragOver && !dragOverFolderId" class="files-drop-overlay">
        <el-icon><Upload /></el-icon>
        <strong>松开鼠标保存到当前文件夹</strong>
      </div>

      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">本地保管</p>
          <h3>我的文件</h3>
          <el-breadcrumb separator="/" class="files-breadcrumb">
            <el-breadcrumb-item v-for="item in breadcrumbItems" :key="item.id || 'root'">
              <button
                type="button"
                class="files-breadcrumb-link"
                :class="{ 'is-current': item.id === currentFolderId }"
                @click="openFolder(item.id)"
              >
                {{ item.name }}
              </button>
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="files-toolbar">
          <el-input
            v-model="searchKeyword"
            clearable
            placeholder="搜索全部文件或文件夹"
            style="width: 220px"
          />
          <el-select v-model="categoryFilter" size="large" style="width: 120px">
            <el-option
              v-for="option in VAULT_CATEGORY_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>
      </div>

      <el-alert
        v-if="!isDesktopVault"
        title="文件管理需要在桌面版应用中使用，浏览器模式无法保存本地文件。"
        type="warning"
        show-icon
        :closable="false"
      />
      <el-alert
        v-if="isDesktopVault && isSearching"
        title="正在全部文件夹中搜索，匹配的文件会显示所在位置。"
        type="success"
        show-icon
        :closable="false"
      />
      <el-alert
        v-else-if="isDesktopVault"
        :title="storageHint"
        type="info"
        show-icon
        :closable="false"
      />

      <el-empty
        v-if="isCurrentFolderEmpty"
        :description="
          isSearching
            ? '未找到匹配的文件或文件夹'
            : '当前文件夹为空，可新建文件夹、添加文件、导入文件夹，或拖拽文件/文件夹到此处'
        "
      />

      <template v-else>
        <section v-if="visibleFolders.length" class="files-section">
          <div class="files-section-head">
            <h4>{{ isSearching ? '匹配的文件夹' : '文件夹' }}</h4>
            <span>{{ visibleFolders.length }} 个</span>
          </div>
          <div class="folder-grid">
            <article
              v-for="folder in visibleFolders"
              :key="folder.id"
              class="folder-card"
              :class="{ 'is-dragover': dragOverFolderId === folder.id }"
              @dragenter.prevent="onFolderDragEnter(folder.id, $event)"
              @dragover.prevent
              @dragleave.prevent="onFolderDragLeave($event)"
              @drop.prevent="onFolderDrop(folder.id, $event)"
            >
              <button
                type="button"
                class="folder-card-open"
                @click="isSearching ? openFolderFromSearch(folder.id) : openFolder(folder.id)"
              >
                <el-icon><FolderOpened /></el-icon>
                <strong>{{ folder.name }}</strong>
                <span v-if="isSearching" class="folder-drop-hint">{{ buildFolderPath(folder.parentId) }}</span>
                <span v-else-if="dragOverFolderId === folder.id" class="folder-drop-hint">松开保存到这里</span>
              </button>
              <div class="folder-card-actions">
                <el-button
                  size="small"
                  @click="isSearching ? openFolderFromSearch(folder.id) : openFolder(folder.id)"
                >
                  打开
                </el-button>
                <el-button size="small" @click="openRenameFolderDialog(folder)">重命名</el-button>
                <el-button size="small" type="danger" plain @click="handleDeleteFolder(folder)">
                  删除
                </el-button>
              </div>
            </article>
          </div>
        </section>

        <section v-if="imageFiles.length" class="files-section">
          <div class="files-section-head">
            <h4>图片</h4>
            <span>{{ imageFiles.length }} 个</span>
          </div>
          <div class="file-grid">
            <article v-for="file in imageFiles" :key="file.id" class="file-card">
              <button type="button" class="file-card-preview" @click="openPreview(file)">
                <img
                  v-if="previewUrls[file.id]"
                  :src="previewUrls[file.id]"
                  :alt="file.name"
                />
                <div v-else class="file-card-preview-fallback">
                  <el-icon><Picture /></el-icon>
                  <span>点击预览</span>
                </div>
              </button>
              <div class="file-card-body">
                <div class="file-card-topline">
                  <strong>{{ file.name }}</strong>
                </div>
                <p v-if="file.note" class="file-card-note">{{ file.note }}</p>
                <div class="file-card-meta">
                  <span>{{ formatVaultFileSize(file.size) }}</span>
                  <span>{{ getVaultCategoryLabel(file.category) }}</span>
                  <span v-if="isSearching">{{ buildFolderPath(file.folderId) }}</span>
                </div>
                <div class="file-card-actions">
                  <el-button size="small" @click="openPreview(file)">预览</el-button>
                  <el-button size="small" @click="handleOpenFile(file)">打开</el-button>
                  <el-button size="small" @click="openEditDialog(file)">编辑</el-button>
                  <el-button size="small" type="danger" plain @click="handleDelete(file)">
                    删除
                  </el-button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section v-if="otherFiles.length" class="files-section">
          <div class="files-section-head">
            <h4>文档与其他</h4>
            <span>{{ otherFiles.length }} 个</span>
          </div>
          <ul class="file-list">
            <li v-for="file in otherFiles" :key="file.id" class="file-list-item">
              <div class="file-list-main">
                <div class="file-list-topline">
                  <el-tag :type="getCategoryTagType(file.category)" effect="light" size="small">
                    {{ getVaultCategoryLabel(file.category) }}
                  </el-tag>
                  <strong>{{ file.name }}</strong>
                </div>
                <p v-if="file.note" class="file-list-note">{{ file.note }}</p>
                <div class="file-list-meta">
                  <span>{{ formatVaultFileSize(file.size) }}</span>
                  <span>{{ file.originalName }}</span>
                  <span v-if="isSearching">{{ buildFolderPath(file.folderId) }}</span>
                </div>
              </div>
              <div class="file-list-actions">
                <el-button plain @click="handleOpenFile(file)">打开</el-button>
                <el-button plain @click="handleRevealFile(file)">定位</el-button>
                <el-button @click="openEditDialog(file)">编辑</el-button>
                <el-button type="danger" plain @click="handleDelete(file)">删除</el-button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </article>

    <el-dialog v-model="folderDialogVisible" title="新建文件夹" width="420px">
      <el-form label-position="top">
        <el-form-item label="文件夹名称">
          <el-input
            v-model="folderForm.name"
            maxlength="60"
            show-word-limit
            placeholder="例如：工作资料、账号截图"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="folderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveFolder">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="renameFolderDialogVisible" title="重命名文件夹" width="420px">
      <el-form label-position="top">
        <el-form-item label="文件夹名称">
          <el-input v-model="renameFolderForm.name" maxlength="60" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameFolderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRenameFolder">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dialogVisible" title="编辑文件信息" width="520px">
      <el-form label-position="top">
        <el-form-item label="显示名称">
          <el-input v-model="fileForm.name" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="所属文件夹">
          <el-select v-model="fileForm.folderId" style="width: 100%">
            <el-option
              v-for="option in folderSelectOptions"
              :key="option.value || 'root'"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="fileForm.note"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="可选，补充用途说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveFileMeta">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="previewVisible"
      :title="previewFile?.name || '图片预览'"
      width="760px"
      class="file-preview-dialog"
    >
      <div v-loading="previewLoading" class="file-preview-body">
        <img
          v-if="previewDataUrl"
          :src="previewDataUrl"
          :alt="previewFile?.name"
          class="file-preview-image"
        />
        <el-empty v-else description="该图片暂不支持预览，请使用打开文件" />
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
        <el-button v-if="previewFile" type="primary" @click="handleOpenFile(previewFile)">
          系统打开
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>
