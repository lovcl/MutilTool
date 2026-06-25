<script setup>
import { computed, ref, watch } from 'vue';
import {
  BOWEL_STATUS,
  BOWEL_STATUS_OPTIONS,
  DEFAULT_BOWEL_STATUS,
} from '../../utils/toiletRecordMeta';

const visible = defineModel('visible', { type: Boolean, default: false });
const emit = defineEmits(['confirm']);

const selectedStatus = ref(DEFAULT_BOWEL_STATUS);
const customText = ref('');

const showCustomInput = computed(() => selectedStatus.value === BOWEL_STATUS.CUSTOM);

const canConfirm = computed(() => {
  if (selectedStatus.value === BOWEL_STATUS.CUSTOM) {
    return Boolean(customText.value.trim());
  }

  return Boolean(selectedStatus.value);
});

const resetForm = () => {
  selectedStatus.value = DEFAULT_BOWEL_STATUS;
  customText.value = '';
};

watch(visible, (open) => {
  if (open) {
    resetForm();
  }
});

watch(selectedStatus, (status) => {
  if (status !== BOWEL_STATUS.CUSTOM) {
    customText.value = '';
  }
});

const handleConfirm = () => {
  emit('confirm', {
    bowelStatus: selectedStatus.value,
    bowelCustomText:
      selectedStatus.value === BOWEL_STATUS.CUSTOM ? customText.value.trim() : '',
  });
  visible.value = false;
};

const handleCancel = () => {
  visible.value = false;
};
</script>

<template>
  <el-dialog
    v-model="visible"
    title="记录大便"
    width="420px"
    align-center
    :close-on-click-modal="false"
    append-to-body
    class="habit-mark-dialog"
  >
    <p class="habit-mark-dialog__hint">请选择本次大便状态，默认正常。</p>
    <el-radio-group v-model="selectedStatus" class="habit-mark-dialog__options">
      <el-radio
        v-for="option in BOWEL_STATUS_OPTIONS"
        :key="option.value"
        :label="option.value"
        border
      >
        {{ option.label }}
      </el-radio>
    </el-radio-group>

    <div v-if="showCustomInput" class="habit-mark-dialog__custom-section">
      <p class="habit-mark-dialog__hint">请描述本次大便情况：</p>
      <el-input
        v-model="customText"
        type="textarea"
        :rows="3"
        maxlength="100"
        show-word-limit
        placeholder="例如：偏干、有黏液、颜色偏深等"
      />
    </div>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm" @click="handleConfirm">
        确认记录
      </el-button>
    </template>
  </el-dialog>
</template>
