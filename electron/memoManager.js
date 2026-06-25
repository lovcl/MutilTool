const fs = require('fs');
const path = require('path');

const MEMO_CATEGORIES = ['password', 'account', 'note', 'other'];

const createMemoManagerModule = ({ userDataPath, getMainWindow, activityLog }) => {
  const memosPath = path.join(userDataPath, 'memos.json');

  const loadMemos = () => {
    if (!fs.existsSync(memosPath)) {
      return [];
    }

    try {
      const memos = JSON.parse(fs.readFileSync(memosPath, 'utf8'));
      return Array.isArray(memos) ? memos : [];
    } catch (error) {
      console.error('[memos] 读取失败:', error.message);
      return [];
    }
  };

  const saveMemos = (memos) => {
    fs.writeFileSync(memosPath, JSON.stringify(memos, null, 2));
    getMainWindow()?.webContents.send('memos:changed', memos);
  };

  const normalizeMemo = (memo) => {
    const category = MEMO_CATEGORIES.includes(memo.category) ? memo.category : 'note';
    const isSensitive =
      typeof memo.isSensitive === 'boolean' ? memo.isSensitive : category === 'password';

    return {
      id: memo.id,
      title: String(memo.title || '').trim(),
      content: String(memo.content || ''),
      category,
      isSensitive,
      createdAt: memo.createdAt,
      updatedAt: memo.updatedAt,
    };
  };

  const createMemo = (payload) => {
    const now = new Date().toISOString();
    const memo = normalizeMemo({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: payload.title,
      content: payload.content || '',
      category: payload.category,
      isSensitive: payload.isSensitive,
      createdAt: now,
      updatedAt: now,
    });

    if (!memo.title) {
      throw new Error('标题不能为空');
    }

    const memos = [memo, ...loadMemos()];
    saveMemos(memos);

    activityLog?.appendLog({
      category: 'memo',
      action: 'create',
      title: '新建备忘录',
      summary: memo.title,
      detail: { memoId: memo.id, category: memo.category },
    });

    return memo;
  };

  const updateMemo = (memoId, payload) => {
    let updatedMemo = null;
    const memos = loadMemos().map((memo) => {
      if (memo.id !== memoId) {
        return memo;
      }

      updatedMemo = normalizeMemo({
        ...memo,
        ...payload,
        id: memo.id,
        createdAt: memo.createdAt,
        updatedAt: new Date().toISOString(),
      });

      return updatedMemo;
    });

    if (!updatedMemo) {
      throw new Error('备忘录不存在');
    }

    saveMemos(memos);

    activityLog?.appendLog({
      category: 'memo',
      action: 'update',
      title: '更新备忘录',
      summary: updatedMemo.title,
      detail: { memoId: updatedMemo.id, category: updatedMemo.category },
    });

    return updatedMemo;
  };

  const deleteMemo = (memoId) => {
    const memos = loadMemos();
    const target = memos.find((memo) => memo.id === memoId);
    if (!target) {
      throw new Error('备忘录不存在');
    }

    saveMemos(memos.filter((memo) => memo.id !== memoId));

    activityLog?.appendLog({
      category: 'memo',
      action: 'delete',
      title: '删除备忘录',
      summary: target.title,
      detail: { memoId },
    });

    return true;
  };

  return {
    loadMemos,
    createMemo,
    updateMemo,
    deleteMemo,
  };
};

module.exports = { createMemoManagerModule, MEMO_CATEGORIES };
