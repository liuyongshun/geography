<script setup lang="ts">
import { ref } from 'vue'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
const day = ref(true)
</script>

<template>
  <SceneFrame>
    <template v-if="stepId === 'breeze'" #tools>
      <button type="button" class="chip" :class="{ on: day }" @click="day = true">白天 · 海风</button>
      <button type="button" class="chip" :class="{ on: !day }" @click="day = false">夜晚 · 陆风</button>
    </template>

    <g v-if="stepId === 'cell'">
      <path d="M0,400 H960 V540 H0 Z" :fill="DemoHex.ground" />
      <rect x="80" y="400" width="280" height="20" :fill="DemoHex.warm" />
      <rect x="560" y="400" width="280" height="20" :fill="DemoHex.cold" />
      <path class="flow" d="M220,390 V180" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
      <path class="flow" d="M240,190 H700" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
      <path class="flow" d="M700,200 V390" :stroke="DemoHex.cold" stroke-width="3" marker-end="url(#ah-c)" />
      <path class="flow" d="M680,380 H240" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
      <text x="180" y="460" class="lb on-fill">近地面热 · 低压</text>
      <text x="640" y="460" class="lb on-fill">近地面冷 · 高压</text>
      <text x="400" y="160" class="dim">高空由高压流向低压</text>
      <text x="24" y="36" class="dim">示意 · 热力环流</text>
    </g>

    <g v-else-if="stepId === 'breeze'">
      <path d="M0,400 H420 V540 H0 Z" :fill="DemoHex.ground" />
      <path d="M420,400 H960 V540 H420 Z" :fill="DemoHex.coldDeep" />
      <text x="160" y="460" class="lb on-fill">陆地</text>
      <text x="680" y="460" class="lb on-fill">海洋</text>
      <template v-if="day">
        <path class="flow" d="M200,390 V180" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
        <path class="flow" d="M220,190 H700" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
        <path class="flow" d="M700,200 V380" :stroke="DemoHex.cold" stroke-width="3" marker-end="url(#ah-c)" />
        <path class="flow" d="M680,370 H230" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
        <text x="360" y="120" class="dim">陆地升温快 · 风从海洋吹向陆地</text>
      </template>
      <template v-else>
        <path class="flow" d="M700,390 V180" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
        <path class="flow" d="M680,190 H240" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
        <path class="flow" d="M240,200 V380" :stroke="DemoHex.cold" stroke-width="3" marker-end="url(#ah-c)" />
        <path class="flow" d="M260,370 H680" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
        <text x="360" y="120" class="dim">陆地降温快 · 风从陆地吹向海洋</text>
      </template>
    </g>

    <g v-else>
      <path d="M0,400 H960 V540 H0 Z" :fill="DemoHex.groundDark" />
      <rect x="380" y="300" width="50" height="100" :fill="DemoHex.inkFaint" />
      <rect x="450" y="250" width="60" height="150" :fill="DemoHex.inkMuted" />
      <rect x="530" y="280" width="46" height="120" :fill="DemoHex.inkFaint" />
      <path class="flow" d="M480,240 V140" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
      <path class="flow" d="M500,150 H200" :stroke="DemoHex.lift" stroke-width="2.5" marker-end="url(#ah-l)" />
      <path class="flow" d="M180,160 V390" :stroke="DemoHex.cold" stroke-width="2.5" marker-end="url(#ah-c)" />
      <path class="flow" d="M200,380 H450" :stroke="DemoHex.rain" stroke-width="2.5" marker-end="url(#ah-r)" />
      <text x="620" y="200" class="lb">城市热岛</text>
      <text x="620" y="228" class="dim">城区更暖，近地面风从郊区吹向市区</text>
    </g>
  </SceneFrame>
</template>
