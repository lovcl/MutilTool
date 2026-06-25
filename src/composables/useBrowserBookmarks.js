import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getBookmarkUrlKey, isAllowedBrowserUrl } from '../utils/browserUrl';

const LEGACY_STORAGE_KEY = 'browser-bookmarks';
const electronAPI = window.electronAPI;

const createBookmarkId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const normalizeBookmarks = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item?.url && isAllowedBrowserUrl(item.url))
    .map((item) => ({
      id: item.id || createBookmarkId(),
      title: String(item.title || item.url || '未命名收藏'),
      url: item.url,
      createdAt: Number(item.createdAt) || Date.now(),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
};

const loadLegacyBookmarks = () => {
  try {
    return normalizeBookmarks(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
};

const bookmarks = ref(loadLegacyBookmarks());
const bookmarksReady = ref(false);

const serializeBookmarks = (items) =>
  normalizeBookmarks(JSON.parse(JSON.stringify(Array.isArray(items) ? items : [])));

const persistBookmarks = async () => {
  const payload = serializeBookmarks(bookmarks.value);

  if (electronAPI?.browser?.saveBookmarks) {
    await electronAPI.browser.saveBookmarks(payload);
    return;
  }

  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(payload));
};

let hydrated = false;

const hydrateBookmarks = async () => {
  if (hydrated) {
    return;
  }

  hydrated = true;

  if (!electronAPI?.browser?.getBookmarks) {
    bookmarksReady.value = true;
    return;
  }

  try {
    const fromFile = normalizeBookmarks(await electronAPI.browser.getBookmarks());
    if (fromFile.length) {
      bookmarks.value = fromFile;
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      bookmarksReady.value = true;
      return;
    }

    const legacy = loadLegacyBookmarks();
    if (legacy.length) {
      bookmarks.value = legacy;
      await persistBookmarks();
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch (error) {
    console.error('[browser-bookmarks] 加载失败:', error);
  } finally {
    bookmarksReady.value = true;
  }
};

export function useBrowserBookmarks() {
  const bookmarkUrlKeys = computed(
    () => new Set(bookmarks.value.map((item) => getBookmarkUrlKey(item.url)).filter(Boolean))
  );

  const isBookmarked = (url) => {
    const key = getBookmarkUrlKey(url);
    return Boolean(key && bookmarkUrlKeys.value.has(key));
  };

  const findBookmarkByUrl = (url) => {
    const key = getBookmarkUrlKey(url);
    if (!key) {
      return null;
    }

    return bookmarks.value.find((item) => getBookmarkUrlKey(item.url) === key) || null;
  };

  const addBookmark = async ({ url, title }) => {
    const normalizedUrl = getBookmarkUrlKey(url);
    if (!normalizedUrl) {
      ElMessage.warning('仅支持收藏 http / https 网址');
      return false;
    }

    if (findBookmarkByUrl(normalizedUrl)) {
      ElMessage.info('该网址已在收藏夹中');
      return false;
    }

    bookmarks.value.unshift({
      id: createBookmarkId(),
      title: String(title || normalizedUrl).trim() || normalizedUrl,
      url: normalizedUrl,
      createdAt: Date.now(),
    });
    await persistBookmarks();
    ElMessage.success('已加入收藏夹');
    return true;
  };

  const removeBookmark = async (bookmarkId) => {
    const index = bookmarks.value.findIndex((item) => item.id === bookmarkId);
    if (index < 0) {
      return false;
    }

    bookmarks.value.splice(index, 1);
    await persistBookmarks();
    ElMessage.success('已取消收藏');
    return true;
  };

  const toggleBookmark = async ({ url, title }) => {
    const existing = findBookmarkByUrl(url);
    if (existing) {
      return removeBookmark(existing.id);
    }

    return addBookmark({ url, title });
  };

  const updateBookmarkTitle = async (bookmarkId, title) => {
    const bookmark = bookmarks.value.find((item) => item.id === bookmarkId);
    if (!bookmark) {
      return false;
    }

    const nextTitle = String(title || '').trim();
    if (!nextTitle) {
      ElMessage.warning('收藏名称不能为空');
      return false;
    }

    bookmark.title = nextTitle;
    await persistBookmarks();
    return true;
  };

  return {
    bookmarks,
    bookmarksReady,
    hydrateBookmarks,
    isBookmarked,
    findBookmarkByUrl,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    updateBookmarkTitle,
  };
}
