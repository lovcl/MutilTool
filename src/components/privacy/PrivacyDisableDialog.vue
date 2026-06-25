<script setup>
import { nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { usePrivacyMode } from '../../composables/usePrivacyMode';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:visible', 'completed', 'cancelled']);

const { disablePrivacyMode } = usePrivacyMode();

const password = ref('');
const loading = ref(false);
const passwordInputRef = ref(null);
const closedAfterSuccess = ref(false);

const focusPasswordInput = async () => {
  await nextTick();
  passwordInputRef.value?.focus?.();
};

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      password.value = '';
      await focusPasswordInput();
    }
  }
);

const handleDialogClose = () => {
  if (!closedAfterSuccess.value) {
    emit('cancelled');
  }

  closedAfterSuccess.value = false;
  emit('update:visible', false);
};

const handleConfirm = async () => {
  if (!password.value) {
    ElMessage.warning('请输入当前密码');
    return;
  }

  loading.value = true;
  try {
    await disablePrivacyMode(password.value);
    ElMessage.success('隐私模式已关闭');
    closedAfterSuccess.value = true;
    emit('completed');
    emit('update:visible', false);
  } catch (error) {
    ElMessage.error(error.message || '关闭失败');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="关闭隐私模式"
    width="420px"
    :close-on-click-modal="false"
    @open="focusPasswordInput"
    @opened="focusPasswordInput"
    @close="handleDialogClose"
  >
    <p class="privacy-setup-intro">请输入当前密码以关闭隐私模式。</p>
    <el-input
      ref="passwordInputRef"
      v-model="password"
      type="password"
      show-password
      autocomplete="current-password"
      placeholder="当前密码"
      @keyup.enter="handleConfirm"
    />
    <template #footer>
      <el-button @click="handleDialogClose">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleConfirm">确认关闭</el-button>
    </template>
  </el-dialog>
</template>
