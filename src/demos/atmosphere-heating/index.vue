<script setup lang="ts">
import { ref } from 'vue'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
const mode = ref<'normal' | 'more'>('normal')
</script>

<template>
  <SceneFrame>
    <template v-if="stepId === 'greenhouse'" #tools>
      <button type="button" class="chip" :class="{ on: mode === 'normal' }" @click="mode = 'normal'">自然保温</button>
      <button type="button" class="chip" :class="{ on: mode === 'more' }" @click="mode = 'more'">温室效应增强</button>
    </template>

    <g v-if="stepId === 'path'">
      <image href="/textures/sun-realistic.png" x="78" y="48" width="84" height="84" />
      <text x="120" y="94" text-anchor="middle" class="lb">太阳</text>
      <path d="M0,400 H960 V540 H0 Z" :fill="DemoHex.ground" />
      <ellipse cx="480" cy="180" rx="280" ry="36" :fill="DemoHex.cloud" opacity="0.25" />
      <path class="flow" d="M150,120 L430,170" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
      <path class="flow" d="M430,160 L250,70" :stroke="DemoHex.cloud" stroke-width="2.5" marker-end="url(#ah-c)" />
      <path class="flow" d="M500,210 V390" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
      <path class="flow" d="M520,390 V230" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
      <path class="flow" d="M300,200 V360" :stroke="DemoHex.sink" stroke-width="3" marker-end="url(#ah-s)" />
      <text x="250" y="60" class="dim">大气反射 · 散射</text>
      <text x="620" y="160" class="lb">大气</text>
      <text x="540" y="300" class="dim">太阳暖大地</text>
      <text x="540" y="360" class="dim">大地暖大气</text>
      <text x="160" y="280" class="dim">大气逆辐射</text>
      <text x="24" y="36" class="dim">示意 · 大气受热过程</text>
    </g>
    <g v-else>
      <path d="M0,420 H960 V540 H0 Z" :fill="mode === 'more' ? DemoHex.warmDeep : DemoHex.ground" />
      <ellipse cx="480" cy="200" rx="300" ry="40" :fill="DemoHex.warm" :opacity="mode === 'more' ? 0.45 : 0.2" />
      <path class="flow" d="M180,80 L400,180" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
      <path class="flow" d="M480,390 V240" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
      <path
        class="flow"
        d="M360,230 V380"
        :stroke="DemoHex.sink"
        :stroke-width="mode === 'more' ? 5 : 2.5"
        marker-end="url(#ah-s)"
      />
      <text x="500" y="160" class="lb">{{ mode === 'more' ? '温室气体增多' : '适量温室气体' }}</text>
      <text x="80" y="480" class="lb">{{ mode === 'more' ? '地面热量更难散出' : '维持适宜温度' }}</text>
    </g>
  </SceneFrame>
</template>
