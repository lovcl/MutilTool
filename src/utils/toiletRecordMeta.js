export const BOWEL_STATUS = {
  NORMAL: 'normal',
  CONSTIPATION: 'constipation',
  DIARRHEA: 'diarrhea',
  CUSTOM: 'custom',
};

export const BOWEL_STATUS_OPTIONS = [
  { value: BOWEL_STATUS.NORMAL, label: '大便正常' },
  { value: BOWEL_STATUS.CONSTIPATION, label: '便秘' },
  { value: BOWEL_STATUS.DIARRHEA, label: '腹泻' },
  { value: BOWEL_STATUS.CUSTOM, label: '自定义' },
];

export const DEFAULT_BOWEL_STATUS = BOWEL_STATUS.NORMAL;

export const getBowelStatusLabel = (status, customText = '') => {
  if (status === BOWEL_STATUS.CUSTOM) {
    const text = String(customText || '').trim();
    return text || '自定义';
  }

  return BOWEL_STATUS_OPTIONS.find((option) => option.value === status)?.label || '大便正常';
};

export const getBowelStatusTagType = (status) => {
  if (status === BOWEL_STATUS.CONSTIPATION) {
    return 'warning';
  }

  if (status === BOWEL_STATUS.DIARRHEA) {
    return 'danger';
  }

  if (status === BOWEL_STATUS.CUSTOM) {
    return 'info';
  }

  return 'success';
};

export const getBowelRecordSummary = (record) =>
  getBowelStatusLabel(record?.bowelStatus, record?.bowelCustomText);

export const URINATION_STATUS = {
  NORMAL: 'normal',
  ODOR: 'odor',
  COLOR_ABNORMAL: 'color_abnormal',
};

export const URINATION_STATUS_OPTIONS = [
  { value: URINATION_STATUS.NORMAL, label: '正常' },
  { value: URINATION_STATUS.ODOR, label: '小便异味' },
  { value: URINATION_STATUS.COLOR_ABNORMAL, label: '小便颜色异常' },
];

export const URINATION_COLOR_OPTIONS = [
  { value: 'deep_yellow', label: '深黄色' },
  { value: 'orange', label: '橙黄色' },
  { value: 'red', label: '红色/偏红' },
  { value: 'brown', label: '棕色' },
  { value: 'green', label: '绿色' },
  { value: 'cloudy', label: '浑浊发白' },
];

export const DEFAULT_URINATION_STATUS = URINATION_STATUS.NORMAL;

export const getUrinationColorLabel = (color) =>
  URINATION_COLOR_OPTIONS.find((option) => option.value === color)?.label || '';

export const getUrinationStatusLabel = (status, color = null) => {
  if (status === URINATION_STATUS.ODOR) {
    return '小便异味';
  }

  if (status === URINATION_STATUS.COLOR_ABNORMAL) {
    const colorLabel = getUrinationColorLabel(color);
    return colorLabel ? `颜色异常 · ${colorLabel}` : '小便颜色异常';
  }

  return '正常';
};

export const getUrinationStatusTagType = (status) => {
  if (status === URINATION_STATUS.ODOR) {
    return 'warning';
  }

  if (status === URINATION_STATUS.COLOR_ABNORMAL) {
    return 'danger';
  }

  return 'success';
};

export const getUrinationRecordSummary = (record) =>
  getUrinationStatusLabel(record?.urinationStatus, record?.urinationColor);
