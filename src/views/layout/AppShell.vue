<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SideNav from './SideNav.vue'
import { frostExplorerRive } from '@/pet/frostExplorer'

const RivePetCompanion = defineAsyncComponent(() => import('@/components/pet/RivePetCompanion.vue'))

const route = useRoute()
const mainRef = ref<HTMLElement | null>(null)
const rivePetReady = ref(false)
let mainResizeObserver: ResizeObserver | null = null
let resizeFrame = 0

/**
 * 侧栏宽度动画不会触发 window.resize；统一转发主内容区尺寸变化，
 * 让 Three.js、Canvas 与图表及时重算画布和相机比例。
 */
onMounted(async () => {
  if (mainRef.value && typeof ResizeObserver !== 'undefined') {
    mainResizeObserver = new ResizeObserver(() => {
      if (resizeFrame) return
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0
        window.dispatchEvent(new Event('resize'))
      })
    })
    mainResizeObserver.observe(mainRef.value)
  }

  try {
    const response = await fetch(frostExplorerRive.src, { method: 'HEAD' })
    rivePetReady.value = response.ok
  } catch {
    rivePetReady.value = false
  }
})

onBeforeUnmount(() => {
  mainResizeObserver?.disconnect()
  mainResizeObserver = null
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
})

const fillPane = computed(() => route.name === 'demo' || route.name === 'lab' || route.name === 'leaderboard')
</script>

<template>
  <div class="shell">
    <SideNav />
    <div ref="mainRef" class="main">
      <div class="body" :class="{ fill: fillPane }">
        <RouterView />
      </div>
    </div>
    <aside
      v-if="rivePetReady && route.name !== 'leaderboard'"
      class="rive-pet-shell"
      :class="{ 'rive-pet-shell--pass-through': route.params.tutorialId === 'earth-revolution' }"
      aria-label="学习伙伴霜岚"
    >
      <RivePetCompanion
        :src="frostExplorerRive.src"
        :state-machine="frostExplorerRive.stateMachine"
        aria-label="学习伙伴霜岚"
      />
    </aside>
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
.rive-pet-shell {
  position: fixed;
  right: 18px;
  bottom: 12px;
  width: 220px;
  height: 290px;
  z-index: 1000;
  pointer-events: auto;
}
.rive-pet-shell--pass-through,
.rive-pet-shell--pass-through :deep(canvas) {
  pointer-events: none;
}
</style>
