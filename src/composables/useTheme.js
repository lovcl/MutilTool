import { computed, ref, watch } from 'vue';
import { Moon, Monitor, Sunny } from '@element-plus/icons-vue';
import { APP_RULES_CONFIG } from '../data/workCalendar';

const themeMode = ref(localStorage.getItem('theme-mode') || APP_RULES_CONFIG.app.themeDefaultMode);
const systemDark = ref(false);
let colorSchemeQuery = null;
let initialized = false;

const themeIconMap = {
  system: Monitor,
  light: Sunny,
  dark: Moon,
};

const themeOptions = APP_RULES_CONFIG.app.themeModes.map((option) => ({
  ...option,
  icon: themeIconMap[option.value] || Monitor,
}));

const resolvedTheme = computed(() =>
  themeMode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : themeMode.value
);

const activeThemeLabel = computed(
  () => themeOptions.find((option) => option.value === themeMode.value)?.label || themeOptions[0]?.label || ''
);

const activeThemeDescription = computed(
  () => themeOptions.find((option) => option.value === themeMode.value)?.description || ''
);

const resolvedThemeLabel = computed(
  () => themeOptions.find((option) => option.value === resolvedTheme.value)?.label || resolvedTheme.value
);

const applyTheme = () => {
  const theme = resolvedTheme.value;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

export const reloadThemeFromStorage = () => {
  themeMode.value = localStorage.getItem('theme-mode') || APP_RULES_CONFIG.app.themeDefaultMode;
  applyTheme();
};

const handleSystemThemeChange = (event) => {
  systemDark.value = event.matches;
};

export function useTheme() {
  if (!initialized) {
    watch(themeMode, (value) => {
      localStorage.setItem('theme-mode', value);
      applyTheme();
    });

    watch(resolvedTheme, applyTheme);
    initialized = true;
  }

  const initTheme = () => {
    colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    systemDark.value = Boolean(colorSchemeQuery?.matches);
    colorSchemeQuery?.addEventListener('change', handleSystemThemeChange);
    applyTheme();
  };

  const destroyTheme = () => {
    colorSchemeQuery?.removeEventListener('change', handleSystemThemeChange);
  };

  return {
    themeMode,
    themeOptions,
    resolvedTheme,
    activeThemeLabel,
    activeThemeDescription,
    resolvedThemeLabel,
    initTheme,
    destroyTheme,
  };
}
