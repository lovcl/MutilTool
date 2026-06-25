import { computed, nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  DEFAULT_BROWSER_HOME_URL,
  isAllowedBrowserUrl,
  normalizeBrowserInput,
} from '../utils/browserUrl';

const createTabId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createBrowserTab = (url = DEFAULT_BROWSER_HOME_URL) => ({
  id: createTabId(),
  title: '新标签页',
  url,
  addressInput: url,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
});

export function useBrowserTabs() {
  const homeUrl = DEFAULT_BROWSER_HOME_URL;
  const tabs = ref([createBrowserTab()]);
  const activeTabId = ref(tabs.value[0].id);
  const webviewRefs = ref({});
  const webviewReadyState = new Map();
  const addressInputEditingTabId = ref(null);

  const isAddressInputEditing = (tabId) => addressInputEditingTabId.value === tabId;

  const setAddressInputValue = (tab, nextUrl) => {
    if (!tab || isAddressInputEditing(tab.id)) {
      return;
    }

    tab.addressInput = nextUrl;
  };

  const beginAddressInputEdit = (tabId = activeTabId.value) => {
    addressInputEditingTabId.value = tabId;
  };

  const endAddressInputEdit = (tabId = activeTabId.value) => {
    if (addressInputEditingTabId.value === tabId) {
      addressInputEditingTabId.value = null;
    }
  };

  const activeTab = computed(
    () => tabs.value.find((tab) => tab.id === activeTabId.value) || tabs.value[0] || null
  );

  const findTab = (tabId) => tabs.value.find((tab) => tab.id === tabId) || null;

  const getWebview = (tabId = activeTabId.value) => webviewRefs.value[tabId] || null;

  const isWebviewReady = (tabId) => Boolean(webviewReadyState.get(tabId));

  const isAbortLoadError = (error) => {
    const message = String(error?.message || error || '');
    return message.includes('(-3)') || message.includes('ERR_ABORTED');
  };

  const isBlankWebviewUrl = (url) => {
    const value = String(url || '').trim().toLowerCase();
    return !value || value === 'about:blank';
  };

  const resolveDisplayUrl = (webviewUrl, tab) => {
    if (isBlankWebviewUrl(webviewUrl)) {
      return tab.url || homeUrl;
    }

    return webviewUrl || tab.url || homeUrl;
  };

  const safeSyncWebviewState = (webview, tab) => {
    if (!webview || !tab || !isWebviewReady(tab.id)) {
      return false;
    }

    try {
      tab.canGoBack = webview.canGoBack?.() || false;
      tab.canGoForward = webview.canGoForward?.() || false;
      const webviewUrl = webview.getURL?.() || '';
      const nextUrl = resolveDisplayUrl(webviewUrl, tab);

      if (!isBlankWebviewUrl(webviewUrl)) {
        tab.url = nextUrl;
      }

      setAddressInputValue(tab, nextUrl);
      return true;
    } catch {
      return false;
    }
  };

  const ensureWebviewInitialLoad = (webview, tabId) => {
    const tab = findTab(tabId);
    if (!webview || !tab?.url || !isAllowedBrowserUrl(tab.url)) {
      return;
    }

    if (webview.dataset.initialized === 'true') {
      return;
    }

    let current = '';
    try {
      current = webview.getURL?.() || '';
      webviewReadyState.set(tabId, true);
    } catch {
      return;
    }

    if (!isBlankWebviewUrl(current)) {
      webview.dataset.initialized = 'true';
      return;
    }

    webview.dataset.initialized = 'true';
    webview.loadURL(tab.url).catch((error) => {
      if (!isAbortLoadError(error)) {
        console.warn('[browser] initial loadURL failed:', error);
      }
    });
  };

  const syncToolbarFromActiveTab = () => {
    const tab = activeTab.value;
    if (!tab) {
      return;
    }

    safeSyncWebviewState(getWebview(tab.id), tab);
  };

  const waitForWebviewRef = async (tabId, attempts = 6) => {
    for (let index = 0; index < attempts; index += 1) {
      await nextTick();
      const webview = getWebview(tabId);
      if (webview) {
        return webview;
      }
    }

    return null;
  };

  const tryMarkWebviewReady = (webview, tabId) => {
    if (!webview || isWebviewReady(tabId)) {
      return isWebviewReady(tabId);
    }

    try {
      webview.getURL?.();
      webviewReadyState.set(tabId, true);
      return true;
    } catch {
      return false;
    }
  };

  const waitForWebviewReady = (webview, tabId, timeoutMs = 15000) => {
    if (!webview) {
      return Promise.resolve(false);
    }

    if (tryMarkWebviewReady(webview, tabId)) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;

      const finish = (ready) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);
        webview.removeEventListener('dom-ready', onDomReady);
        if (ready) {
          webviewReadyState.set(tabId, true);
        }
        resolve(ready);
      };

      const onDomReady = () => finish(true);
      webview.addEventListener('dom-ready', onDomReady);

      const timer = window.setTimeout(() => finish(false), timeoutMs);
    });
  };

  const loadWebviewUrl = async (webview, tabId, url) => {
    if (!webview || !findTab(tabId)) {
      return;
    }

    await waitForWebviewReady(webview, tabId);

    try {
      await webview.loadURL(url);
    } catch (error) {
      if (!isAbortLoadError(error)) {
        console.warn('[browser] loadURL failed:', error);
      }
    }
  };

  const setWebviewRef = (tabId, element) => {
    if (element) {
      if (webviewRefs.value[tabId] === element && element.dataset.bound === 'true') {
        if (tabId === activeTabId.value) {
          safeSyncWebviewState(element, findTab(tabId));
        }
        return;
      }

      webviewRefs.value[tabId] = element;
      webviewReadyState.set(tabId, false);
      bindWebviewEvents(element, tabId);

      queueMicrotask(() => {
        ensureWebviewInitialLoad(element, tabId);
        const tab = findTab(tabId);
        if (tabId === activeTabId.value && tab) {
          safeSyncWebviewState(element, tab);
        }
      });
      return;
    }

    if (!webviewRefs.value[tabId]) {
      return;
    }

    unbindWebviewEvents(getWebview(tabId));
    delete webviewRefs.value[tabId];
    webviewReadyState.delete(tabId);
  };

  const eventHandlers = new Map();

  const getHandlers = (tabId) => {
    if (!eventHandlers.has(tabId)) {
      eventHandlers.set(tabId, {
        didNavigate: handleDidNavigate(tabId),
        titleUpdated: handleTitleUpdated(tabId),
        startLoading: handleStartLoading(tabId),
        stopLoading: handleStopLoading(tabId),
        newWindow: handleNewWindow(tabId),
        failLoad: handleFailLoad(tabId),
        domReady: null,
      });
    }

    return eventHandlers.get(tabId);
  };

  const bindWebviewEvents = (webview, tabId) => {
    if (!webview || webview.dataset.bound === 'true') {
      return;
    }

    const handlers = getHandlers(tabId);
    handlers.domReady = () => {
      webviewReadyState.set(tabId, true);
      ensureWebviewInitialLoad(webview, tabId);

      const tab = findTab(tabId);
      if (tabId === activeTabId.value && tab) {
        safeSyncWebviewState(webview, tab);
      }
    };

    webview.dataset.bound = 'true';
    webview.dataset.tabId = tabId;
    webview.addEventListener('dom-ready', handlers.domReady);
    webview.addEventListener('did-navigate', handlers.didNavigate);
    webview.addEventListener('did-navigate-in-page', handlers.didNavigate);
    webview.addEventListener('page-title-updated', handlers.titleUpdated);
    webview.addEventListener('did-start-loading', handlers.startLoading);
    webview.addEventListener('did-stop-loading', handlers.stopLoading);
    webview.addEventListener('new-window', handlers.newWindow);
    webview.addEventListener('did-fail-load', handlers.failLoad);
  };

  const unbindWebviewEvents = (webview) => {
    if (!webview || webview.dataset.bound !== 'true') {
      return;
    }

    const tabId = webview.dataset.tabId;
    const handlers = eventHandlers.get(tabId);
    if (handlers) {
      if (handlers.domReady) {
        webview.removeEventListener('dom-ready', handlers.domReady);
      }
      webview.removeEventListener('did-navigate', handlers.didNavigate);
      webview.removeEventListener('did-navigate-in-page', handlers.didNavigate);
      webview.removeEventListener('page-title-updated', handlers.titleUpdated);
      webview.removeEventListener('did-start-loading', handlers.startLoading);
      webview.removeEventListener('did-stop-loading', handlers.stopLoading);
      webview.removeEventListener('new-window', handlers.newWindow);
      webview.removeEventListener('did-fail-load', handlers.failLoad);
      eventHandlers.delete(tabId);
    }

    webviewReadyState.delete(tabId);
    delete webview.dataset.bound;
    delete webview.dataset.tabId;
  };

  const bindTabWebview = async (tabId) => {
    const webview = await waitForWebviewRef(tabId);
    if (!webview) {
      return;
    }

    bindWebviewEvents(webview, tabId);
    await waitForWebviewReady(webview, tabId);
    ensureWebviewInitialLoad(webview, tabId);

    if (activeTabId.value === tabId) {
      syncToolbarFromActiveTab();
    }
  };

  const switchTab = (tabId) => {
    addressInputEditingTabId.value = null;
    activeTabId.value = tabId;
    syncToolbarFromActiveTab();
  };

  const openUrlInNewTab = async (url = homeUrl, options = {}) => {
    const { background = false } = options;
    const targetUrl = url || homeUrl;

    if (!isAllowedBrowserUrl(targetUrl)) {
      return;
    }

    const tab = createBrowserTab(targetUrl);
    tabs.value.push(tab);

    if (!background) {
      activeTabId.value = tab.id;
    }

    await bindTabWebview(tab.id);
  };

  const addTab = async (url = homeUrl) => {
    await openUrlInNewTab(url);
  };

  const closeTab = async (tabId) => {
    if (tabs.value.length <= 1) {
      const tab = findTab(tabId);
      const webview = getWebview(tabId);
      if (tab) {
        tab.title = '新标签页';
        tab.url = homeUrl;
        tab.addressInput = homeUrl;
        tab.isLoading = false;
        tab.canGoBack = false;
        tab.canGoForward = false;
      }

      if (webview) {
        await loadWebviewUrl(webview, tabId, homeUrl);
      }
      return;
    }

    const index = tabs.value.findIndex((tab) => tab.id === tabId);
    if (index < 0) {
      return;
    }

    unbindWebviewEvents(getWebview(tabId));
    delete webviewRefs.value[tabId];
    tabs.value.splice(index, 1);

    if (activeTabId.value === tabId) {
      const nextTab = tabs.value[Math.min(index, tabs.value.length - 1)];
      activeTabId.value = nextTab?.id || tabs.value[0].id;
      syncToolbarFromActiveTab();
    }
  };

  const navigateTo = async (targetUrl, tabId = activeTabId.value) => {
    const webview = getWebview(tabId);
    const tab = findTab(tabId);
    if (!webview || !tab) {
      return;
    }

    if (!isAllowedBrowserUrl(targetUrl)) {
      ElMessage.warning('仅支持 http / https 网址');
      return;
    }

    await waitForWebviewReady(webview, tabId);

    let current = tab.url || '';
    try {
      current = webview.getURL?.() || current;
    } catch {
      // webview 尚未就绪时回退到 tab 记录
    }

    if (current === targetUrl) {
      try {
        webview.reload?.();
      } catch {
        // ignore
      }
      return;
    }

    tab.url = targetUrl;
    tab.addressInput = targetUrl;
    await loadWebviewUrl(webview, tabId, targetUrl);
  };

  const navigateFromAddress = () => {
    const tab = activeTab.value;
    if (!tab) {
      return;
    }

    endAddressInputEdit(tab.id);

    const nextUrl = normalizeBrowserInput(tab.addressInput, homeUrl);
    if (!nextUrl) {
      ElMessage.warning('暂不支持该协议');
      return;
    }

    navigateTo(nextUrl, tab.id);
  };

  const goBack = () => {
    try {
      getWebview()?.goBack?.();
    } catch {
      // ignore
    }
  };

  const goForward = () => {
    try {
      getWebview()?.goForward?.();
    } catch {
      // ignore
    }
  };

  const reloadPage = () => {
    try {
      getWebview()?.reload?.();
    } catch {
      // ignore
    }
  };

  const goHome = () => {
    const tab = activeTab.value;
    if (!tab) {
      return;
    }

    tab.addressInput = homeUrl;
    navigateTo(homeUrl, tab.id);
  };

  const toggleDevTools = () => {
    const webview = getWebview();
    if (!webview) {
      return;
    }

    try {
      if (webview.isDevToolsOpened?.()) {
        webview.closeDevTools?.();
        return;
      }

      webview.openDevTools?.({ mode: 'detach' });
    } catch (error) {
      console.warn('[browser] toggleDevTools failed:', error);
    }
  };

  const handleDidNavigate = (tabId) => (event) => {
    const tab = findTab(tabId);
    if (!tab) {
      return;
    }

    let nextUrl = event.url || tab.url || homeUrl;
    if (!event.url && isWebviewReady(tabId)) {
      try {
        nextUrl = getWebview(tabId)?.getURL?.() || nextUrl;
      } catch {
        // ignore
      }
    }

    if (isBlankWebviewUrl(nextUrl)) {
      return;
    }

    tab.url = nextUrl;
    setAddressInputValue(tab, nextUrl);

    if (tabId === activeTabId.value) {
      safeSyncWebviewState(getWebview(tabId), tab);
    }
  };

  const handleTitleUpdated = (tabId) => (event) => {
    const tab = findTab(tabId);
    if (!tab) {
      return;
    }

    tab.title = event.title || tab.url || '新标签页';
  };

  const handleStartLoading = (tabId) => () => {
    const tab = findTab(tabId);
    if (tab) {
      tab.isLoading = true;
    }
  };

  const handleStopLoading = (tabId) => () => {
    const tab = findTab(tabId);
    if (!tab) {
      return;
    }

    tab.isLoading = false;
    if (tabId === activeTabId.value) {
      safeSyncWebviewState(getWebview(tabId), tab);
    }
  };

  const handleNewWindow = (tabId) => (event) => {
    event.preventDefault?.();
    const nextUrl = event.url;
    if (nextUrl) {
      openUrlInNewTab(nextUrl, {
        background: event.disposition === 'background-tab',
      });
    }
  };

  const handleFailLoad = (tabId) => (event) => {
    if (event.errorCode === -3) {
      return;
    }

    const tab = findTab(tabId);
    if (tab) {
      tab.isLoading = false;
    }

    if (tabId === activeTabId.value) {
      ElMessage.warning(`页面加载失败（${event.errorCode}）`);
    }
  };

  const activateBrowserTabs = async () => {
    await nextTick();
    syncToolbarFromActiveTab();
  };

  const cleanupTabs = () => {
    tabs.value.forEach((tab) => {
      unbindWebviewEvents(getWebview(tab.id));
    });
    webviewRefs.value = {};
    webviewReadyState.clear();
    eventHandlers.clear();
  };

  const reloadAllTabs = async () => {
    await Promise.all(
      tabs.value.map(async (tab) => {
        tab.title = '新标签页';
        tab.url = homeUrl;
        tab.addressInput = homeUrl;
        tab.isLoading = false;
        tab.canGoBack = false;
        tab.canGoForward = false;

        const webview = getWebview(tab.id);
        if (webview) {
          await loadWebviewUrl(webview, tab.id, homeUrl);
        }
      })
    );
  };

  return {
    homeUrl,
    tabs,
    activeTabId,
    activeTab,
    setWebviewRef,
    switchTab,
    addTab,
    openUrlInNewTab,
    closeTab,
    navigateFromAddress,
    navigateTo,
    goBack,
    goForward,
    reloadPage,
    goHome,
    toggleDevTools,
    activateBrowserTabs,
    beginAddressInputEdit,
    endAddressInputEdit,
    cleanupTabs,
    reloadAllTabs,
  };
}
