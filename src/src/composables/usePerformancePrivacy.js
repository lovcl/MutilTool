import { ref } from 'vue';
import { formatHours } from '../utils/time';

export const PRIVATE_MASK = '---';
const STORAGE_KEY = 'performance-privacy-visible';

const performancePrivacyVisible = ref(localStorage.getItem(STORAGE_KEY) !== '0');

export function usePerformancePrivacy() {
  const togglePerformancePrivacy = () => {
    performancePrivacyVisible.value = !performancePrivacyVisible.value;
    localStorage.setItem(STORAGE_KEY, performancePrivacyVisible.value ? '1' : '0');
  };

  const showPrivate = (value, mask = PRIVATE_MASK) =>
    performancePrivacyVisible.value ? value : mask;

  const showPrivateHoursText = (hours) =>
    performancePrivacyVisible.value ? `${formatHours(hours)} h` : PRIVATE_MASK;

  const showPrivateHoursPair = (completed, target) =>
    performancePrivacyVisible.value
      ? `${formatHours(completed)} / ${formatHours(target)} h`
      : PRIVATE_MASK;

  return {
    performancePrivacyVisible,
    togglePerformancePrivacy,
    showPrivate,
    showPrivateHoursText,
    showPrivateHoursPair,
    PRIVATE_MASK,
  };
}
