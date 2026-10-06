<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SideNav from './SideNav.vue'
import ResourcesEntry from './ResourcesEntry.vue'

const route = useRoute()
const crumb = computed(() => {
  if (route.name === 'resources') return '开源资源'
  if (route.name === 'demo') return '图形演示'
  if (route.name === 'lab') return '地球预览'
  if (route.name === 'tutorial') return '教程说明'
  return '课程目录'
})
const fillPane = computed(() => route.name === 'demo' || route.name === 'lab')
</script>

<template>
  <div class="shell">
    <SideNav />
    <div class="main">
      <header class="bar">
        <strong class="brand">地理过程</strong>
        <span class="sep">/</span>
        <span>湘教版（2019）同步教程</span>
        <span class="sep">/</span>
        <span class="crumb">{{ crumb }}</span>
        <div class="bar-entry">
          <ResourcesEntry />
        </div>
      </header>
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
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(90deg, #0a1018 0%, #141c28 60%, #0a1018 100%);
  font-size: 13px;
  color: var(--text-500);
}
.brand {
  color: var(--primary-mid);
  font-weight: 700;
}
.sep {
  opacity: 0.5;
}
.crumb {
  color: var(--text-700);
}
.bar-entry {
  margin-left: auto;
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
