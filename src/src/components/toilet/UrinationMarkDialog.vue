<script setup>
import { computed, ref, watch } from 'vue';
import {
  DEFAULT_URINATION_STATUS,
  URINATION_COLOR_OPTIONS,
  URINATION_STATUS,
  URINATION_STATUS_OPTIONS,
} from '../../utils/toiletRecordMeta';

const visible = defineModel('visible', { type: Boolean, default: false });
const emit = defineEmits(['confirm']);

const selectedStatus = ref(DEFAULT_URINATION_STATUS);
const selectedColor = ref('');

const showColorOptions = computed(
  () => selectedStatus.value === URINATION_STATUS.COLOR_ABNORMAL
);

const canConfirm = computed(() => {
  if (selectedStatus.value === URINATION_STATUS.COLOR_ABNORMAL) {
    return Boolean(selectedColor.value);
  }

  return Boolean(selectedStatus.value);
});

const resetForm = () => {
  selectedStatus.value = DEFAULT_URINATION_STATUS;
  selectedColor.value = '';
};

watch(visible, (open) => {
  if (open) {
    resetForm();
  }
});

watch(selectedStatus, (status) => {
  if (status !== URINATION_STATUS.COLOR_ABNORMAL) {
    selectedColor.value = '';
  }
});

const handleConfirm = () => {
  emit('confirm', {
    urinationStatus: selectedStatus.value,
    urinationColor:
      selectedStatus.value === URINATION_STATUS.COLOR_ABNORMAL
        ? selectedColor.value
        : null,
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
    title="记录小便"
    width="440px"
    align-center
    :close-on-click-modal="false"
    append-to-body
    class="habit-mark-dialog"
  >
    <p class="habit-mark-dialog__hint">请选择本次小便状态，默认正常。</p>
    <el-radio-group v-model="selectedStatus" class="habit-mark-dialog__options">
      <el-radio
        v-for="option in URINATION_STATUS_OPTIONS"
        :key="option.value"
        :label="option.value"
        border
      >
        {{ option.label }}
      </el-radio>
    </el-radio-group>

    <div v-if="showColorOptions" class="habit-mark-dialog__color-section">
      <p class="habit-mark-dialog__hint">请选择观察到的颜色：</p>
      <div class="habit-mark-dialog__color-grid">
        <el-button
          v-for="option in URINATION_COLOR_OPTIONS"
          :key="option.value"
          :type="selectedColor === option.value ? 'primary' : 'default'"
          plain
          @click="selectedColor = option.value"
        >
          {{ option.label }}
        </el-button>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm" @click="handleConfirm">
        确认记录
      </el-button>
    </template>
  </el-dialog>
</template>
