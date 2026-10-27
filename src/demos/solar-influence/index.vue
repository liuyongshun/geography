<script setup lang="ts">
import { ref } from 'vue'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'
import EarthDisc from '@/demos/bx1/EarthDisc.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()

const flare = ref<'spot' | 'flare'>('flare')
</script>

<template>
  <SceneFrame>
    <template v-if="stepId === 'activity'" #tools>
      <button type="button" class="chip" :class="{ on: flare === 'spot' }" @click="flare = 'spot'">黑子</button>
      <button type="button" class="chip" :class="{ on: flare === 'flare' }" @click="flare = 'flare'">耀斑</button>
    </template>

    <g v-if="stepId === 'radiation'">
      <image href="/textures/sun-realistic.webp" x="72" y="172" width="156" height="156" />
      <text x="150" y="254" text-anchor="middle" class="lb">太阳</text>
      <EarthDisc :cx="620" :cy="270" :r="150" clip-id="sol-earth" />
      <path d="M470,270 H770" :stroke="DemoHex.earthEquator" stroke-width="1.5" fill="none" />
      <path d="M500,190 Q620,210 740,190" :stroke="DemoHex.earthTropic" stroke-width="1.2" fill="none" stroke-dasharray="5 4" />
      <path d="M500,350 Q620,330 740,350" :stroke="DemoHex.earthTropic" stroke-width="1.2" fill="none" stroke-dasharray="5 4" />
      <path class="flow" d="M230,210 C340,180 430,160 490,175" :stroke="DemoHex.lift" stroke-width="3" marker-end="url(#ah-l)" />
      <path class="flow" d="M230,250 H455" :stroke="DemoHex.warm" stroke-width="4" marker-end="url(#ah-w)" />
      <path class="flow" d="M230,300 C340,330 430,370 500,365" :stroke="DemoHex.lift" stroke-width="2" marker-end="url(#ah-l)" />
      <text x="360" y="168" class="dim">高纬：斜射，单位面积少</text>
      <text x="340" y="238" class="dim">低纬：直射，能量集中</text>
      <text x="620" y="450" text-anchor="middle" class="lb">地球</text>
      <g>
        <path class="flow" d="M620,430 v28" :stroke="DemoHex.accent" stroke-width="2" marker-end="url(#ah-a)" />
        <text x="636" y="450" class="dim">驱动大气运动 · 水循环 · 生物</text>
      </g>
      <text x="24" y="36" class="dim">示意 · 太阳辐射随纬度递减</text>
    </g>

    <g v-else>
      <image href="/textures/sun-realistic.webp" x="112" y="152" width="196" height="196" />
      <circle v-if="flare === 'spot'" cx="180" cy="230" r="14" fill="#3a2410" />
      <circle v-if="flare === 'spot'" cx="230" cy="270" r="10" fill="#3a2410" />
      <circle v-else cx="268" cy="210" r="22" :fill="DemoHex.warm" opacity="0.9" />
      <text x="210" y="360" text-anchor="middle" class="lb">{{ flare === 'spot' ? '太阳黑子' : '耀斑' }}</text>
      <ellipse cx="700" cy="250" rx="70" ry="120" fill="none" :stroke="DemoHex.cold" stroke-width="2" opacity="0.7" />
      <ellipse cx="700" cy="250" rx="110" ry="48" fill="none" :stroke="DemoHex.accent" stroke-width="1.5" opacity="0.6" />
      <EarthDisc :cx="700" :cy="250" :r="36" clip-id="sol-earth-sm" />
      <text x="700" y="254" text-anchor="middle" class="lb on-fill">地球</text>
      <path class="flow" d="M310,220 C430,160 540,140 640,175" :stroke="DemoHex.warm" stroke-width="3" marker-end="url(#ah-w)" />
      <path class="flow" d="M620,150 C660,110 720,90 760,120" :stroke="DemoHex.lift" stroke-width="2.5" marker-end="url(#ah-l)" />
      <path class="flow" d="M640,250 H780" :stroke="DemoHex.cold" stroke-width="2.5" marker-end="url(#ah-c)" />
      <path class="flow" d="M640,310 C700,360 760,380 820,360" :stroke="DemoHex.rain" stroke-width="2.5" marker-end="url(#ah-r)" />
      <text x="770" y="112" class="dim">极光</text>
      <text x="790" y="246" class="dim">无线电中断</text>
      <text x="820" y="378" class="dim">磁暴</text>
      <text x="24" y="36" class="dim">示意 · 太阳活动扰动电离层与磁场</text>
    </g>
  </SceneFrame>
</template>
