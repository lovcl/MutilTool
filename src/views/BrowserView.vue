<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowLeft,
  ArrowRight,
  Close,
  Collection,
  Delete,
  HomeFilled,
  Link,
  Plus,
  Refresh,
  RefreshRight,
  Star,
  StarFilled,
  Tools,
} from '@element-plus/icons-vue';
import { useBrowserBookmarks } from '../composables/useBrowserBookmarks';
import { useBrowserTabs } from '../composables/useBrowserTabs';
import { isAllowedBrowserUrl } from '../utils/browserUrl';

defineOptions({
  name: 'BrowserView',
});

const route = useRoute();
const isDesktopApp = Boolean(window.electronAPI?.platform);

const {
  tabs,
  activeTabId,
  activeTab,
  setWebviewRef,
  switchTab,
  addTab,
  closeTab,
  navigateFromAddress,
  navigateTo,
  goBack,
  goForward,
  reloadPage,
  goHome,
  toggleDevTools,
  activateBrowserTabs,
  openUrlInNewTab,
  beginAddressInputEdit,
  endAddressInputEdit,
  reloadAllTabs,
} = useBrowserTabs();

const { bookmarks, hydrateBookmarks, isBookmarked, toggleBookmark, removeBookmark, updateBookmarkTitle } =
  useBrowserBookmarks();

const bookmarksPopoverVisible = ref(false);
const editingBookmarkId = ref('');
const editingBookmarkTitle = ref('');

const currentPageUrl = computed(() => activeTab.value?.url || '');
const isCurrentBookmarked = computed(() => isBookmarked(currentPageUrl.value));
const canBookmarkCurrentPage = computed(
  () => Boolean(currentPageUrl.value) && isAllowedBrowserUrl(currentPageUrl.value)
);

const toggleCurrentBookmark = async () => {
  if (!canBookmarkCurrentPage.value) {
    ElMessage.warning('当前页面无法收藏');
    return;
  }

  await toggleBookmark({
    url: currentPageUrl.value,
    title: activeTab.value?.title || currentPageUrl.value,
  });
};

const openBookmark = (url) => {
  navigateTo(url);
  bookmarksPopoverVisible.value = false;
};

const handleAddressFocus = (event) => {
  if (!activeTab.value) {
    return;
  }

  beginAddressInputEdit(activeTab.value.id);
  event.target?.select?.();
};

const handleAddressBlur = () => {
  if (!activeTab.value) {
    return;
  }

  endAddressInputEdit(activeTab.value.id);
};

const openBookmarkInNewTab = (url) => {
  addTab(url);
  bookmarksPopoverVisible.value = false;
};

const handleRemoveBookmark = async (bookmark) => {
  try {
    await ElMessageBox.confirm(`确定取消收藏「${bookmark.title}」吗？`, '取消收藏', {
      confirmButtonText: '取消收藏',
      cancelButtonText: '保留',
      type: 'warning',
    });
    removeBookmark(bookmark.id);
  } catch {
    // 用户取消
  }
};

const startEditBookmark = (bookmark) => {
  editingBookmarkId.value = bookmark.id;
  editingBookmarkTitle.value = bookmark.title;
};

const cancelEditBookmark = () => {
  editingBookmarkId.value = '';
  editingBookmarkTitle.value = '';
};

const saveEditBookmark = async (bookmarkId) => {
  if (await updateBookmarkTitle(bookmarkId, editingBookmarkTitle.value)) {
    cancelEditBookmark();
  }
};

