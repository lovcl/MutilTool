import { ref } from 'vue';

const electronAPI = window.electronAPI;

export const messages = ref([]);
let initialized = false;

export const hydrateMessages = async () => {
  if (electronAPI?.messages?.getAll) {
    messages.value = await electronAPI.messages.getAll();
    return;
  }

  messages.value = JSON.parse(localStorage.getItem('messages') || '[]');
};

const persistFallbackMessages = () => {
  if (!electronAPI?.messages) {
    localStorage.setItem('messages', JSON.stringify(messages.value));
  }
};

export const prependMessage = (message) => {
  if (!message?.id) {
    return;
  }

  messages.value = [message, ...messages.value.filter((item) => item.id !== message.id)];
  persistFallbackMessages();
};

export const replaceMessages = (nextMessages) => {
  messages.value = Array.isArray(nextMessages) ? nextMessages : [];
  persistFallbackMessages();
};

export function useMessages() {
  if (!initialized) {
    hydrateMessages();
    initialized = true;
  }

  const refreshMessages = hydrateMessages;

  const clearMessages = async () => {
    if (electronAPI?.messages?.clear) {
      await electronAPI.messages.clear();
    } else {
      localStorage.removeItem('messages');
    }

    messages.value = [];
  };

  const onMessageAppend = (callback) => electronAPI?.messages?.onAppend(callback) || null;

  const onMessageClear = (callback) => electronAPI?.messages?.onClear(callback) || null;

  const onMessagesReplaced = (callback) => electronAPI?.messages?.onReplaced(callback) || null;

  return {
    messages,
    refreshMessages,
    clearMessages,
    prependMessage,
    replaceMessages,
    onMessageAppend,
    onMessageClear,
    onMessagesReplaced,
  };
}
