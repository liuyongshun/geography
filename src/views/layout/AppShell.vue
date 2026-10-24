<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SideNav from './SideNav.vue'

const route = useRoute()
const mainRef = ref<HTMLElement | null>(null)
let mainResizeObserver: ResizeObserver | null = null
let resizeFrame = 0

/**
 * 侧栏宽度动画不会触发 window.resize；统一转发主内容区尺寸变化，
 * 让 Three.js、Canvas 与图表及时重算画布和相机比例。
 */
onMounted(() => {
  if (!mainRef.value || typeof ResizeObserver === 'undefined') return
  mainResizeObserver = new ResizeObserver(() => {
    if (resizeFrame) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      window.dispatchEvent(new Event('resize'))
    })
  })
  mainResizeObserver.observe(mainRef.value)
})

onBeforeUnmount(() => {
  mainResizeObserver?.disconnect()
  mainResizeObserver = null
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
})

const fillPane = computed(() => route.name === 'demo' || route.name === 'lab')
</script>

<template>
  <div class="shell">
    <SideNav />
    <div ref="mainRef" class="main">
      <div class="body" :class="{ fill: fillPane }">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  min-height: 100vh;
  background: var(--bg-app);
  color: var(--text-900);
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.body.fill {
  overflow: hidden;
}
</style>
