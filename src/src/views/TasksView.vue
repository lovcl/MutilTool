<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Calendar,
  CircleCheck,
  Clock,
  CopyDocument,
  Hide,
  Plus,
  View,
} from '@element-plus/icons-vue';
import { APP_RULES_CONFIG } from '../data/workCalendar';
import { useTasks } from '../composables/useTasks';
import {
  getMemoCategoryLabel,
  MEMO_CATEGORY_OPTIONS,
  useMemos,
} from '../composables/useMemos';
import AppSwitch from '../components/common/AppSwitch.vue';

const taskRules = APP_RULES_CONFIG.tasks;
const activeSection = ref('tasks');
const statusFilter = ref('pending');
const dialogVisible = ref(false);
const editingTaskId = ref(null);
const memoDialogVisible = ref(false);
const editingMemoId = ref(null);
const memoSearch = ref('');
const memoCategoryFilter = ref('all');
const revealedMemoIds = ref(new Set());

const {
  tasks,
  taskReminderEnabled,
  taskReminderLoading,
  refreshTasks,
  loadTaskReminderStatus,
  updateTaskReminder,
  syncTasks,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskComplete,
  onTasksChanged,
} = useTasks();

const {
  memos,
  refreshMemos,
  syncMemos,
  createMemo,
  updateMemo,
  deleteMemo,
  onMemosChanged,
} = useMemos();

const emptyForm = () => ({
  title: '',
  description: '',
  dueAt: '',
});

const emptyMemoForm = () => ({
  title: '',
  content: '',
  category: 'password',
  isSensitive: true,
});

const taskForm = ref(emptyForm());
const memoForm = ref(emptyMemoForm());

const statusOptions = [
  { label: '未完成', value: 'pending' },
  { label: '已完成', value: 'completed' },
  { label: '全部', value: 'all' },
];

const memoCategoryFilterOptions = [
  { label: '全部分类', value: 'all' },
  ...MEMO_CATEGORY_OPTIONS,
];

