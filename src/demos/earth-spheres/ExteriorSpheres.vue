<script setup lang="ts">
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'
import EarthDisc from '@/demos/bx1/EarthDisc.vue'
</script>

<template>
  <SceneFrame>
    <template #tools>
      <span class="ex-hint">外部圈层单独示意 · 四圈相互渗透 · 生物圈跨近地面大气、水圈与岩石圈表层</span>
    </template>
    <g>
      <circle cx="490" cy="270" r="214" fill="none" :stroke="DemoHex.cold" stroke-width="26" opacity="0.16" />
      <circle cx="490" cy="270" r="196" fill="none" :stroke="DemoHex.cold" stroke-width="2" opacity="0.55" />
      <circle
        cx="490"
        cy="270"
        r="164"
        fill="none"
        :stroke="DemoHex.lift"
        stroke-width="2"
        stroke-dasharray="5 7"
        opacity="0.75"
      />
      <circle cx="490" cy="270" r="140" fill="none" :stroke="DemoHex.rain" stroke-width="9" opacity="0.42" />
      <EarthDisc :cx="490" :cy="270" :r="124" clip-id="sph-out" />

      <circle cx="430" cy="214" r="4.5" :fill="DemoHex.lift" />
      <circle cx="548" cy="228" r="4.5" :fill="DemoHex.lift" />
      <circle cx="470" cy="332" r="4.5" :fill="DemoHex.lift" />

      <path
        class="flow"
        d="M600,188 C650,150 690,132 724,118"
        :stroke="DemoHex.rain"
        stroke-width="2.5"
        marker-end="url(#ah-r)"
      />
      <path
        class="flow"
        d="M360,118 C330,150 318,186 330,220"
        :stroke="DemoHex.cold"
        stroke-width="2.5"
        marker-end="url(#ah-c)"
      />
      <path
        class="flow"
        d="M250,210 C300,196 350,206 392,228"
        :stroke="DemoHex.lift"
        stroke-width="2.5"
        marker-end="url(#ah-l)"
      />
      <path
        class="flow"
        d="M620,360 C560,392 520,400 478,392"
        :stroke="DemoHex.warm"
        stroke-width="2.5"
        marker-end="url(#ah-w)"
      />

      <path d="M748,96 H690" :stroke="DemoHex.inkDim" stroke-width="1" />
      <path d="M800,248 H640" :stroke="DemoHex.inkDim" stroke-width="1" />
      <path d="M168,168 H300" :stroke="DemoHex.inkDim" stroke-width="1" />
      <path d="M490,468 V400" :stroke="DemoHex.inkDim" stroke-width="1" />

      <text x="756" y="92" class="lb">大气圈</text>
      <text x="808" y="252" class="lb">水圈</text>
      <text x="96" y="164" class="lb">生物圈</text>
      <text x="490" y="486" text-anchor="middle" class="lb">岩石圈</text>
      <text x="490" y="518" text-anchor="middle" class="dim">岩石圈顶部与外部圈层交错 · 箭头为圈层间物质交换</text>
    </g>
  </SceneFrame>
</template>

<style scoped>
.ex-hint {
  font-size: 12px;
  color: var(--text-400);
}
</style>
