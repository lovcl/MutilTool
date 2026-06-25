const fs = require('fs');
const path = require('path');

const createBrowserBookmarksModule = ({ userDataPath }) => {
  const bookmarksPath = path.join(userDataPath, 'browser-bookmarks.json');

  const loadBookmarks = () => {
    if (!fs.existsSync(bookmarksPath)) {
      return [];
    }

    try {
      const bookmarks = JSON.parse(fs.readFileSync(bookmarksPath, 'utf8'));
      return Array.isArray(bookmarks) ? bookmarks : [];
    } catch (error) {
      console.error('[browser-bookmarks] 读取失败:', error.message);
      return [];
    }
  };

  const saveBookmarks = (bookmarks) => {
    fs.writeFileSync(bookmarksPath, JSON.stringify(Array.isArray(bookmarks) ? bookmarks : [], null, 2));
    return true;
  };

  return {
    loadBookmarks,
    saveBookmarks,
  };
};

module.exports = { createBrowserBookmarksModule };