const formatDateTime = (value) => {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${month}-${day} ${hour}:${minute}`;
};

const getRemainingText = (dueAt, completed) => {
  if (completed) {
    return '已完成';
  }

  const diffMs = new Date(dueAt).getTime() - Date.now();
  if (diffMs <= 0) {
    return '已逾期';
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes < 60) {
    return `剩余 ${totalMinutes} 分钟`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `剩余 ${hours} 小时 ${minutes} 分钟` : `剩余 ${hours} 小时`;
};

const getTaskStatus = (task) => {
  if (task.completed) {
    return { label: '已完成', type: 'success' };
  }

  if (new Date(task.dueAt).getTime() <= Date.now()) {
    return { label: '已逾期', type: 'danger' };
  }

  const diffMs = new Date(task.dueAt).getTime() - Date.now();
  if (diffMs <= 24 * 60 * 60 * 1000) {
    return { label: '即将到期', type: 'warning' };
  }

  return { label: '进行中', type: 'primary' };
};

const filteredTasks = computed(() => {
  const sorted = [...tasks.value].sort((left, right) => {
    if (left.completed !== right.completed) {
      return Number(left.completed) - Number(right.completed);
    }

    return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
  });

  if (statusFilter.value === 'completed') {
    return sorted.filter((task) => task.completed);
  }

  if (statusFilter.value === 'pending') {
    return sorted.filter((task) => !task.completed);
  }

  return sorted;
});

const filteredMemos = computed(() => {
  const keyword = memoSearch.value.trim().toLowerCase();

  return [...memos.value]
    .filter((memo) => {
      if (memoCategoryFilter.value !== 'all' && memo.category !== memoCategoryFilter.value) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return (
        memo.title.toLowerCase().includes(keyword) ||
        memo.content.toLowerCase().includes(keyword)
      );
    })
    .sort(
      (left, right) =>
        new Date(right.updatedAt || right.createdAt).getTime() -
        new Date(left.updatedAt || left.createdAt).getTime()
    );
});

const stats = computed(() => ({
  total: tasks.value.length,
  pending: tasks.value.filter((task) => !task.completed).length,
  completed: tasks.value.filter((task) => task.completed).length,
  overdue: tasks.value.filter(
    (task) => !task.completed && new Date(task.dueAt).getTime() <= Date.now()
  ).length,
}));

const memoStats = computed(() => ({
  total: memos.value.length,
  password: memos.value.filter((memo) => memo.category === 'password').length,
  account: memos.value.filter((memo) => memo.category === 'account').length,
  sensitive: memos.value.filter((memo) => memo.isSensitive).length,
}));

const reminderLeadText = computed(() =>
  (taskRules.reminderLeadMinutes || []).map((minute) => `${minute} 分钟`).join(' / ')
);

const openCreateDialog = () => {
  editingTaskId.value = null;
  taskForm.value = emptyForm();
  dialogVisible.value = true;
};

const openEditDialog = (task) => {
  editingTaskId.value = task.id;
  taskForm.value = {
    title: task.title,
    description: task.description || '',
    dueAt: task.dueAt,
  };
  dialogVisible.value = true;
};

const openCreateMemoDialog = () => {
  editingMemoId.value = null;
  memoForm.value = emptyMemoForm();
  memoDialogVisible.value = true;
};

const openEditMemoDialog = (memo) => {
  editingMemoId.value = memo.id;
  memoForm.value = {
    title: memo.title,
    content: memo.content || '',
    category: memo.category || 'note',
    isSensitive: Boolean(memo.isSensitive),
  };
  memoDialogVisible.value = true;
};

watch(
  () => memoForm.value.category,
  (category) => {
    if (!editingMemoId.value && category === 'password') {
      memoForm.value.isSensitive = true;
    }
  }
);

const saveTask = async () => {
  if (!taskForm.value.title.trim() || !taskForm.value.dueAt) {
    ElMessage.warning('请填写任务标题和截止时间');
    return;
  }

  if (editingTaskId.value) {
    await updateTask(editingTaskId.value, { ...taskForm.value });
    ElMessage.success('任务已更新');
  } else {
    await createTask({ ...taskForm.value });
    ElMessage.success('任务已创建');
  }

  dialogVisible.value = false;
};

const saveMemo = async () => {
  if (!memoForm.value.title.trim()) {
    ElMessage.warning('请填写标题');
    return;
  }

  const payload = {
    title: memoForm.value.title.trim(),
    content: memoForm.value.content,
    category: memoForm.value.category,
    isSensitive: memoForm.value.isSensitive,
  };

  if (editingMemoId.value) {
    await updateMemo(editingMemoId.value, payload);
    ElMessage.success('备忘录已更新');
  } else {
    await createMemo(payload);
    ElMessage.success('备忘录已创建');
  }

  memoDialogVisible.value = false;
};

const handleToggleComplete = async (task) => {
  await toggleTaskComplete(task.id, !task.completed);
  ElMessage.success(task.completed ? '已标记为未完成' : '已标记为完成');
};

const handleDelete = async (task) => {
  try {
    await ElMessageBox.confirm(`确定删除任务「${task.title}」吗？`, '删除任务', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await deleteTask(task.id);
    ElMessage.success('任务已删除');
  } catch {
    // cancelled
  }
};

const handleDeleteMemo = async (memo) => {
  try {
    await ElMessageBox.confirm(`确定删除备忘录「${memo.title}」吗？`, '删除备忘录', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await deleteMemo(memo.id);
    revealedMemoIds.value.delete(memo.id);
    ElMessage.success('备忘录已删除');
  } catch {
    // cancelled
  }
};

const maskContent = (content) => '•'.repeat(Math.min(Math.max(String(content || '').length, 8), 24));

const isMemoRevealed = (memoId) => revealedMemoIds.value.has(memoId);

const toggleMemoReveal = (memoId) => {
  const next = new Set(revealedMemoIds.value);
  if (next.has(memoId)) {
    next.delete(memoId);
  } else {
    next.add(memoId);
  }
  revealedMemoIds.value = next;
};

const getMemoDisplayContent = (memo) => {
  if (!memo.content) {
    return '（无内容）';
  }

  if (memo.isSensitive && !isMemoRevealed(memo.id)) {
    return maskContent(memo.content);
  }

  return memo.content;
};

const copyMemoContent = async (memo) => {
  if (!memo.content) {
    ElMessage.info('暂无内容可复制');
    return;
  }

  try {
    await navigator.clipboard.writeText(memo.content);
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.error('复制失败，请手动选择内容');
  }
};

const getMemoCategoryTagType = (category) => {
  if (category === 'password') {
    return 'danger';
  }

  if (category === 'account') {
    return 'warning';
  }

  return 'info';
};

let removeTasksChangedListener = null;
let removeMemosChangedListener = null;

onMounted(async () => {
  await Promise.all([refreshTasks(), refreshMemos(), loadTaskReminderStatus()]);
  removeTasksChangedListener = onTasksChanged((nextTasks) => syncTasks(nextTasks));
  removeMemosChangedListener = onMemosChanged((nextMemos) => syncMemos(nextMemos));
});

onBeforeUnmount(() => {
  removeTasksChangedListener?.();
  removeMemosChangedListener?.();
});
</script>

<template>
  <section class="tasks-layout">
    <header class="header">
      <div>
        <p class="eyebrow">工作规划</p>
        <h2>任务管理</h2>
      </div>
      <div class="header-actions">
        <el-button
          v-if="activeSection === 'tasks'"
          type="primary"
          :icon="Plus"
          @click="openCreateDialog"
        >
          新建任务
        </el-button>
        <el-button
          v-else
          type="primary"
          :icon="Plus"
          @click="openCreateMemoDialog"
        >
          新建备忘录
        </el-button>
      </div>
    </header>

    <div class="tasks-section-tabs">
      <el-radio-group v-model="activeSection" size="large">
        <el-radio-button value="tasks">工作任务</el-radio-button>
        <el-radio-button value="memos">备忘录</el-radio-button>
      </el-radio-group>
    </div>

    <template v-if="activeSection === 'tasks'">
      <div class="tasks-stats">
        <article class="summary-card work tasks-stat-card">
          <el-icon><Calendar /></el-icon>
          <div>
            <span>全部任务</span>
            <strong>{{ stats.total }} 项</strong>
          </div>
        </article>
        <article class="summary-card attendance tasks-stat-card">
          <el-icon><Clock /></el-icon>
          <div>
            <span>未完成</span>
            <strong>{{ stats.pending }} 项</strong>
          </div>
        </article>
        <article class="summary-card done tasks-stat-card">
          <el-icon><CircleCheck /></el-icon>
          <div>
            <span>已完成</span>
            <strong>{{ stats.completed }} 项</strong>
          </div>
        </article>
        <article class="summary-card performance tasks-stat-card">
          <el-icon><Clock /></el-icon>
          <div>
            <span>已逾期</span>
            <strong>{{ stats.overdue }} 项</strong>
          </div>
        </article>
      </div>

      <article class="settings-panel tasks-panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">任务列表</p>
            <h3>工作任务</h3>
          </div>
          <div class="tasks-toolbar">
            <el-select v-model="statusFilter" size="large" style="width: 120px">
              <el-option
                v-for="option in statusOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <AppSwitch
              v-model="taskReminderEnabled"
              label="任务提醒"
              active-text="提醒开"
              inactive-text="提醒关"
              :loading="taskReminderLoading"
              @change="updateTaskReminder"
            />
          </div>
        </div>

        <el-alert
          :title="`截止前 ${reminderLeadText} 会弹出系统提醒；弹窗可选择知道了、稍后提醒或标记已完成。`"
          type="info"
          show-icon
          :closable="false"
        />

        <el-empty v-if="!filteredTasks.length" description="暂无任务，点击右上角新建" />

        <ul v-else class="task-list">
          <li
            v-for="task in filteredTasks"
            :key="task.id"
            class="task-item"
            :class="{ 'is-completed': task.completed }"
          >
            <div class="task-item-main">
              <div class="task-item-topline">
                <el-tag :type="getTaskStatus(task).type" effect="light" size="small">
                  {{ getTaskStatus(task).label }}
                </el-tag>
                <strong>{{ task.title }}</strong>
              </div>
              <p v-if="task.description" class="task-description">{{ task.description }}</p>
              <div class="task-meta">
                <span>截止 {{ formatDateTime(task.dueAt) }}</span>
                <em>{{ getRemainingText(task.dueAt, task.completed) }}</em>
              </div>
            </div>

            <div class="task-item-actions">
              <el-button
                :type="task.completed ? 'warning' : 'success'"
                plain
                @click="handleToggleComplete(task)"
              >
                {{ task.completed ? '标记未完成' : '标记完成' }}
              </el-button>
              <el-button @click="openEditDialog(task)">编辑</el-button>
              <el-button type="danger" plain @click="handleDelete(task)">删除</el-button>
            </div>
          </li>
        </ul>
      </article>
    </template>

    <template v-else>
      <div class="tasks-stats">
        <article class="summary-card work tasks-stat-card">
          <el-icon><Calendar /></el-icon>
          <div>
            <span>全部备忘</span>
            <strong>{{ memoStats.total }} 条</strong>
          </div>
        </article>
        <article class="summary-card attendance tasks-stat-card">
          <el-icon><Hide /></el-icon>
          <div>
            <span>密码类</span>
            <strong>{{ memoStats.password }} 条</strong>
          </div>
        </article>
        <article class="summary-card done tasks-stat-card">
          <el-icon><View /></el-icon>
          <div>
            <span>账号类</span>
            <strong>{{ memoStats.account }} 条</strong>
          </div>
        </article>
        <article class="summary-card performance tasks-stat-card">
          <el-icon><CopyDocument /></el-icon>
          <div>
            <span>敏感内容</span>
            <strong>{{ memoStats.sensitive }} 条</strong>
          </div>
        </article>
      </div>

      <article class="settings-panel tasks-panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">重要信息</p>
            <h3>备忘录</h3>
          </div>
          <div class="tasks-toolbar">
            <el-input
              v-model="memoSearch"
              clearable
              placeholder="搜索标题或内容"
              style="width: 200px"
            />
            <el-select v-model="memoCategoryFilter" size="large" style="width: 120px">
              <el-option
                v-for="option in memoCategoryFilterOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>
        </div>

        <el-alert
          title="可记录密码、账号、密钥等重要信息。敏感内容默认隐藏，点击「显示」后可查看；建议配合设置中的隐私模式使用。"
          type="warning"
          show-icon
          :closable="false"
        />

        <el-empty v-if="!filteredMemos.length" description="暂无备忘录，点击右上角新建" />

        <ul v-else class="memo-list">
          <li v-for="memo in filteredMemos" :key="memo.id" class="memo-item">
            <div class="memo-item-main">
              <div class="memo-item-topline">
                <el-tag
                  :type="getMemoCategoryTagType(memo.category)"
                  effect="light"
                  size="small"
                >
                  {{ getMemoCategoryLabel(memo.category) }}
                </el-tag>
                <strong>{{ memo.title }}</strong>
                <el-tag v-if="memo.isSensitive" type="info" effect="plain" size="small">
                  敏感
                </el-tag>
              </div>
              <pre class="memo-content">{{ getMemoDisplayContent(memo) }}</pre>
              <div class="memo-meta">
                <span>更新于 {{ formatDateTime(memo.updatedAt || memo.createdAt) }}</span>
              </div>
            </div>

            <div class="memo-item-actions">
              <el-button
                v-if="memo.isSensitive"
                plain
                :icon="isMemoRevealed(memo.id) ? Hide : View"
                @click="toggleMemoReveal(memo.id)"
              >
                {{ isMemoRevealed(memo.id) ? '隐藏' : '显示' }}
              </el-button>
              <el-button plain :icon="CopyDocument" @click="copyMemoContent(memo)">
                复制
              </el-button>
              <el-button @click="openEditMemoDialog(memo)">编辑</el-button>
              <el-button type="danger" plain @click="handleDeleteMemo(memo)">删除</el-button>
            </div>
          </li>
        </ul>
      </article>
    </template>

    <el-dialog
      v-model="dialogVisible"
      :title="editingTaskId ? '编辑任务' : '新建任务'"
      width="520px"
      class="task-dialog"
    >
      <el-form label-position="top">
        <el-form-item label="任务标题">
          <el-input v-model="taskForm.title" maxlength="80" show-word-limit placeholder="请输入任务名称" />
        </el-form-item>
        <el-form-item label="任务说明">
          <el-input
            v-model="taskForm.description"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="可选，补充任务细节"
          />
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker
            v-model="taskForm.dueAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            placeholder="选择完成时效"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTask">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="memoDialogVisible"
      :title="editingMemoId ? '编辑备忘录' : '新建备忘录'"
      width="560px"
      class="memo-dialog"
    >
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input
            v-model="memoForm.title"
            maxlength="80"
            show-word-limit
            placeholder="例如：公司邮箱、Wi-Fi 密码"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="memoForm.category" style="width: 100%">
            <el-option
              v-for="option in MEMO_CATEGORY_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="memoForm.content"
            type="textarea"
            :rows="6"
            maxlength="2000"
            show-word-limit
            placeholder="账号、密码、密钥、备注等"
          />
        </el-form-item>
        <el-form-item label="默认隐藏内容">
          <AppSwitch
            v-model="memoForm.isSensitive"
            label="敏感内容"
            active-text="隐藏"
            inactive-text="明文"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="memoDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMemo">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>
