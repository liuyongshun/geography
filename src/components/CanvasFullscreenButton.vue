<script setup lang="ts">
import { computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { FullScreen, Close } from '@element-plus/icons-vue'
import { findCanvasStage, useCanvasFullscreen } from '@/composables/useCanvasFullscreen'

const route = useRoute()
const { active, available, refreshAvailable, toggle, exit } = useCanvasFullscreen()

/** 退出钮必须挂进全屏根，否则会被顶层全屏层盖住 */
const fsHost = computed(() => (active.value ? findCanvasStage() : null))

watch(
  () => route.fullPath,
  async () => {
    await nextTick()
    refreshAvailable()
    setTimeout(refreshAvailable, 120)
    setTimeout(refreshAvailable, 400)
  },
  { immediate: true },
)
</script>

<template>
  <button
    v-if="available && !active"
    type="button"
    class="fs-fab"
    title="全屏预览画布（Esc 退出）"
    @click="toggle"
  >
    <el-icon :size="16"><FullScreen /></el-icon>
    <span>全屏预览</span>
  </button>

  <Teleport v-if="fsHost" :to="fsHost">
    <button type="button" class="fs-exit" title="退出全屏（Esc）" @click="exit">
      <el-icon :size="14"><Close /></el-icon>
      <span>退出</span>
    </button>
  </Teleport>
</template>

<style scoped>
.fs-fab {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(126, 196, 235, 0.35);
  background: rgba(7, 11, 22, 0.88);
  color: var(--primary-mid, #7ec4eb);
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
}
.fs-fab:hover {
  border-color: rgba(126, 196, 235, 0.65);
  color: #eef6fc;
  background: rgba(16, 24, 42, 0.94);
}
.fs-exit {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(7, 11, 22, 0.72);
  color: rgba(238, 243, 247, 0.9);
  font-size: 11px;
  cursor: pointer;
}
.fs-exit:hover {
  background: rgba(7, 11, 22, 0.88);
  color: #fff;
}
</style>
