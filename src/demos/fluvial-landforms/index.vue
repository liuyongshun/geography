<script setup lang="ts">
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
</script>

<template>
  <SceneFrame>
    <g v-if="stepId === 'erode'">
      <path d="M40,420 L280,140 L520,420 Z" :fill="DemoHex.ground" />
      <path d="M250,175 L310,420 L230,420 Z" fill="#0e1a24" />
      <path class="flow" d="M200,200 L250,175" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
      <path class="flow" d="M280,250 V390" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
      <path class="flow" d="M220,300 H250" :stroke="DemoHex.cold" stroke-width="2.5" marker-end="url(#ah-c)" />
      <path class="flow" d="M340,300 H310" :stroke="DemoHex.cold" stroke-width="2.5" marker-end="url(#ah-c)" />
      <text x="160" y="188" class="dim">溯源侵蚀</text>
      <text x="292" y="330" class="dim">下蚀</text>
      <text x="360" y="292" class="dim">侧蚀</text>
      <text x="560" y="220" class="lb">V 型谷</text>
      <text x="560" y="246" class="dim">上游落差大，以侵蚀为主</text>
      <text x="24" y="36" class="dim">示意 · 流水侵蚀</text>
    </g>

    <g v-else-if="stepId === 'carry'">
      <path d="M0,300 Q240,240 480,280 T960,250 L960,540 L0,540 Z" :fill="DemoHex.groundDark" />
      <path d="M40,250 Q280,210 520,250 T900,230" fill="none" :stroke="DemoHex.cold" stroke-width="28" opacity="0.85" />
      <path class="flow" d="M80,248 Q300,214 520,248 T860,232" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
      <circle cx="220" cy="236" r="5" :fill="DemoHex.lift" />
      <circle cx="400" cy="228" r="4" :fill="DemoHex.sink" />
      <circle cx="620" cy="240" r="5" :fill="DemoHex.lift" />
      <text x="80" y="190" class="lb">侵蚀下来的物质被搬运</text>
      <text x="80" y="400" class="dim">颗粒随流速前进 · 流速减小时开始沉积</text>
    </g>

    <g v-else>
      <path d="M0,360 H960 V540 H0 Z" :fill="DemoHex.ground" />
      <path d="M80,360 L220,200 L360,360 Z" fill="#3d4e3a" />
      <path d="M200,240 Q300,330 430,360" fill="none" :stroke="DemoHex.cold" stroke-width="16" />
      <path d="M360,360 L520,300 L700,360 Z" :fill="DemoHex.sink" opacity="0.85" />
      <path d="M700,360 L820,300 L940,390 L900,360 Z" :fill="DemoHex.warmSoft" opacity="0.7" />
      <path class="flow" d="M250,250 Q340,330 470,345" :stroke="DemoHex.rain" stroke-width="2.5" marker-end="url(#ah-r)" />
      <path class="flow" d="M500,330 L640,318" :stroke="DemoHex.lift" stroke-width="2.5" marker-end="url(#ah-l)" />
      <path class="flow" d="M760,330 L860,318" :stroke="DemoHex.cold" stroke-width="2.5" marker-end="url(#ah-c)" />
      <text x="400" y="250" class="lb">冲积扇</text>
      <text x="780" y="270" class="lb">三角洲</text>
      <text x="80" y="120" class="dim">出山口与入海口：流速骤减，泥沙堆积</text>
    </g>
  </SceneFrame>
</template>
