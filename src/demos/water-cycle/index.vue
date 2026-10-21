<script setup lang="ts">
import { ref } from 'vue'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
const human = ref(false)
</script>

<template>
  <SceneFrame>
    <template v-if="stepId === 'human'" #tools>
      <button type="button" class="chip" :class="{ on: !human }" @click="human = false">自然循环</button>
      <button type="button" class="chip" :class="{ on: human }" @click="human = true">人类影响</button>
    </template>

    <g>
      <path d="M0,300 H420 V540 H0 Z" :fill="DemoHex.coldDeep" />
      <path d="M420,340 H960 V540 H420 Z" :fill="DemoHex.ground" />
      <path d="M620,340 L760,140 L900,340 Z" fill="#3d5a40" />
      <path d="M700,220 Q640,300 560,340" fill="none" :stroke="DemoHex.cold" stroke-width="8" />
      <path class="flow" d="M200,280 V140" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
      <path class="flow" d="M230,150 H700" :stroke="DemoHex.cloud" stroke-width="3" marker-end="url(#ah-c)" />
      <path class="flow" d="M760,160 V250" :stroke="DemoHex.cold" stroke-width="3" marker-end="url(#ah-c)" />
      <path class="flow" d="M560,330 H460" :stroke="DemoHex.accent" stroke-width="3" marker-end="url(#ah-a)" />
      <path class="flow" d="M640,400 H500" :stroke="DemoHex.sink" stroke-width="2.5" marker-end="url(#ah-s)" />
      <text x="80" y="120" class="dim">蒸发</text>
      <text x="420" y="130" class="dim">水汽输送</text>
      <text x="780" y="130" class="dim">降水</text>
      <text x="430" y="310" class="dim">地表径流</text>
      <text x="620" y="430" class="dim on-fill">下渗 · 地下径流</text>
      <g v-if="stepId === 'human' && human">
        <rect x="500" y="300" width="70" height="40" :fill="DemoHex.inkFaint" />
        <path class="flow" d="M535,300 V250" :stroke="DemoHex.warm" stroke-width="2.5" marker-end="url(#ah-w)" />
        <text x="80" y="480" class="lb">水库拦蓄 · 过度抽取地下水会改变环节</text>
      </g>
      <text v-else x="24" y="36" class="dim">示意 · 海陆间循环</text>
    </g>
  </SceneFrame>
</template>
