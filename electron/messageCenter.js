const fs = require('fs');
const path = require('path');
const { REMINDER_TOAST } = require('./reminderSnooze');

const MAX_MESSAGES = 2000;

const formatReminderResponse = (response, buttons = []) => {
  if (response === REMINDER_TOAST.SNOOZE_TODAY) {
    return { code: 'snooze-today', label: '今日不再提醒' };
  }

  if (response === REMINDER_TOAST.CLOSED || response < 0) {
    return { code: 'close', label: '关闭' };
  }

  return {
    code: String(response),
    label: buttons[response] || `选项 ${response + 1}`,
  };
};

const createMessageCenterModule = ({ userDataPath, getMainWindow }) => {
  const messagesPath = path.join(userDataPath, 'messages.json');

  const loadMessages = () => {
    if (!fs.existsSync(messagesPath)) {
      return [];
    }

    try {
      const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
      return Array.isArray(messages) ? messages : [];
    } catch (error) {
      console.error('[message-center] 读取失败:', error.message);
      return [];
    }
  };

  const saveMessages = (messages) => {
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
  };

  const normalizeMessage = (message) => ({
    id: message.id,
    category: message.category,
    kind: message.kind || null,
    title: String(message.title || '').trim(),
    body: String(message.body || ''),
    buttons: Array.isArray(message.buttons) ? message.buttons : [],
    theme: message.theme || 'default',
    meta: message.meta || null,
    isTest: Boolean(message.isTest),
    shownAt: message.shownAt,
    response: message.response
      ? {
          code: message.response.code,
          label: message.response.label,
          respondedAt: message.response.respondedAt,
        }
      : null,
  });

  const recordReminder = ({
    category,
    kind = null,
    isTest = false,
    title,
    body,
    buttons = [],
    theme = 'default',
    meta = null,
    response,
    shownAt,
  }) => {
    if (!category) {
      return null;
    }

    const respondedAt = new Date().toISOString();
    const message = normalizeMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      kind,
      isTest,
      title,
      body,
      buttons,
      theme,
      meta,
      shownAt: shownAt || respondedAt,
      response: {
        ...formatReminderResponse(response, buttons),
        respondedAt,
      },
    });

    const messages = loadMessages();
    messages.unshift(message);

    if (messages.length > MAX_MESSAGES) {
      messages.length = MAX_MESSAGES;
    }

    saveMessages(messages);
    getMainWindow()?.webContents.send('messages:append', message);

    return message;
  };

  const clearMessages = () => {
    saveMessages([]);
    getMainWindow()?.webContents.send('messages:clear');
  };

  const replaceMessages = (messages = []) => {
    const normalized = Array.isArray(messages) ? messages.map(normalizeMessage) : [];
    saveMessages(normalized);
    getMainWindow()?.webContents.send('messages:replaced', normalized);
    return normalized;
  };

  return {
    loadMessages,
    recordReminder,
    clearMessages,
    replaceMessages,
    formatReminderResponse,
  };
};

module.exports = { createMessageCenterModule, formatReminderResponse };
