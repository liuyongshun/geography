<script setup lang="ts">
import type { DemoEntry } from '@/curriculum/demoRegistry'
import GeologyLesson from '@/demos/geology-shared/GeologyLesson.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
</script>

<template>
  <GeologyLesson topic="landform" :step-id="stepId" :demo="demo" />
</template>
