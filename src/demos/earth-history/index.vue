<script setup lang="ts">
import { ref } from 'vue'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex } from '@/demos/theme'
import SceneFrame from '@/demos/bx1/SceneFrame.vue'

defineProps<{ stepId: string; demo: DemoEntry }>()

const era = ref(3)
const eras = [
  { name: '太古宙', note: '地壳形成 · 原核生命' },
  { name: '元古宙', note: '蓝藻繁盛 · 氧气积累' },
  { name: '古生代', note: '鱼类 · 陆生植物与两栖' },
  { name: '中生代', note: '爬行动物 · 裸子植物' },
  { name: '新生代', note: '哺乳动物 · 人类出现' },
]
</script>

<template>
  <SceneFrame>
    <template v-if="stepId === 'eras'" #tools>
      <button
        v-for="(e, i) in eras"
        :key="e.name"
        type="button"
        class="chip"
        :class="{ on: era === i }"
        @click="era = i"
      >
        {{ e.name }}
      </button>
    </template>

    <g v-if="stepId === 'strata'">
      <path d="M180,80 L420,80 L520,460 L80,460 Z" fill="#3a342c" />
      <path d="M190,140 H470" :stroke="DemoHex.lift" stroke-width="18" opacity="0.85" />
      <path d="M175,210 H490" :stroke="DemoHex.warm" stroke-width="22" opacity="0.8" />
      <path d="M150,290 H505" :stroke="DemoHex.sink" stroke-width="26" opacity="0.75" />
      <path d="M120,370 H515" :stroke="DemoHex.ground" stroke-width="28" />
      <circle cx="300" cy="140" r="7" :fill="DemoHex.cloud" />
      <circle cx="340" cy="210" r="8" :fill="DemoHex.ink" />
      <circle cx="280" cy="290" r="9" :fill="DemoHex.lift" />
      <path class="flow" d="M560,420 V120" :stroke="DemoHex.accent" stroke-width="3" marker-end="url(#ah-a)" />
      <text x="572" y="160" class="lb">上新</text>
      <text x="572" y="400" class="lb">下老</text>
      <text x="620" y="200" class="dim">同一层位化石可对比年代</text>
      <text x="620" y="224" class="dim">下伏地层形成更早</text>
      <text x="24" y="36" class="dim">示意 · 地层与化石</text>
    </g>

    <g v-else>
      <path d="M80,250 H880" :stroke="DemoHex.inkFaint" stroke-width="4" />
      <path class="flow" d="M100,250 H840" :stroke="DemoHex.accent" stroke-width="3" marker-end="url(#ah-a)" />
      <g v-for="(e, i) in eras" :key="e.name">
        <circle
          :cx="140 + i * 170"
          cy="250"
          r="16"
          :fill="era === i ? DemoHex.lift : DemoHex.panel"
          :stroke="DemoHex.accent"
          stroke-width="2"
        />
        <text :x="140 + i * 170" y="210" text-anchor="middle" class="lb">{{ e.name }}</text>
      </g>
      <rect x="250" y="330" width="460" height="90" rx="12" :fill="DemoHex.panel" :stroke="DemoHex.accent" />
      <text x="480" y="368" text-anchor="middle" class="lb">{{ eras[era]!.name }}</text>
      <text x="480" y="394" text-anchor="middle" class="dim">{{ eras[era]!.note }}</text>
      <text x="24" y="36" class="dim">示意 · 地质年代从老到新</text>
    </g>
  </SceneFrame>
</template>
