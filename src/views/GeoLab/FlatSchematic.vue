<script setup lang="ts">
import { computed } from 'vue'
import glossaryJson from '@content/atmosphere/glossary.json'
import pressureHighUrl from '@meteocons/svg/line/pressure-high.svg?url'
import pressureLowUrl from '@meteocons/svg/line/pressure-low.svg?url'
import windUrl from '@meteocons/svg/line/wind.svg?url'
import {
  PRESSURE_BELTS,
  WIND_BELTS,
  latToY,
  shiftedLat,
  type HotspotId,
} from '@/engine/atmosphere'
import { useGeoSceneStore } from '@/stores/geoScene'

const store = useGeoSceneStore()
const glossary = glossaryJson as Record<string, { term: string; hint: string }>

const W = 640
const H = 520

function y(lat: number) {
  return latToY(lat, H)
}

function beltY(base: number) {
  return y(shiftedLat(base, store.month, store.axialTilt))
}

function isOn(id: HotspotId) {
  return store.highlightId === id || store.hoverId === id
}

function pick(id: HotspotId) {
  store.setHighlight(id)
}

function enter(id: HotspotId) {
  store.hoverId = id
}

function leave() {
  store.hoverId = null
}

const windArrows = computed(() => {
  const c = store.coriolis
  return WIND_BELTS.map((w) => {
    const cy = beltY(w.baseLat)
    const nh = w.baseLat > 0
    let d: string
    if (c) {
      if (w.id === 'trade_n') d = `M 200 ${cy + 18} L 430 ${cy - 14}`
      else if (w.id === 'trade_s') d = `M 200 ${cy - 18} L 430 ${cy + 14}`
      else if (w.id === 'westerly_n') d = `M 200 ${cy + 10} L 430 ${cy - 8}`
      else if (w.id === 'westerly_s') d = `M 200 ${cy - 10} L 430 ${cy + 8}`
      else if (w.id === 'polar_easterly_n') d = `M 200 ${cy - 8} L 430 ${cy + 10}`
      else d = `M 200 ${cy + 8} L 430 ${cy - 10}`
    } else if (w.id.includes('trade')) {
      d = nh ? `M 320 ${cy + 28} L 320 ${cy - 8}` : `M 320 ${cy - 28} L 320 ${cy + 8}`
    } else if (w.id.includes('westerly')) {
      d = nh ? `M 320 ${cy - 22} L 320 ${cy + 12}` : `M 320 ${cy + 22} L 320 ${cy - 12}`
    } else {
      d = nh ? `M 320 ${cy - 18} L 320 ${cy + 14}` : `M 320 ${cy + 18} L 320 ${cy - 14}`
    }
    return { ...w, cy, d }
  })
})

const cellLoops = computed(() => {
  const paths = [
    `M 560 ${beltY(0)} C 600 ${beltY(0) - 10}, 610 ${beltY(30)}, 575 ${beltY(30)} C 550 ${beltY(20)}, 545 ${beltY(8)}, 560 ${beltY(0)}`,
    `M 560 ${beltY(30)} C 610 ${beltY(45)}, 600 ${beltY(60)}, 575 ${beltY(60)} C 548 ${beltY(50)}, 545 ${beltY(38)}, 560 ${beltY(30)}`,
    `M 560 ${beltY(60)} C 605 ${beltY(75)}, 590 ${beltY(88)}, 575 ${beltY(88)} C 548 ${beltY(78)}, 545 ${beltY(68)}, 560 ${beltY(60)}`,
    `M 560 ${beltY(0)} C 600 ${beltY(0) + 10}, 610 ${beltY(-30)}, 575 ${beltY(-30)} C 550 ${beltY(-20)}, 545 ${beltY(-8)}, 560 ${beltY(0)}`,
  ]
  return paths.map((d, i) => ({ id: `cell-${i}`, d, delay: `${i * 0.35}s` }))
})

const hoverText = computed(() => {
  const id = store.hoverId || store.highlightId
  if (!id || !glossary[id]) return null
  return glossary[id]
})

const thermalLow = computed(
  () => store.landSea && store.month >= 5 && store.month <= 8,
)
</script>

