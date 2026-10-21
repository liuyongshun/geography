<script setup lang="ts">
import type { DemoEntry } from '@/curriculum/demoRegistry'
import InteriorCutaway from './InteriorCutaway.vue'
import ExteriorSpheres from './ExteriorSpheres.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
</script>

<template>
  <InteriorCutaway v-if="stepId === 'interior'" />
  <ExteriorSpheres v-else />
</template>
