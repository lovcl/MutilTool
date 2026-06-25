<script setup>
import { Hide, View } from '@element-plus/icons-vue';
import { usePerformancePrivacy } from '../../composables/usePerformancePrivacy';

const { performancePrivacyVisible, togglePerformancePrivacy } = usePerformancePrivacy();
</script>

<template>
  <el-tooltip
    :content="performancePrivacyVisible ? '隐藏绩效私人数据' : '显示绩效私人数据'"
    placement="top"
    :show-after="120"
  >
    <button
      type="button"
      class="performance-privacy-toggle"
      :class="{ 'is-hidden': !performancePrivacyVisible }"
      :aria-label="performancePrivacyVisible ? '隐藏绩效私人数据' : '显示绩效私人数据'"
      @click.stop="togglePerformancePrivacy"
    >
      <el-icon>
        <component :is="performancePrivacyVisible ? View : Hide" />
      </el-icon>
    </button>
  </el-tooltip>
</template>
