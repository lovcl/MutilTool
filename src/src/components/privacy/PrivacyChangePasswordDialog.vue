<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { usePrivacyMode } from '../../composables/usePrivacyMode';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:visible', 'completed']);

const { changePrivacyPassword, privacyMinPasswordLength } = usePrivacyMode();

const loading = ref(false);
const currentPasswordInputRef = ref(null);
const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const minPasswordLength = computed(() => privacyMinPasswordLength.value || 4);

const resetForm = () => {
  form.currentPassword = '';
  form.newPassword = '';
  form.confirmPassword = '';
};

const focusCurrentPassword = async () => {
  await nextTick();
  currentPasswordInputRef.value?.focus?.();
};

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      resetForm();
      await focusCurrentPassword();
    }
  }
);

const closeDialog = () => {
  emit('update:visible', false);
};

const handleSubmit = async () => {
  if (!form.currentPassword) {
    ElMessage.warning('请输入当前密码');
    return;
  }

  if (form.newPassword.length < minPasswordLength.value) {
    ElMessage.warning(`新密码至少 ${minPasswordLength.value} 位`);
    return;
  }

  if (form.newPassword !== form.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }

  loading.value = true;
  try {
    await changePrivacyPassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
      confirmPassword: form.confirmPassword,
    });
    ElMessage.success('密码已修改');
    emit('completed');
    closeDialog();
  } catch (error) {
    ElMessage.error(error.message || '修改失败');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="修改隐私模式密码"
    width="460px"
    :close-on-click-modal="false"
    @open="focusCurrentPassword"
    @opened="focusCurrentPassword"
    @close="closeDialog"
  >
    <p class="privacy-setup-intro">请输入当前密码，并设置新的访问密码。</p>

    <el-form label-position="top" class="privacy-setup-form">
      <el-form-item label="当前密码">
        <el-input
          ref="currentPasswordInputRef"
          v-model="form.currentPassword"
          type="password"
          show-password
          autocomplete="current-password"
          placeholder="当前密码"
        />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input
          v-model="form.newPassword"
          type="password"
          show-password
          autocomplete="new-password"
          :placeholder="`至少 ${minPasswordLength} 位`"
        />
      </el-form-item>
      <el-form-item label="确认新密码">
        <el-input
          v-model="form.confirmPassword"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="再次输入新密码"
          @keyup.enter="handleSubmit"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>
