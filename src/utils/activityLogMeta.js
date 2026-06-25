export const LOG_CATEGORIES = {
  attendance: { label: '考勤打卡', tagType: 'primary' },
  water: { label: '喝水', tagType: 'success' },
  toilet: { label: '如厕', tagType: 'success' },
  task: { label: '任务', tagType: 'warning' },
  memo: { label: '备忘录', tagType: 'warning' },
  vault: { label: '文件管理', tagType: 'info' },
  system: { label: '系统', tagType: 'info' },
};

export const formatLogTime = (value) => {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${month}-${day} ${hour}:${minute}:${second}`;
};

export const buildAttendanceLogSummary = (dateKey, record) => {
  const sourceText =
    record.source === 'reminder' ? '系统提醒' : record.source === 'import' ? '导入' : '手动';
  const startTime = record.attendance?.checkInTime || record.startTime || '--:--';
  const endTime = record.endTime || '--:--';
  const hours = Number(record.hours || 0).toFixed(1);

  return `${dateKey} ${startTime}-${endTime}，绩效 ${hours}h（${sourceText}）`;
};

export const buildWaterLogSummary = (record) => {
  const actionTextMap = {
    drink: '已喝水',
    later: '稍后提醒',
    skip: '此次不喝',
  };
  const actionText = actionTextMap[record.action] || record.action;
  const sourceText =
    record.source === 'manual'
      ? '手动补录'
      : record.source === 'later-follow-up'
        ? '稍后跟进'
        : '系统提醒';
  const timeLabel = record.scheduledLabel ? `提醒 ${record.scheduledLabel}` : '手动记录';

  return `${timeLabel} · ${actionText}（${sourceText}）`;
};

export const buildAttendanceDeleteSummary = (dateKey) => `已删除 ${dateKey} 的考勤/绩效记录`;

export const buildAttendanceImportSummary = (count, skippedCount = 0) =>
  `导入 ${count} 条考勤记录${skippedCount ? `，跳过 ${skippedCount} 条` : ''}`;

export const buildAttendanceExportSummary = (count) => `导出 ${count} 条考勤记录到 Excel`;
