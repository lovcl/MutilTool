<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePrivacyMode } from '../../composables/usePrivacyMode';

const emit = defineEmits(['unlocked']);

const {
  privacyLockedOut,
  privacyFailedAttempts,
  privacyMaxAttempts,
  privacyMinPasswordLength,
  unlockWithPassword,
  fetchSecurityQuestions,
  recoverWithSecurityAnswer,
  resetAllData,
  syncStatus,
} = usePrivacyMode();

const mode = ref('login');
const loading = ref(false);
const password = ref('');
const recoverQuestions = ref([]);
const recoverForm = reactive({
  questionId: '',
  answer: '',
  newPassword: '',
  confirmPassword: '',
});

const remainingAttempts = computed(() =>
  Math.max(privacyMaxAttempts.value - privacyFailedAttempts.value, 0)
);

const minPasswordLength = computed(() => privacyMinPasswordLength.value || 4);

const resetRecoverForm = () => {
  recoverForm.questionId = '';
  recoverForm.answer = '';
  recoverForm.newPassword = '';
  recoverForm.confirmPassword = '';
};

const switchToRecover = async () => {
  recoverQuestions.value = await fetchSecurityQuestions();
  if (!recoverQuestions.value.length) {
    ElMessage.error('尚未设置密保问题');
    return;
  }

  resetRecoverForm();
  recoverForm.questionId = recoverQuestions.value[0]?.id || '';
  mode.value = 'recover';
};

const handleUnlock = async () => {
  if (!password.value) {
    ElMessage.warning('请输入密码');
    return;
  }

  loading.value = true;
  try {
    const result = await unlockWithPassword(password.value);
    if (result.ok) {
      password.value = '';
      emit('unlocked');
      return;
    }

    if (result.lockedOut) {
      ElMessage.error('密码错误次数过多，请重置所有配置和数据');
    } else {
      ElMessage.error(`密码错误，还可尝试 ${result.remainingAttempts} 次`);
    }
  } catch (error) {
    ElMessage.error(error.message || '解锁失败');
  } finally {
    loading.value = false;
  }
};

const handleRecover = async () => {
  if (!recoverForm.questionId || !recoverForm.answer.trim()) {
    ElMessage.warning('请选择密保问题并填写答案');
    return;
  }

  if (recoverForm.newPassword.length < minPasswordLength.value) {
    ElMessage.warning(`新密码至少 ${minPasswordLength.value} 位`);
    return;
  }

  if (recoverForm.newPassword !== recoverForm.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }

  loading.value = true;
  try {
    await recoverWithSecurityAnswer({
      questionId: recoverForm.questionId,
      answer: recoverForm.answer,
      newPassword: recoverForm.newPassword,
      confirmPassword: recoverForm.confirmPassword,
    });
    ElMessage.success('密码已重置，欢迎回来');
    mode.value = 'login';
    password.value = '';
    emit('unlocked');
  } catch (error) {
    ElMessage.error(error.message || '密保验证失败');
  } finally {
    loading.value = false;
  }
};

const handleResetAll = async () => {
  try {
    await ElMessageBox.confirm(
      '此操作会清空所有业务数据、偏好设置和隐私模式配置，且不可恢复。确定继续吗？',
      '重置所有配置和数据',
      {
        type: 'warning',
        confirmButtonText: '确认重置',
        cancelButtonText: '取消',
      }
    );
  } catch {
    return;
  }

  loading.value = true;
  try {
    await resetAllData();
    ElMessage.success('已重置所有配置和数据');
    mode.value = 'login';
    password.value = '';
    emit('unlocked');
  } catch (error) {
    ElMessage.error(error.message || '重置失败');
  } finally {
    loading.value = false;
  }
};

watch(
  () => privacyLockedOut.value,
  (lockedOut) => {
    if (lockedOut) {
      mode.value = 'lockedOut';
    }
  },
  { immediate: true }
);

syncStatus();
</script>

<template>
  <div class="privacy-lock-screen">
    <div class="privacy-lock-card">
      <p class="privacy-lock-eyebrow">隐私保护</p>
      <h2>请输入密码继续</h2>
      <p class="privacy-lock-desc">隐私模式已开启，输入密码后可查看应用内容。</p>

      <template v-if="mode === 'login' && !privacyLockedOut">
        <el-input
          v-model="password"
          type="password"
          show-password
          autocomplete="current-password"
          placeholder="访问密码"
          @keyup.enter="handleUnlock"
        />
        <div class="privacy-lock-actions">
          <el-button type="primary" :loading="loading" @click="handleUnlock">解锁</el-button>
        </div>
        <p v-if="privacyFailedAttempts > 0" class="privacy-lock-warning">
          已错误 {{ privacyFailedAttempts }} 次，还可尝试 {{ remainingAttempts }} 次
        </p>
        <button type="button" class="privacy-lock-link" @click="switchToRecover">忘记密码？</button>
      </template>

      <template v-else-if="mode === 'recover' && !privacyLockedOut">
        <el-form label-position="top" class="privacy-recover-form">
          <el-form-item label="选择一个密保问题">
            <el-select v-model="recoverForm.questionId" placeholder="请选择">
              <el-option
                v-for="question in recoverQuestions"
                :key="question.id"
                :label="question.text"
                :value="question.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="密保答案">
            <el-input v-model="recoverForm.answer" autocomplete="off" placeholder="请输入答案" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input
              v-model="recoverForm.newPassword"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="`至少 ${minPasswordLength} 位`"
            />
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input
              v-model="recoverForm.confirmPassword"
              type="password"
              show-password
              autocomplete="new-password"
              placeholder="再次输入新密码"
            />
          </el-form-item>
        </el-form>
        <div class="privacy-lock-actions">
          <el-button @click="mode = 'login'">返回</el-button>
          <el-button type="primary" :loading="loading" @click="handleRecover">重置密码</el-button>
        </div>
      </template>

      <template v-else>
        <el-alert
          title="密码错误次数过多，已无法继续尝试。你可以重置所有配置和数据后重新开始。"
          type="error"
          show-icon
          :closable="false"
        />
        <div class="privacy-lock-actions">
          <el-button type="danger" :loading="loading" @click="handleResetAll">
            重置所有配置和数据
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>
