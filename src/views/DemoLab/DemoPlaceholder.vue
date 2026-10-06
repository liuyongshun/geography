<script setup lang="ts">
import { ENGINE_LABEL, type DemoEngine } from '@/curriculum/demoRegistry'

defineProps<{
  title: string
  engine: DemoEngine
  reason?: string
}>()
</script>

<template>
  <div class="ph">
    <div class="mark" aria-hidden="true">◇</div>
    <h2>{{ title }}</h2>
    <p class="engine">拟定形态 · {{ ENGINE_LABEL[engine] }}</p>
    <p class="reason">{{ reason || '本课暂以图形示意规划中，先保留入口。' }}</p>
    <slot />
  </div>
</template>

<style scoped>
.ph {
  height: 100%;
  min-height: 360px;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-500);
  background:
    radial-gradient(ellipse at 50% 30%, rgba(64, 160, 180, 0.12), transparent 55%),
    var(--bg-canvas);
}
.mark {
  font-size: 42px;
  line-height: 1;
  color: var(--text-400);
  opacity: 0.7;
}
h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-700);
}
.engine {
  margin: 0;
  font-size: 13px;
  color: var(--primary-mid);
}
.reason {
  margin: 4px 0 0;
  font-size: 13px;
  max-width: 28em;
  justify-self: center;
  line-height: 1.5;
}
</style>
