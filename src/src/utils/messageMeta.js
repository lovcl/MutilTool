import { LOG_CATEGORIES, formatLogTime } from './activityLogMeta';

export const MESSAGE_CATEGORIES = {
  attendance: LOG_CATEGORIES.attendance,
  water: LOG_CATEGORIES.water,
  toilet: LOG_CATEGORIES.toilet,
  task: LOG_CATEGORIES.task,
};

export const REMINDER_KIND_LABELS = {
  morning: '上班打卡',
  early: '下班打卡',
  late: '绩效打卡',
  urination: '小便',
  bowel: '大便',
  deadline: '截止提醒',
  test: '测试',
};

export const formatMessageTime = formatLogTime;

export const getMessageKindLabel = (kind) => REMINDER_KIND_LABELS[kind] || kind || '';

export const buildMessageActionText = (message) => {
  if (message?.response?.label) {
    return `操作：${message.response.label}`;
  }

  return '未记录操作';
};

export const splitMessageBody = (body) => {
  const text = String(body || '').trim();
  if (!text) {
    return { lead: '', detail: '' };
  }

  const parts = text.split('\n\n');
  return {
    lead: parts[0] || '',
    detail: parts.slice(1).join('\n\n').trim(),
  };
};
