<script setup lang="ts">
/**
 * 地球圆盘：裁切 NASA Blue Marble，禁止纯色圆代替地表。
 */
defineProps<{
  cx: number
  cy: number
  r: number
  /** 同一 SVG 内多颗地球时必须不同 */
  clipId: string
}>()
</script>

<template>
  <g>
    <clipPath :id="clipId">
      <circle :cx="cx" :cy="cy" :r="r" />
    </clipPath>
    <g :clip-path="`url(#${clipId})`">
      <image
        href="/textures/earth-blue-marble.jpg"
        :x="cx - r * 1.15"
        :y="cy - r * 1.05"
        :width="r * 2.3"
        :height="r * 2.3"
        preserveAspectRatio="xMidYMid slice"
      />
    </g>
    <circle :cx="cx" :cy="cy" :r="r" fill="none" stroke="#8aa0b4" stroke-width="1.2" />
  </g>
</template>
