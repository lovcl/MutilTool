import { ref } from 'vue';
import { CALENDAR_YEAR } from '../data/workCalendar';

const selectedMonth = ref(new Date().getFullYear() === CALENDAR_YEAR ? new Date().getMonth() : 0);

export function useCalendarState() {
  const setMonth = (offset) => {
    const nextMonth = selectedMonth.value + offset;
    if (nextMonth < 0 || nextMonth > 11) {
      return;
    }

    selectedMonth.value = nextMonth;
  };

  const goToMonth = (month) => {
    if (month >= 0 && month <= 11) {
      selectedMonth.value = month;
    }
  };

  return {
    selectedMonth,
    setMonth,
    goToMonth,
  };
}
