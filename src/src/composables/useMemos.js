import { ref } from 'vue';

const electronAPI = window.electronAPI;

export const MEMO_CATEGORY_OPTIONS = [
  { value: 'password', label: '密码' },
  { value: 'account', label: '账号' },
  { value: 'note', label: '备忘' },
  { value: 'other', label: '其他' },
];

export const memos = ref([]);
let initialized = false;

export const getMemoCategoryLabel = (category) =>
  MEMO_CATEGORY_OPTIONS.find((option) => option.value === category)?.label || '备忘';

export const hydrateMemos = async () => {
  if (electronAPI?.memos?.getAll) {
    memos.value = await electronAPI.memos.getAll();
    return;
  }

  memos.value = JSON.parse(localStorage.getItem('memos') || '[]');
};

const persistFallbackMemos = () => {
  if (!electronAPI?.memos) {
    localStorage.setItem('memos', JSON.stringify(memos.value));
  }
};

export function useMemos() {
  if (!initialized) {
    hydrateMemos();
    initialized = true;
  }

  const syncMemos = (nextMemos) => {
    memos.value = Array.isArray(nextMemos) ? nextMemos : [];
    persistFallbackMemos();
  };

  const createMemo = async (payload) => {
    if (electronAPI?.memos?.create) {
      const memo = await electronAPI.memos.create(payload);
      memos.value = [memo, ...memos.value.filter((item) => item.id !== memo.id)];
      return memo;
    }

    const now = new Date().toISOString();
    const category = payload.category || 'note';
    const memo = {
      id: `${Date.now()}`,
      title: payload.title,
      content: payload.content || '',
      category,
      isSensitive: payload.isSensitive ?? category === 'password',
      createdAt: now,
      updatedAt: now,
    };
    memos.value = [memo, ...memos.value];
    persistFallbackMemos();
    return memo;
  };

  const updateMemo = async (memoId, payload) => {
    if (electronAPI?.memos?.update) {
      const memo = await electronAPI.memos.update(memoId, payload);
      memos.value = memos.value.map((item) => (item.id === memoId ? memo : item));
      return memo;
    }

    memos.value = memos.value.map((item) =>
      item.id === memoId
        ? { ...item, ...payload, updatedAt: new Date().toISOString() }
        : item
    );
    persistFallbackMemos();
    return memos.value.find((item) => item.id === memoId) || null;
  };

  const deleteMemo = async (memoId) => {
    if (electronAPI?.memos?.delete) {
      await electronAPI.memos.delete(memoId);
    }

    memos.value = memos.value.filter((item) => item.id !== memoId);
    persistFallbackMemos();
  };

  const onMemosChanged = (callback) => electronAPI?.memos?.onChanged(callback) || null;

  return {
    memos,
    refreshMemos: hydrateMemos,
    syncMemos,
    createMemo,
    updateMemo,
    deleteMemo,
    onMemosChanged,
  };
}
