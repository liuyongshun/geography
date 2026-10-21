<script setup lang="ts">
import { ref } from 'vue'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()
const band = ref<'forest' | 'grass' | 'desert'>('forest')
</script>

<template>
  <SceneFrame>
    <template v-if="stepId === 'horizontal'" #tools>
      <button type="button" class="chip" :class="{ on: band === 'forest' }" @click="band = 'forest'">森林</button>
      <button type="button" class="chip" :class="{ on: band === 'grass' }" @click="band = 'grass'">草原</button>
      <button type="button" class="chip" :class="{ on: band === 'desert' }" @click="band = 'desert'">荒漠</button>
    </template>

    <g v-if="stepId === 'horizontal'">
      <path class="flow" d="M80,80 H860" :stroke="DemoHex.rain" stroke-width="3" marker-end="url(#ah-r)" />
      <text x="80" y="64" class="dim">水分减少 →</text>
      <rect x="60" y="160" width="250" height="280" :fill="band === 'forest' ? '#1f6b45' : '#163828'" />
      <rect x="340" y="220" width="250" height="220" :fill="band === 'grass' ? '#7a9a48' : '#3d4e30'" />
      <rect x="620" y="280" width="250" height="160" :fill="band === 'desert' ? '#c4a36a' : '#6a5840'" />
      <text x="120" y="200" class="lb">森林</text>
      <text x="400" y="260" class="lb">草原</text>
      <text x="690" y="320" class="lb">荒漠</text>
      <text x="80" y="480" class="dim">
        {{ band === 'forest' ? '水热充足 · 乔木为主' : band === 'grass' ? '半干旱 · 草本为主' : '干旱 · 植被稀疏' }}
      </text>
    </g>
    <g v-else>
      <path d="M180,460 L480,80 L780,460 Z" fill="#3d5a40" />
      <path d="M260,460 L480,180 L700,460 Z" fill="#6a8a48" />
      <path d="M360,460 L480,300 L600,460 Z" fill="#c4a36a" />
      <path class="flow" d="M80,200 H240" :stroke="DemoHex.cold" stroke-width="2.5" marker-end="url(#ah-c)" />
      <text x="80" y="140" class="lb">从山麓到山顶</text>
      <text x="80" y="168" class="dim">水热组合随海拔变化</text>
      <text x="500" y="160" class="dim">高山草甸 / 冰雪</text>
      <text x="300" y="300" class="dim">针叶林</text>
      <text x="200" y="430" class="dim">基带随纬度而变</text>
    </g>
  </SceneFrame>
</template>
