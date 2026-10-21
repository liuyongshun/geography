<script setup lang="ts">
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
</script>

<template>
  <SceneFrame>
    <g v-if="stepId === 'factors'">
      <rect x="380" y="220" width="200" height="120" rx="12" :fill="DemoHex.ground" />
      <text x="480" y="286" text-anchor="middle" class="lb on-fill">土壤</text>
      <path class="flow" d="M180,120 L390,230" :stroke="DemoHex.rain" stroke-width="2.5" marker-end="url(#ah-r)" />
      <path class="flow" d="M760,120 L570,230" :stroke="DemoHex.lift" stroke-width="2.5" marker-end="url(#ah-l)" />
      <path class="flow" d="M160,420 L390,320" :stroke="DemoHex.accent" stroke-width="2.5" marker-end="url(#ah-a)" />
      <path class="flow" d="M800,400 L570,320" :stroke="DemoHex.warm" stroke-width="2.5" marker-end="url(#ah-w)" />
      <path class="flow" d="M480,120 V220" :stroke="DemoHex.cold" stroke-width="2.5" marker-end="url(#ah-c)" />
      <text x="80" y="110" class="lb">气候</text>
      <text x="740" y="110" class="lb">生物</text>
      <text x="80" y="450" class="lb">母质</text>
      <text x="760" y="430" class="lb">地形 · 时间 · 人类</text>
      <text x="430" y="80" class="dim">成土因素共同作用</text>
    </g>
    <g v-else>
      <rect x="300" y="70" width="280" height="36" fill="#2a241c" />
      <rect x="300" y="106" width="280" height="70" fill="#3a2a1c" />
      <rect x="300" y="176" width="280" height="80" fill="#6a5038" />
      <rect x="300" y="256" width="280" height="90" fill="#8a6844" />
      <rect x="300" y="346" width="280" height="110" fill="#5c564c" />
      <path class="flow" d="M250,90 V200" :stroke="DemoHex.rain" stroke-width="2.5" marker-end="url(#ah-r)" />
      <text x="620" y="94" class="lb">有机层</text>
      <text x="620" y="148" class="lb">腐殖质层</text>
      <text x="620" y="220" class="lb">淋溶层</text>
      <text x="620" y="300" class="lb">淀积层</text>
      <text x="620" y="400" class="lb">母质层</text>
      <text x="80" y="200" class="dim">降水下渗淋溶</text>
      <text x="24" y="36" class="dim">示意 · 森林土壤剖面，各地并不相同</text>
    </g>
  </SceneFrame>
</template>
