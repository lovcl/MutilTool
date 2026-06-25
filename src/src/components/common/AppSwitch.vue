<script setup>
import { ElNotification } from 'element-plus';

const model = defineModel({ type: Boolean, default: false });

const props = defineProps({
  label: {
    type: String,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  activeText: {
    type: String,
    default: '开',
  },
  inactiveText: {
    type: String,
    default: '关',
  },
});

const emit = defineEmits(['change']);

const handleChange = (value) => {
  emit('change', value);
  ElNotification({
    title: '设置已更新',
    message: `${value ? '已开启' : '已关闭'}「${props.label}」`,
    type: 'success',
    position: 'top-right',
    duration: 2500,
  });
};
</script>

<template>
  <el-switch
    v-model="model"
    :loading="loading"
    inline-prompt
    :active-text="activeText"
    :inactive-text="inactiveText"
    @change="handleChange"
  />
</template>
