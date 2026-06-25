export const DEFAULT_BROWSER_HOME_URL = 'https://www.baidu.com';

const hasProtocol = (value) => /^[a-z][a-z0-9+.-]*:/i.test(value);

const looksLikeHost = (value) =>
  /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/[^\s]*)?$/i.test(value) ||
  /^localhost(:\d+)?(\/[^\s]*)?$/i.test(value) ||
  /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/[^\s]*)?$/i.test(value);

export const normalizeBrowserInput = (input, homeUrl = DEFAULT_BROWSER_HOME_URL) => {
  const raw = String(input || '').trim();
  if (!raw) {
    return homeUrl;
  }

  if (hasProtocol(raw)) {
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }

    return null;
  }

  if (looksLikeHost(raw)) {
    return `https://${raw}`;
  }

  return `https://www.baidu.com/s?wd=${encodeURIComponent(raw)}`;
};

export const isAllowedBrowserUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const normalizeBookmarkUrl = (url) => {
  try {
    const parsed = new URL(String(url || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
};

export const getBookmarkUrlKey = (url) => {
  const normalized = normalizeBookmarkUrl(url);
  if (!normalized) {
    return null;
  }

  const parsed = new URL(normalized);
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.href;
};
