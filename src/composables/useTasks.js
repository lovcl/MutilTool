import { ref } from 'vue';
import { APP_RULES_CONFIG } from '../data/workCalendar';

const electronAPI = window.electronAPI;

export const tasks = ref([]);
const taskReminderEnabled = ref(APP_RULES_CONFIG.tasks.reminderDefaultEnabled);
const taskReminderLoading = ref(false);
let initialized = false;

export const hydrateTasks = async () => {
  if (electronAPI?.tasks?.getAll) {
    tasks.value = await electronAPI.tasks.getAll();
    return;
  }

  tasks.value = JSON.parse(localStorage.getItem('tasks') || '[]');
};

const persistFallbackTasks = () => {
  if (!electronAPI?.tasks) {
    localStorage.setItem('tasks', JSON.stringify(tasks.value));
  }
};

export function useTasks() {
  if (!initialized) {
    hydrateTasks();
    initialized = true;
  }

  const loadTaskReminderStatus = async () => {
    if (!electronAPI?.tasks?.getReminderEnabled) {
      return;
    }

    taskReminderEnabled.value = await electronAPI.tasks.getReminderEnabled();
  };

  const updateTaskReminder = async (enabled) => {
    if (!electronAPI?.tasks?.setReminderEnabled) {
      taskReminderEnabled.value = Boolean(enabled);
      return;
    }

    taskReminderLoading.value = true;
    try {
      taskReminderEnabled.value = await electronAPI.tasks.setReminderEnabled(enabled);
    } finally {
      taskReminderLoading.value = false;
    }
  };

  const syncTasks = (nextTasks) => {
    tasks.value = Array.isArray(nextTasks) ? nextTasks : [];
    persistFallbackTasks();
  };

  const createTask = async (payload) => {
    if (electronAPI?.tasks?.create) {
      const task = await electronAPI.tasks.create(payload);
      tasks.value = [task, ...tasks.value.filter((item) => item.id !== task.id)];
      return task;
    }

    const task = {
      id: `${Date.now()}`,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      remindedLeadMinutes: [],
      snoozeUntil: null,
      description: '',
      ...payload,
    };
    tasks.value = [task, ...tasks.value];
    persistFallbackTasks();
    return task;
  };

  const updateTask = async (taskId, payload) => {
    if (electronAPI?.tasks?.update) {
      const task = await electronAPI.tasks.update(taskId, payload);
      tasks.value = tasks.value.map((item) => (item.id === taskId ? task : item));
      return task;
    }

    tasks.value = tasks.value.map((item) =>
      item.id === taskId
        ? { ...item, ...payload, updatedAt: new Date().toISOString() }
        : item
    );
    persistFallbackTasks();
    return tasks.value.find((item) => item.id === taskId) || null;
  };

  const deleteTask = async (taskId) => {
    if (electronAPI?.tasks?.delete) {
      await electronAPI.tasks.delete(taskId);
    }

    tasks.value = tasks.value.filter((item) => item.id !== taskId);
    persistFallbackTasks();
  };

  const toggleTaskComplete = async (taskId, completed) => {
    if (electronAPI?.tasks?.toggleComplete) {
      const task = await electronAPI.tasks.toggleComplete(taskId, completed);
      tasks.value = tasks.value.map((item) => (item.id === taskId ? task : item));
      return task;
    }

    tasks.value = tasks.value.map((item) =>
      item.id === taskId
        ? {
            ...item,
            completed: Boolean(completed),
            completedAt: completed ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString(),
          }
        : item
    );
    persistFallbackTasks();
    return tasks.value.find((item) => item.id === taskId) || null;
  };

  const onTasksChanged = (callback) => electronAPI?.tasks?.onChanged(callback) || null;

  const onTasksNavigate = (callback) => electronAPI?.tasks?.onNavigate(callback) || null;

  return {
    tasks,
    taskReminderEnabled,
    taskReminderLoading,
    refreshTasks: hydrateTasks,
    loadTaskReminderStatus,
    updateTaskReminder,
    syncTasks,
    createTask,
    updateTask,
    deleteTask,
    toggleTaskComplete,
    onTasksChanged,
    onTasksNavigate,
  };
}
