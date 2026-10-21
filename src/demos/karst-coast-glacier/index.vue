<script setup lang="ts">
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
</script>

<template>
  <SceneFrame>
    <g v-if="stepId === 'karst'">
      <path d="M0,200 H960 V540 H0 Z" fill="#2c4038" />
      <path d="M80,200 L140,80 L200,200" fill="#3d5c4e" />
      <path d="M240,200 L310,60 L390,200" fill="#466858" />
      <path d="M120,280 Q280,220 460,300 Q300,420 140,400 Z" fill="#0c161c" />
      <path d="M250,280 V360" :stroke="DemoHex.cloud" stroke-width="6" />
      <path d="M300,400 V340" :stroke="DemoHex.lift" stroke-width="8" />
      <path class="flow" d="M200,120 V210" :stroke="DemoHex.rain" stroke-width="2.5" marker-end="url(#ah-r)" />
      <path class="flow" d="M180,250 Q240,270 250,300" :stroke="DemoHex.cold" stroke-width="2" marker-end="url(#ah-c)" />
      <text x="520" y="120" class="lb">石林</text>
      <text x="520" y="300" class="lb">溶洞 · 钟乳石 · 石笋</text>
      <text x="520" y="328" class="dim">可溶性岩石 + 流水溶蚀</text>
    </g>
    <g v-else-if="stepId === 'coast'">
      <path d="M0,180 H420 L360,540 H0 Z" :fill="DemoHex.ground" />
      <path d="M420,180 H960 V540 H360 Z" :fill="DemoHex.coldDeep" />
      <path class="flow" d="M700,260 L480,210" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
      <path class="flow" d="M760,340 L500,300" :stroke="DemoHex.cloud" stroke-width="2.5" marker-end="url(#ah-c)" />
      <path d="M300,420 Q420,390 560,460" fill="#d8c4a0" opacity="0.8" />
      <text x="80" y="140" class="lb">海蚀崖</text>
      <text x="500" y="500" class="lb">海滩堆积</text>
      <text x="24" y="36" class="dim">示意 · 海浪侵蚀与堆积</text>
    </g>
    <g v-else>
      <path d="M80,420 L240,160 L400,420 Z" fill="#8aa0b4" opacity="0.35" />
      <path d="M180,420 L300,200 L460,420 Z" fill="#c5d4e4" opacity="0.85" />
      <path d="M160,420 Q300,300 460,420" fill="#d8e8f4" />
      <path d="M120,420 H220 L200,460 H140 Z" fill="#6a5844" />
      <path class="flow" d="M300,240 L250,390" :stroke="DemoHex.cold" stroke-width="3" marker-end="url(#ah-c)" />
      <text x="520" y="200" class="lb">U 型谷</text>
      <text x="520" y="228" class="dim">冰川刨蚀，谷底宽平</text>
      <text x="520" y="420" class="lb">冰碛物</text>
      <text x="24" y="36" class="dim">示意 · 冰川地貌</text>
    </g>
  </SceneFrame>
</template>
