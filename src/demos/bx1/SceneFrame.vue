<script setup lang="ts">
import { DemoHex } from '@/demos/theme'

const arrows = [
  { id: 'ah-c', fill: DemoHex.cold },
  { id: 'ah-w', fill: DemoHex.warm },
  { id: 'ah-l', fill: DemoHex.lift },
  { id: 'ah-r', fill: DemoHex.rain },
  { id: 'ah-a', fill: DemoHex.accent },
  { id: 'ah-s', fill: DemoHex.sink },
] as const
</script>

<template>
  <div class="bx1">
    <div v-if="$slots.tools" class="toolbar">
      <slot name="tools" />
    </div>
    <svg class="canvas" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="bx-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#121e30" />
          <stop offset="100%" stop-color="#070b16" />
        </linearGradient>
        <radialGradient id="bx-glow" cx="42%" cy="38%" r="55%">
          <stop offset="0%" stop-color="#1a3352" stop-opacity="0.45" />
          <stop offset="100%" stop-color="#070b16" stop-opacity="0" />
        </radialGradient>
        <marker
          v-for="a in arrows"
          :id="a.id"
          :key="a.id"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 Z" :fill="a.fill" />
        </marker>
      </defs>
      <rect width="960" height="540" fill="url(#bx-sky)" />
      <rect width="960" height="540" fill="url(#bx-glow)" />
      <slot />
    </svg>
  </div>
</template>
