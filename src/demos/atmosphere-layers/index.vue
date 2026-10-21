<script setup lang="ts">
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
</script>

<template>
  <SceneFrame>
    <g v-if="stepId === 'compose'">
      <circle cx="360" cy="270" r="160" :fill="DemoHex.coldDeep" />
      <path d="M360,110 A160,160 0 1,1 250,400 L360,270 Z" :fill="DemoHex.accent" />
      <path d="M360,110 A160,160 0 0,1 500,220 L360,270 Z" :fill="DemoHex.lift" />
      <text x="300" y="300" class="lb on-fill">氮 ≈ 78%</text>
      <text x="400" y="200" class="lb">氧 ≈ 21%</text>
      <text x="560" y="180" class="lb">水汽 · 杂质</text>
      <text x="560" y="208" class="dim">干洁空气里氩、二氧化碳很少</text>
      <text x="560" y="236" class="dim">但二氧化碳对保温很关键</text>
      <text x="24" y="36" class="dim">示意 · 低层大气组成</text>
    </g>
    <g v-else>
      <rect x="180" y="60" width="220" height="140" :fill="DemoHex.panel" opacity="0.9" />
      <rect x="180" y="200" width="220" height="120" :fill="DemoHex.coldDeep" opacity="0.85" />
      <rect x="180" y="320" width="220" height="160" :fill="DemoHex.cold" opacity="0.35" />
      <path d="M460,400 C520,360 540,240 500,140" fill="none" :stroke="DemoHex.warm" stroke-width="3" />
      <path class="flow" d="M250,430 V350" :stroke="DemoHex.lift" stroke-width="2.5" marker-end="url(#ah-l)" />
      <path class="flow" d="M300,250 V210" :stroke="DemoHex.cold" stroke-width="2.5" marker-end="url(#ah-c)" />
      <text x="200" y="130" class="lb">高层大气</text>
      <text x="200" y="260" class="lb on-fill">平流层</text>
      <text x="200" y="400" class="lb">对流层</text>
      <text x="520" y="420" class="dim">对流层：气温随高度降低 · 天气在此</text>
      <text x="520" y="250" class="dim">平流层：臭氧增温 · 水平运动为主</text>
      <text x="520" y="120" class="dim">高层：空气稀薄 · 有电离层</text>
    </g>
  </SceneFrame>
</template>