const clearBrowserCache = async () => {
  try {
    await ElMessageBox.confirm(
      '将清除内置浏览器的缓存、Cookie 和网页本地存储，不影响收藏夹、考勤、文件等其他模块数据。',
      '清理浏览器缓存',
      {
        confirmButtonText: '清理',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await window.electronAPI?.browser?.clearCache?.();
    reloadAllTabs();
    ElMessage.success('浏览器缓存已清理');
  } catch {
    // 用户取消
  }
};

let removeDevToolsListener = null;
let removeOpenUrlInTabListener = null;

const setBrowserPageActive = (active) => {
  window.electronAPI?.browser?.setPageActive?.(active);
};

onMounted(async () => {
  if (!isDesktopApp) {
    return;
  }

  await hydrateBookmarks();
  removeDevToolsListener = window.electronAPI?.browser?.onToggleDevTools?.(() => {
    toggleDevTools();
  });
  removeOpenUrlInTabListener = window.electronAPI?.browser?.onOpenUrlInTab?.((payload) => {
    const url = payload?.url;
    if (!url) {
      return;
    }

    openUrlInNewTab(url, { background: Boolean(payload?.background) });
  });
});

watch(
  () => route.name === 'browser',
  (active) => {
    if (!isDesktopApp) {
      return;
    }

    setBrowserPageActive(active);

    if (active) {
      activateBrowserTabs();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  setBrowserPageActive(false);
  removeDevToolsListener?.();
  removeOpenUrlInTabListener?.();
});
</script>

<template>
  <section class="browser-layout">
    <div v-if="isDesktopApp" class="browser-tabs">
      <div class="browser-tabs-scroll">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="browser-tab"
          :class="{ 'is-active': tab.id === activeTabId, 'is-loading': tab.isLoading }"
          @click="switchTab(tab.id)"
        >
          <span class="browser-tab-title" :title="tab.title">{{ tab.title }}</span>
          <button
            type="button"
            class="browser-tab-close"
            title="关闭标签页"
            @click.stop="closeTab(tab.id)"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>

        <div class="browser-tab-add-anchor">
          <button type="button" class="browser-tab-add" title="新建标签页" @click="addTab()">
            <el-icon><Plus /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <header class="browser-toolbar">
      <div class="browser-toolbar-actions">
        <button
          type="button"
          class="browser-tool-btn"
          :disabled="!activeTab?.canGoBack"
          @click="goBack"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button
          type="button"
          class="browser-tool-btn"
          :disabled="!activeTab?.canGoForward"
          @click="goForward"
        >
          <el-icon><ArrowRight /></el-icon>
        </button>
        <button type="button" class="browser-tool-btn" @click="reloadPage">
          <el-icon><component :is="activeTab?.isLoading ? RefreshRight : Refresh" /></el-icon>
        </button>
        <button type="button" class="browser-tool-btn" title="百度首页" @click="goHome">
          <el-icon><HomeFilled /></el-icon>
        </button>
        <button
          type="button"
          class="browser-tool-btn"
          :class="{ 'browser-tool-btn--starred': isCurrentBookmarked }"
          :disabled="!canBookmarkCurrentPage"
          :title="isCurrentBookmarked ? '取消收藏' : '收藏此页'"
          @click="toggleCurrentBookmark"
        >
          <el-icon><component :is="isCurrentBookmarked ? StarFilled : Star" /></el-icon>
        </button>
        <el-popover
          v-model:visible="bookmarksPopoverVisible"
          placement="bottom-start"
          :width="360"
          trigger="click"
          popper-class="browser-bookmarks-popover"
        >
          <template #reference>
            <button
              type="button"
              class="browser-tool-btn"
              :class="{ 'browser-tool-btn--active': bookmarksPopoverVisible }"
              title="收藏夹"
            >
              <el-icon><Collection /></el-icon>
            </button>
          </template>

          <div class="browser-bookmarks-panel">
            <div class="browser-bookmarks-panel__head">
              <strong>收藏夹</strong>
              <span>{{ bookmarks.length }} 项</span>
            </div>

            <el-empty v-if="!bookmarks.length" description="暂无收藏，点击星标可收藏当前页面" />

            <ul v-else class="browser-bookmarks-list">
              <li v-for="bookmark in bookmarks" :key="bookmark.id" class="browser-bookmarks-item">
                <div v-if="editingBookmarkId === bookmark.id" class="browser-bookmarks-edit">
                  <el-input
                    v-model="editingBookmarkTitle"
                    size="small"
                    maxlength="80"
                    @keydown.enter.prevent="saveEditBookmark(bookmark.id)"
                  />
                  <div class="browser-bookmarks-edit__actions">
                    <el-button size="small" @click="cancelEditBookmark">取消</el-button>
                    <el-button size="small" type="primary" @click="saveEditBookmark(bookmark.id)">
                      保存
                    </el-button>
                  </div>
                </div>
                <template v-else>
                  <button
                    type="button"
                    class="browser-bookmarks-item__main"
                    @click="openBookmark(bookmark.url)"
                  >
                    <strong>{{ bookmark.title }}</strong>
                    <span>{{ bookmark.url }}</span>
                  </button>
                  <div class="browser-bookmarks-item__actions">
                    <el-button
                      size="small"
                      text
                      type="primary"
                      @click="openBookmarkInNewTab(bookmark.url)"
                    >
                      新标签
                    </el-button>
                    <el-button size="small" text @click="startEditBookmark(bookmark)">
                      重命名
                    </el-button>
                    <el-button size="small" text type="danger" @click="handleRemoveBookmark(bookmark)">
                      删除
                    </el-button>
                  </div>
                </template>
              </li>
            </ul>
          </div>
        </el-popover>
        <button
          type="button"
          class="browser-tool-btn browser-tool-btn--devtools"
          title="网页开发者工具 (F12)"
          @click="toggleDevTools"
        >
          <el-icon><Tools /></el-icon>
        </button>
        <button
          type="button"
          class="browser-tool-btn browser-tool-btn--clear-cache"
          title="清理浏览器缓存"
          @click="clearBrowserCache"
        >
          <el-icon><Delete /></el-icon>
        </button>
      </div>

      <div class="browser-address-bar">
        <el-icon class="browser-address-icon"><Link /></el-icon>
        <input
          v-if="activeTab"
          v-model="activeTab.addressInput"
          class="browser-address-input"
          type="text"
          spellcheck="false"
          placeholder="输入网址或搜索内容"
          @focus="handleAddressFocus"
          @blur="handleAddressBlur"
          @keydown.enter.prevent="navigateFromAddress"
        />
        <el-button type="primary" @mousedown.prevent @click="navigateFromAddress">前往</el-button>
      </div>
    </header>

    <div v-if="isDesktopApp && bookmarks.length" class="browser-bookmarks-bar">
      <span class="browser-bookmarks-bar__label">收藏夹</span>
      <div class="browser-bookmarks-bar__list">
        <button
          v-for="bookmark in bookmarks"
          :key="bookmark.id"
          type="button"
          class="browser-bookmark-chip"
          :title="bookmark.url"
          @click="openBookmark(bookmark.url)"
        >
          {{ bookmark.title }}
        </button>
      </div>
    </div>

    <div class="browser-content">
      <template v-if="isDesktopApp">
        <webview
          v-for="tab in tabs"
          v-show="tab.id === activeTabId"
          :key="tab.id"
          :ref="(element) => setWebviewRef(tab.id, element)"
          class="browser-webview"
          src="about:blank"
          partition="persist:browser"
          allowpopups
          webpreferences="contextIsolation=yes, devTools=yes"
        />
      </template>
      <article v-else class="settings-panel browser-fallback">
        <el-empty description="内置浏览器需要在桌面版应用中使用" />
      </article>
    </div>
  </section>
</template>
