<script setup lang="ts">
import { ref } from 'vue'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
const motion = ref<'wave' | 'tide' | 'current'>('wave')
</script>

<template>
  <SceneFrame>
    <template v-if="stepId === 'motion'" #tools>
      <button type="button" class="chip" :class="{ on: motion === 'wave' }" @click="motion = 'wave'">波浪</button>
      <button type="button" class="chip" :class="{ on: motion === 'tide' }" @click="motion = 'tide'">潮汐</button>
      <button type="button" class="chip" :class="{ on: motion === 'current' }" @click="motion = 'current'">洋流</button>
    </template>

    <g v-if="stepId === 'property'">
      <text x="80" y="70" class="lb">表层水温随纬度降低</text>
      <path d="M80,120 H400" :stroke="DemoHex.warm" stroke-width="8" />
      <path d="M80,160 H300" :stroke="DemoHex.lift" stroke-width="8" />
      <path d="M80,200 H180" :stroke="DemoHex.cold" stroke-width="8" />
      <text x="410" y="126" class="dim">赤道</text>
      <text x="310" y="166" class="dim">中纬</text>
      <text x="190" y="206" class="dim">高纬</text>
      <text x="80" y="280" class="lb">盐度：副热带海区最高</text>
      <path d="M80,340 Q200,300 320,360 T560,340" fill="none" :stroke="DemoHex.accent" stroke-width="3" />
      <circle cx="320" cy="360" r="6" :fill="DemoHex.lift" />
      <text x="300" y="400" class="dim">副热带 · 蒸发 &gt; 降水</text>
      <text x="620" y="160" class="dim">深度增加，水温先快后慢下降</text>
      <path d="M700,80 V420" :stroke="DemoHex.inkFaint" stroke-width="2" />
      <path d="M700,100 C760,140 780,220 760,400" fill="none" :stroke="DemoHex.warm" stroke-width="3" />
    </g>
    <g v-else>
      <path d="M0,320 H960 V540 H0 Z" :fill="DemoHex.coldDeep" />
      <template v-if="motion === 'wave'">
        <path class="flow" d="M40,280 Q120,240 200,280 T360,280 T520,280 T680,280 T840,280" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
        <text x="80" y="120" class="lb">风吹海面形成波浪</text>
        <text x="80" y="148" class="dim">水质点近于原地起伏，波形向前传</text>
      </template>
      <template v-else-if="motion === 'tide'">
        <circle cx="760" cy="120" r="28" :fill="DemoHex.cloud" />
        <path class="flow" d="M700,140 L480,250" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
        <path d="M80,300 Q300,240 520,300" fill="none" :stroke="DemoHex.rain" stroke-width="4" />
        <text x="80" y="160" class="lb">月球引力引起潮汐</text>
        <text x="80" y="188" class="dim">涨落有周期性 · 沿海更为明显</text>
      </template>
      <template v-else>
        <path class="flow" d="M120,380 H760" :stroke="DemoHex.warm" stroke-width="4" marker-end="url(#ah-w)" />
        <text x="80" y="160" class="lb">洋流：海水大规模定向流动</text>
        <text x="80" y="188" class="dim">必修先辨认形式；全球模式在选必展开</text>
      </template>
    </g>
  </SceneFrame>
</template>