<template>
  <div class="flat">
    <svg :viewBox="`0 0 ${W} ${H}`" class="sheet" role="img" aria-label="气压带风带扁平示意图">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="#4aa3d9" />
        </marker>
        <marker id="arrowOn" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="#7ec4eb" />
        </marker>
        <linearGradient id="lowFill" x1="0" x2="0" y1="0" y2="1">
          <stop stop-color="#4aa3d9" stop-opacity="0.42" />
          <stop offset="1" stop-color="#3a506b" stop-opacity="0.2" />
        </linearGradient>
        <linearGradient id="highFill" x1="0" x2="0" y1="0" y2="1">
          <stop stop-color="#e8a317" stop-opacity="0.45" />
          <stop offset="1" stop-color="#3a506b" stop-opacity="0.18" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" :width="W" :height="H" fill="#080c12" rx="12" />

      <g v-for="lat in [90, 60, 30, 0, -30, -60, -90]" :key="lat">
        <line x1="70" :y1="y(lat)" x2="560" :y2="y(lat)" stroke="#2a3954" stroke-dasharray="3 5" />
        <text x="16" :y="y(lat) + 4" fill="#5a7388" font-size="11">{{ lat }}°</text>
      </g>

      <!-- pressure belts -->
      <g v-for="b in PRESSURE_BELTS" :key="b.id" class="belt-group">
        <rect
          x="88"
          :y="beltY(b.baseLat) - 18"
          width="300"
          height="36"
          rx="6"
          :fill="b.pressure === 'low' ? 'url(#lowFill)' : 'url(#highFill)'"
          :stroke="isOn(b.id) ? '#7ec4eb' : 'transparent'"
          stroke-width="2"
          class="hot belt-pulse"
          @click="pick(b.id)"
          @pointerenter="enter(b.id)"
          @pointerleave="leave"
        />
        <image
          :href="b.pressure === 'low' ? pressureLowUrl : pressureHighUrl"
          x="92"
          :y="beltY(b.baseLat) - 16"
          width="34"
          height="34"
          class="hot glyph"
          @click="pick(b.id)"
          @pointerenter="enter(b.id)"
          @pointerleave="leave"
        />
        <circle
          :cx="368"
          :cy="beltY(b.baseLat)"
          r="11"
          :fill="b.pressure === 'low' ? '#4aa3d9' : '#e8a317'"
          :opacity="isOn(b.id) ? 1 : 0.9"
          class="hot"
          @click="pick(b.id)"
          @pointerenter="enter(b.id)"
          @pointerleave="leave"
        />
        <text
          :x="368"
          :y="beltY(b.baseLat) + 4"
          text-anchor="middle"
          fill="#0a1018"
          font-size="11"
          font-weight="700"
          class="hot"
          @click="pick(b.id)"
          @pointerenter="enter(b.id)"
          @pointerleave="leave"
        >{{ b.pressure === 'low' ? 'L' : 'H' }}</text>
        <text
          x="248"
          :y="beltY(b.baseLat) + 5"
          text-anchor="middle"
          :fill="isOn(b.id) ? '#7ec4eb' : '#e8f4f8'"
          font-size="12"
          font-weight="600"
          class="hot"
          @click="pick(b.id)"
          @pointerenter="enter(b.id)"
          @pointerleave="leave"
        >{{ b.label }}</text>
      </g>

      <!-- wind arrows -->
      <g v-for="w in windArrows" :key="w.id">
        <path
          :d="w.d"
          fill="none"
          :stroke="isOn(w.id) ? '#7ec4eb' : '#4aa3d9'"
          stroke-width="2.4"
          :marker-end="isOn(w.id) ? 'url(#arrowOn)' : 'url(#arrow)'"
          class="hot wind-flow"
          @click="pick(w.id)"
          @pointerenter="enter(w.id)"
          @pointerleave="leave"
        />
        <image
          :href="windUrl"
          x="468"
          :y="w.cy - 14"
          width="26"
          height="26"
          class="hot glyph"
          @click="pick(w.id)"
          @pointerenter="enter(w.id)"
          @pointerleave="leave"
        />
        <text
          x="498"
          :y="w.cy + 4"
          font-size="11"
          :fill="isOn(w.id) ? '#7ec4eb' : '#b8c9d4'"
          class="hot"
          @click="pick(w.id)"
          @pointerenter="enter(w.id)"
          @pointerleave="leave"
        >{{ w.label }}</text>
      </g>

      <!-- three-cell loops with circulating dots -->
      <g fill="none" stroke="#2ec4b6" stroke-width="1.4" opacity="0.9">
        <path
          v-for="loop in cellLoops"
          :key="loop.id"
          :id="loop.id"
          :d="loop.d"
          class="cell-path"
        />
      </g>
      <circle
        v-for="loop in cellLoops"
        :key="`${loop.id}-dot`"
        r="3.2"
        fill="#7ec4eb"
        opacity="0.95"
      >
        <animateMotion
          :dur="`${3.6 + Number(loop.delay.replace('s', ''))}s`"
          repeatCount="indefinite"
          :begin="loop.delay"
        >
          <mpath :xlink:href="`#${loop.id}`" />
        </animateMotion>
      </circle>
      <text x="568" :y="beltY(15)" fill="#7ec4eb" font-size="10">三圈</text>

      <g v-if="thermalLow">
        <ellipse cx="238" :cy="beltY(40)" rx="54" ry="20" fill="#4aa3d9" opacity="0.35" stroke="#7ec4eb" class="belt-pulse" />
        <text x="238" :y="beltY(40) + 4" text-anchor="middle" fill="#e8f4f8" font-size="11">大陆热低压</text>
      </g>
    </svg>
    <p v-if="hoverText" class="tip">
      <strong>{{ hoverText.term }}</strong>
      {{ hoverText.hint }}
    </p>
    <p v-else class="hint">点击色带或风带名称，与 3D 同步高亮</p>
  </div>
</template>

<style scoped>
.flat {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 320px;
}
.sheet {
  width: 100%;
  height: calc(100% - 36px);
  background: var(--bg-canvas);
  border-radius: var(--r-lg);
  box-shadow: var(--glow-teal);
}
.hot {
  cursor: pointer;
}
.glyph {
  pointer-events: auto;
}
.wind-flow {
  stroke-dasharray: 10 8;
  animation: wind-dash 1.1s linear infinite;
}
.belt-pulse {
  animation: belt-breathe 2.8s ease-in-out infinite;
}
.cell-path {
  stroke-dasharray: 4 6;
  animation: wind-dash 2.4s linear infinite;
}
@keyframes wind-dash {
  to {
    stroke-dashoffset: -36;
  }
}
@keyframes belt-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.82;
  }
}
.tip,
.hint {
  margin: 8px 4px 0;
  font-size: 12px;
  color: var(--text-500);
  min-height: 18px;
}
.tip strong {
  color: var(--text-900);
  margin-right: 6px;
}
</style>
