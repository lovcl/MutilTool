const fs = require('fs');
const path = require('path');
const {
  REMINDER_TOAST,
  isReminderSnoozedToday,
  snoozeReminderToday,
  msUntilSnoozeExpires,
} = require('./reminderSnooze');

const createTaskManagerModule = ({
  userDataPath,
  loadAppSettings,
  saveAppSettings,
  getMainWindow,
  showActionReminder,
  activityLog,
}) => {
  const tasksPath = path.join(userDataPath, 'tasks.json');
  let reminderTimer = null;
  let pendingReminderTaskId = null;

  const getConfig = () => require('../app.rules.config.json').tasks;

  const loadTasks = () => {
    if (!fs.existsSync(tasksPath)) {
      return [];
    }

    try {
      const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
      return Array.isArray(tasks) ? tasks : [];
    } catch (error) {
      console.error('[tasks] 读取失败:', error.message);
      return [];
    }
  };

  const saveTasks = (tasks) => {
    fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
    getMainWindow()?.webContents.send('tasks:changed', tasks);
  };

  const formatDueAt = (value) => {
    const date = new Date(value);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${month}-${day} ${hour}:${minute}`;
  };

  const formatRemaining = (dueAt) => {
    const diffMs = new Date(dueAt).getTime() - Date.now();
    if (diffMs <= 0) {
      return '已到期';
    }

    const totalMinutes = Math.ceil(diffMs / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes} 分钟`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  };

  const getTaskReminderEnabled = () => {
    const settings = loadAppSettings();
    if (typeof settings.taskReminderEnabled === 'boolean') {
      return settings.taskReminderEnabled;
    }

    return Boolean(getConfig().reminderDefaultEnabled);
  };

  const setTaskReminderEnabled = (enabled) => {
    saveAppSettings({
      ...loadAppSettings(),
      taskReminderEnabled: Boolean(enabled),
    });

    if (Boolean(enabled)) {
      scheduleNextTaskReminder();
    } else {
      clearTaskReminderTimer();
    }

    return getTaskReminderEnabled();
  };

  const clearTaskReminderTimer = () => {
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = null;
    }
  };

  const normalizeTask = (task) => ({
    id: task.id,
    title: String(task.title || '').trim(),
    description: String(task.description || '').trim(),
    dueAt: task.dueAt,
    completed: Boolean(task.completed),
    completedAt: task.completedAt || null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    remindedLeadMinutes: Array.isArray(task.remindedLeadMinutes) ? task.remindedLeadMinutes : [],
    snoozeUntil: task.snoozeUntil || null,
  });

  const getReminderCandidate = (now = Date.now()) => {
    const config = getConfig();
    const leadMinutes = config.reminderLeadMinutes || [30];
    let best = null;

    loadTasks()
      .map(normalizeTask)
      .filter((task) => !task.completed && task.dueAt)
      .forEach((task) => {
        const dueMs = new Date(task.dueAt).getTime();
        if (Number.isNaN(dueMs)) {
          return;
        }

        if (task.snoozeUntil) {
          const snoozeMs = new Date(task.snoozeUntil).getTime();
          if (snoozeMs > now) {
            if (!best || snoozeMs < best.remindAt) {
              best = { task, remindAt: snoozeMs, kind: 'snooze' };
            }
            return;
          }
        }

        leadMinutes.forEach((lead) => {
          if (task.remindedLeadMinutes.includes(lead)) {
            return;
          }

          const remindAt = dueMs - lead * 60000;
          if (remindAt > now && (!best || remindAt < best.remindAt)) {
            best = { task, remindAt, kind: 'lead', leadMinutes: lead };
          }
        });

        if (dueMs <= now && !task.remindedLeadMinutes.includes(0)) {
          const remindAt = now + 1000;
          if (!best || remindAt < best.remindAt) {
            best = { task, remindAt, kind: 'due', leadMinutes: 0 };
          }
        }
      });

    return best;
  };

  const scheduleNextTaskReminder = () => {
    clearTaskReminderTimer();

    if (!getTaskReminderEnabled()) {
      return;
    }

    if (isReminderSnoozedToday(loadAppSettings, 'task')) {
      const delayMs = msUntilSnoozeExpires(loadAppSettings, 'task');
      if (delayMs > 0) {
        reminderTimer = setTimeout(() => {
          reminderTimer = null;
          scheduleNextTaskReminder();
        }, delayMs);
      }
      return;
    }

    const candidate = getReminderCandidate();
    if (!candidate) {
      return;
    }

    const delayMs = Math.max(candidate.remindAt - Date.now(), 1000);
    reminderTimer = setTimeout(() => {
      reminderTimer = null;
      showTaskReminder(candidate);
    }, delayMs);

    console.log(`[task-reminder] 下次提醒: ${new Date(candidate.remindAt).toLocaleString()}`);
  };

  const markTaskReminderSent = (taskId, leadMinutes) => {
    const tasks = loadTasks().map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      const remindedLeadMinutes = Array.from(
        new Set([...(task.remindedLeadMinutes || []), leadMinutes])
      );

      return {
        ...task,
        remindedLeadMinutes,
        snoozeUntil: null,
        updatedAt: new Date().toISOString(),
      };
    });

    saveTasks(tasks);
  };

  const snoozeTaskReminder = (taskId) => {
    const config = getConfig();
    const snoozeUntil = new Date(Date.now() + (config.reminderSnoozeMinutes || 15) * 60000).toISOString();
    const tasks = loadTasks().map((task) =>
      task.id === taskId
        ? {
            ...task,
            snoozeUntil,
            updatedAt: new Date().toISOString(),
          }
        : task
    );

    saveTasks(tasks);
    return snoozeUntil;
  };

  const completeTask = (taskId) => {
    const tasks = loadTasks().map((task) =>
      task.id === taskId
        ? {
            ...task,
            completed: true,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : task
    );

    saveTasks(tasks);
    return tasks.find((task) => task.id === taskId) || null;
  };

  const showTaskReminder = async (candidate, options = {}) => {
    if (!options.force && !getTaskReminderEnabled()) {
      return;
    }

    if (!options.force && !options.isTest && isReminderSnoozedToday(loadAppSettings, 'task')) {
      scheduleNextTaskReminder();
      return;
    }

    const config = getConfig();
    const reminder = config.reminder;
    const task = normalizeTask(candidate.task);
    pendingReminderTaskId = task.id;

    const detail = `${reminder.detailTemplate
      .replace('{title}', task.title)
      .replace('{dueAt}', formatDueAt(task.dueAt))
      .replace('{remaining}', formatRemaining(task.dueAt))}${task.description ? `\n\n备注：${task.description}` : ''}`;

    const response = await showActionReminder({
      title: options.isTest ? `[预览] ${reminder.title}` : reminder.title,
      body: detail,
      buttons: reminder.buttons,
      cancelIndex: 1,
      theme: 'task',
      meta: {
        taskId: task.id,
        taskTitle: task.title,
        leadMinutes: candidate.leadMinutes ?? 0,
      },
      messageTracking: {
        category: 'task',
        kind: options.isTest ? 'test' : 'deadline',
        isTest: Boolean(options.isTest),
      },
    });

    pendingReminderTaskId = null;

    if (options.isTest) {
      return;
    }

    if (response === REMINDER_TOAST.SNOOZE_TODAY) {
      snoozeReminderToday(loadAppSettings, saveAppSettings, 'task');
      activityLog?.appendLog({
        category: 'task',
        action: 'snooze-today',
        title: '任务提醒',
        summary: '已设置今日不再提醒任务',
        detail: { taskId: task.id },
      });
      scheduleNextTaskReminder();
      return;
    }

    if (response === REMINDER_TOAST.CLOSED || response < 0) {
      scheduleNextTaskReminder();
      return;
    }

    if (response === 2) {
      const completedTask = completeTask(task.id);
      activityLog?.appendLog({
        category: 'task',
        action: 'complete',
        title: '任务已完成',
        summary: `系统提醒后标记完成：${completedTask?.title || task.title}`,
        detail: { taskId: task.id, source: 'reminder' },
      });
      getMainWindow()?.webContents.send('tasks:changed', loadTasks());
    } else if (response === 1) {
      snoozeTaskReminder(task.id);
      activityLog?.appendLog({
        category: 'task',
        action: 'snooze',
        title: '任务提醒延后',
        summary: `稍后提醒：${task.title}`,
        detail: { taskId: task.id },
      });
    } else if (response >= 0) {
      markTaskReminderSent(task.id, candidate.leadMinutes ?? 0);
      activityLog?.appendLog({
        category: 'task',
        action: 'reminder',
        title: '任务截止提醒',
        summary: `已知悉：${task.title}（${formatDueAt(task.dueAt)}）`,
        detail: { taskId: task.id },
      });
    }

    scheduleNextTaskReminder();
  };

  const createTask = (payload) => {
    const now = new Date().toISOString();
    const task = normalizeTask({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: payload.title,
      description: payload.description || '',
      dueAt: payload.dueAt,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      remindedLeadMinutes: [],
      snoozeUntil: null,
    });

    if (!task.title || !task.dueAt) {
      throw new Error('任务标题和截止时间不能为空');
    }

    const tasks = [task, ...loadTasks()];
    saveTasks(tasks);
    scheduleNextTaskReminder();

    activityLog?.appendLog({
      category: 'task',
      action: 'create',
      title: '新建任务',
      summary: `${task.title}，截止 ${formatDueAt(task.dueAt)}`,
      detail: { task },
    });

    return task;
  };

  const updateTask = (taskId, payload) => {
    let updatedTask = null;
    const tasks = loadTasks().map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      updatedTask = normalizeTask({
        ...task,
        ...payload,
        id: task.id,
        createdAt: task.createdAt,
        updatedAt: new Date().toISOString(),
        remindedLeadMinutes: payload.dueAt && payload.dueAt !== task.dueAt ? [] : task.remindedLeadMinutes || [],
        snoozeUntil: payload.dueAt && payload.dueAt !== task.dueAt ? null : task.snoozeUntil || null,
      });

      return updatedTask;
    });

    if (!updatedTask) {
      throw new Error('任务不存在');
    }

    saveTasks(tasks);
    scheduleNextTaskReminder();

    activityLog?.appendLog({
      category: 'task',
      action: 'update',
      title: '更新任务',
      summary: `${updatedTask.title}，截止 ${formatDueAt(updatedTask.dueAt)}`,
      detail: { task: updatedTask },
    });

    return updatedTask;
  };

  const deleteTask = (taskId) => {
    const tasks = loadTasks();
    const target = tasks.find((task) => task.id === taskId);
    if (!target) {
      throw new Error('任务不存在');
    }

    saveTasks(tasks.filter((task) => task.id !== taskId));
    scheduleNextTaskReminder();

    activityLog?.appendLog({
      category: 'task',
      action: 'delete',
      title: '删除任务',
      summary: target.title,
      detail: { taskId },
    });

    return true;
  };

  const toggleTaskComplete = (taskId, completed) => {
    let updatedTask = null;
    const nextCompleted = Boolean(completed);
    const tasks = loadTasks().map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      updatedTask = normalizeTask({
        ...task,
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
        snoozeUntil: nextCompleted ? null : task.snoozeUntil,
      });

      return updatedTask;
    });

    if (!updatedTask) {
      throw new Error('任务不存在');
    }

    saveTasks(tasks);
    scheduleNextTaskReminder();

    activityLog?.appendLog({
      category: 'task',
      action: nextCompleted ? 'complete' : 'reopen',
      title: nextCompleted ? '任务已完成' : '任务重新打开',
      summary: `${updatedTask.title}（${nextCompleted ? '已完成' : '未完成'}）`,
      detail: { task: updatedTask },
    });

    return updatedTask;
  };

  return {
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    toggleTaskComplete,
    getTaskReminderEnabled,
    setTaskReminderEnabled,
    scheduleNextTaskReminder,
    clearTaskReminderTimer,
    showTestReminder: () =>
      showTaskReminder(
        {
          task: {
            id: '__test__',
            title: '测试任务：整理本周考勤记录',
            description: '这是用于预览任务截止提醒弹窗的示例。',
            dueAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            completed: false,
          },
          leadMinutes: 30,
        },
        { force: true, isTest: true }
      ),
  };
};

module.exports = { createTaskManagerModule };
