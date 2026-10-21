<script setup lang="ts">
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
</script>

<template>
  <SceneFrame>
    <g v-if="stepId === 'resource'">
      <path d="M0,260 H960 V540 H0 Z" :fill="DemoHex.coldDeep" />
      <path d="M0,200 H280 L240,260 H0 Z" :fill="DemoHex.ground" />
      <path class="flow" d="M200,230 H700" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
      <circle cx="420" cy="360" r="18" :fill="DemoHex.accent" />
      <rect x="620" y="300" width="36" height="50" :fill="DemoHex.inkFaint" />
      <path d="M760,400 l20,-40 h-40 Z" :fill="DemoHex.sink" />
      <text x="300" y="210" class="dim">航运</text>
      <text x="390" y="410" class="dim">渔场</text>
      <text x="600" y="290" class="dim">油气</text>
      <text x="740" y="450" class="dim">海盐</text>
      <text x="24" y="36" class="lb">海洋空间 · 生物 · 矿产 · 能源</text>
    </g>
    <g v-else>
      <path d="M0,240 H960 V540 H0 Z" :fill="DemoHex.coldDeep" />
      <path class="flow" d="M120,180 L260,280" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
      <circle cx="300" cy="340" r="70" :fill="DemoHex.warm" opacity="0.35" />
      <path class="flow" d="M620,200 L760,300" :stroke="DemoHex.accent" stroke-width="3" marker-end="url(#ah-a)" />
      <circle cx="800" cy="360" r="60" fill="none" :stroke="DemoHex.lift" stroke-width="3" />
      <text x="80" y="150" class="dim">陆源排污</text>
      <text x="250" y="430" class="lb">污染扩散</text>
      <text x="720" y="160" class="dim">保护区 · 限额捕捞</text>
      <text x="24" y="36" class="dim">示意 · 开发与保护要同时考虑</text>
    </g>
  </SceneFrame>
</template>
