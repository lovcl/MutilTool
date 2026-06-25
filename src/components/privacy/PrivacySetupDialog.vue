<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { usePrivacyMode } from '../../composables/usePrivacyMode';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:visible', 'completed', 'cancelled']);

const {
  fetchSetupQuestions,
  setupPrivacyMode,
  privacyMinPasswordLength,
} = usePrivacyMode();

const loading = ref(false);
const closedAfterSuccess = ref(false);
const questions = ref([]);
const form = reactive({
  password: '',
  confirmPassword: '',
  answers: {},
});

const minPasswordLength = computed(() => privacyMinPasswordLength.value || 4);

const resetForm = () => {
  form.password = '';
  form.confirmPassword = '';
  form.answers = {};
};

const loadQuestions = async () => {
  questions.value = await fetchSetupQuestions();
  form.answers = Object.fromEntries(questions.value.map((item) => [item.id, '']));
};

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      resetForm();
      await loadQuestions();
    }
  },
  { immediate: true }
);

const handleDialogClose = () => {
  if (!closedAfterSuccess.value) {
    emit('cancelled');
  }

  closedAfterSuccess.value = false;
  emit('update:visible', false);
};

const handleSubmit = async () => {
  if (form.password.length < minPasswordLength.value) {
    ElMessage.warning(`密码至少 ${minPasswordLength.value} 位`);
    return;
  }

  if (form.password !== form.confirmPassword) {
    ElMessage.warning('两次输入的密码不一致');
    return;
  }

  for (const question of questions.value) {
    if (!String(form.answers[question.id] || '').trim()) {
      ElMessage.warning('请完整填写 3 个密保问题答案');
      return;
    }
  }

  loading.value = true;
  try {
    await setupPrivacyMode({
      password: form.password,
      confirmPassword: form.confirmPassword,
      answers: questions.value.map((question) => ({
        questionId: question.id,
        answer: form.answers[question.id],
      })),
    });
    ElMessage.success('隐私模式已开启');
    closedAfterSuccess.value = true;
    emit('completed');
    emit('update:visible', false);
  } catch (error) {
    ElMessage.error(error.message || '设置失败');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="首次开启隐私模式"
    width="520px"
    :close-on-click-modal="false"
    @close="handleDialogClose"
  >
    <p class="privacy-setup-intro">
      请设置访问密码，并回答系统随机分配的 3 个密保问题。忘记密码时，答对任意一题即可重置密码。
    </p>

    <el-form label-position="top" class="privacy-setup-form">
      <el-form-item label="访问密码">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
          :placeholder="`至少 ${minPasswordLength} 位`"
        />
      </el-form-item>
      <el-form-item label="确认密码">
        <el-input
          v-model="form.confirmPassword"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="再次输入密码"
        />
      </el-form-item>

      <div v-for="question in questions" :key="question.id" class="privacy-setup-question">
        <el-form-item :label="question.text">
          <el-input
            v-model="form.answers[question.id]"
            autocomplete="off"
            placeholder="请输入答案（不区分大小写）"
          />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="handleDialogClose">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">完成设置</el-button>
    </template>
  </el-dialog>
</template>
