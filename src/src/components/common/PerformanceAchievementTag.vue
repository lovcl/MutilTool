<script setup>
defineProps({
  text: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <el-tag v-if="text" class="performance-achievement-tag" type="success" effect="light" round>
    <span class="performance-achievement-tag__text">{{ text }}</span>
  </el-tag>
</template>

<style scoped lang="scss">
.performance-achievement-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: auto;
  min-height: 28px;
  padding: 6px 12px;
  line-height: 1.45;
}

.performance-achievement-tag__text {
  display: block;
  text-align: center;
  line-height: inherit;
}
</style>
