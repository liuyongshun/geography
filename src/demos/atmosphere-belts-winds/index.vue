<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { DemoEntry } from '@/curriculum/demoRegistry'

defineProps<{
  stepId: string
  demo: DemoEntry
}>()

const router = useRouter()

onMounted(() => {
  // 气压带风带已有完整双视图实验室，直接进入
  router.replace({ name: 'lab', params: { tutorialId: 'atmosphere-belts-winds' } })
})
</script>

<template>
  <div class="jump">
    <p>正在打开地球实验室…</p>
  </div>
</template>

<style scoped>
.jump {
  height: 100%;
  display: grid;
  place-content: center;
  color: var(--text-400);
  font-size: 13px;
}
</style>
