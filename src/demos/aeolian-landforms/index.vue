<script setup lang="ts">
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
</script>

<template>
  <SceneFrame>
    <g v-if="stepId === 'erode'">
      <path d="M0,390 H960 V540 H0 Z" :fill="DemoHex.sink" opacity="0.55" />
      <path d="M160,390 L200,210 L250,390 Z" fill="#6a5438" />
      <path d="M250,390 L300,250 L360,390 Z" fill="#7a6244" />
      <path d="M420,390 L470,180 L540,390 Z" fill="#5c4a34" />
      <path class="flow" d="M40,240 H180" :stroke="DemoHex.cloud" stroke-width="3" marker-end="url(#ah-c)" />
      <path class="flow" d="M40,280 H200" :stroke="DemoHex.rain" stroke-width="2.5" marker-end="url(#ah-r)" />
      <path class="flow" d="M40,320 H220" :stroke="DemoHex.cloud" stroke-width="2" marker-end="url(#ah-c)" />
      <text x="600" y="200" class="lb">雅丹 / 风蚀残丘</text>
      <text x="600" y="228" class="dim">风力磨蚀、吹蚀，沿风向延伸</text>
      <text x="24" y="36" class="dim">示意 · 干旱区风蚀</text>
    </g>
    <g v-else>
      <path d="M0,400 H960 V540 H0 Z" :fill="DemoHex.sink" opacity="0.4" />
      <path d="M220,400 C300,400 340,250 480,250 C620,250 640,400 760,400 Z" fill="#c4a36a" />
      <path class="flow" d="M40,220 H300" :stroke="DemoHex.cloud" stroke-width="3" marker-end="url(#ah-c)" />
      <path class="flow" d="M300,230 Q420,160 500,248" :stroke="DemoHex.lift" stroke-width="2.5" marker-end="url(#ah-l)" />
      <path class="flow" d="M620,360 H820" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
      <text x="300" y="360" class="dim">迎风坡缓</text>
      <text x="620" y="300" class="dim">背风坡陡</text>
      <text x="640" y="180" class="lb">沙丘顺风向移动</text>
      <text x="24" y="36" class="dim">示意 · 新月形沙丘</text>
    </g>
  </SceneFrame>
</template>
