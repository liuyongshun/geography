<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{ phase: number; progress: number; time: number }>()
const uid = useId().replace(/:/g, '')
const amount = computed(() => Math.min(1, Math.max(0, props.progress)))
const rockPath = 'M55 77L103 55L204 65L241 103L224 171L151 192L74 167Z'
const grains = computed(() => Array.from({ length: 28 }, (_, i) => {
  const t = (props.time * .22 + i / 28) % 1
  return { x: 53 + t * 192, y: 52 + t * 107 + Math.sin(t * 7 + i) * 5, r: 1.5 + i % 3 }
}))
const crystals = Array.from({ length: 19 }, (_, i) => ({ x: 88 + (i * 37 % 122), y: 88 + (i * 29 % 64), size: 3 + i % 4 }))
const names = ['岩浆沿通道上升', '熔融 → 冷却结晶', '岩石破碎 → 搬运沉积', '松散沉积物 → 固结成岩', '固态岩石 → 变质岩', '岩石重熔 → 岩浆']
</script>

<template>
  <div v-if="phase > 0" class="formation-inset" :aria-label="names[phase]">
    <div class="inset-title"><span>{{ names[phase] }}</span><small>过程放大</small></div>
    <svg viewBox="0 0 300 218" role="img" :aria-label="names[phase]">
      <defs>
        <pattern :id="`${uid}-rock`" width="150" height="150" patternUnits="userSpaceOnUse"><image href="/textures/rocks/igneous-color.jpg" width="150" height="150" /></pattern>
        <pattern :id="`${uid}-sed`" width="180" height="100" patternUnits="userSpaceOnUse"><image href="/textures/rocks/strata-color.jpg" width="180" height="100" /></pattern>
        <pattern :id="`${uid}-meta`" width="180" height="150" patternUnits="userSpaceOnUse"><image href="/textures/rocks/gneiss-color.jpg" width="180" height="150" /></pattern>
        <pattern :id="`${uid}-lava`" width="150" height="150" patternUnits="userSpaceOnUse"><image href="/textures/rocks/lava-color.jpg" width="150" height="150" /></pattern>
        <marker :id="`${uid}-arrow`" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#f0c58d" /></marker>
      </defs>
      <g v-if="phase === 1">
        <path :d="rockPath" :fill="`url(#${uid}-lava)`" stroke="#e9ac73" />
        <path :d="rockPath" :fill="`url(#${uid}-rock)`" :opacity="amount" />
        <path d="M80 36L106 66M220 36L198 68" fill="none" stroke="#91cbe7" stroke-width="2" />
        <text x="150" y="29">温度降低</text>
        <text x="150" y="210">{{ amount < .55 ? '结晶逐渐形成' : '岩浆岩形成' }}</text>
      </g>
      <g v-else-if="phase === 2">
        <path d="M12 159L54 60L110 100L145 149L211 165L288 177V196H12Z" :fill="`url(#${uid}-rock)`" stroke="#9b8c78" />
        <path d="M54 62L65 91L54 116M66 91L90 103M90 103L104 130" stroke="#142131" stroke-width="4" fill="none" />
        <path d="M90 129Q161 141 207 167T279 174" fill="none" stroke="#77bfd8" stroke-width="5" />
        <path d="M125 115Q177 131 228 152" fill="none" stroke="#f0c58d" stroke-width="2" :marker-end="`url(#${uid}-arrow)`" />
        <circle v-for="(grain, i) in grains" :key="i" :cx="grain.x" :cy="grain.y" :r="grain.r" fill="#dfbc83" />
        <text x="68" y="38">风化、侵蚀</text><text x="220" y="129">搬运</text><text x="245" y="210">堆积</text>
      </g>
      <g v-else-if="phase === 3">
        <path d="M22 190Q150 202 278 190" fill="none" stroke="#8c8473" stroke-width="3" />
        <g v-for="i in 5" :key="i" :opacity="Math.min(1, Math.max(0, amount * 6 - (i - 1)))">
          <path :d="`M35 ${180-i*21} Q150 ${190-i*21} 265 ${180-i*21} L265 ${198-i*21} Q150 ${208-i*21} 35 ${198-i*21}Z`" :fill="`url(#${uid}-sed)`" stroke="#baaa8e" :stroke-width="amount < .68 ? 1 : 2" />
          <circle v-for="j in 12" :key="j" :cx="43+j*17" :cy="188-i*21+(j%2)*3" r="2" fill="#d9c6a1" :opacity="1-amount*.65" />
        </g>
        <path d="M150 21V61" fill="none" stroke="#f0c58d" stroke-width="3" :marker-end="`url(#${uid}-arrow)`" />
        <text x="225" y="39">压实、胶结</text><text x="150" y="215">{{ amount < .6 ? '沉积物逐层堆积' : '颗粒间隙减小，形成沉积岩' }}</text>
      </g>
      <g v-else-if="phase === 4">
        <path :d="rockPath" :fill="`url(#${uid}-sed)`" stroke="#baaa8e" />
        <path :d="rockPath" :fill="`url(#${uid}-meta)`" :opacity="amount" />
        <path v-for="(pressurePath,i) in ['M19 119H47','M279 119H250','M150 20V48']" :key="i" :d="pressurePath" fill="none" stroke="#f0c58d" stroke-width="3" :marker-end="`url(#${uid}-arrow)`" />
        <path v-for="(crystal,i) in crystals" :key="i" :d="`M${crystal.x} ${crystal.y-crystal.size}l${crystal.size} ${crystal.size}l-${crystal.size} ${crystal.size}l-${crystal.size} -${crystal.size}Z`" fill="#eadcc3" :opacity="amount*.65" />
        <text x="73" y="35">压力增加</text><text x="229" y="35">温度升高</text><text x="150" y="215">矿物或结构改变，通常保持固态</text>
      </g>
      <g v-else>
        <path :d="rockPath" :fill="`url(#${uid}-meta)`" stroke="#baaa8e" />
        <path :d="rockPath" :fill="`url(#${uid}-lava)`" :opacity="amount" />
        <path d="M65 127Q150 110 233 143M78 151Q170 139 212 160" fill="none" stroke="#ffb75d" :opacity="amount" :stroke-width="2+amount*4" />
        <text x="150" y="31">在适宜条件下重新熔融</text><text x="150" y="215">{{ amount < .55 ? '岩石逐渐熔融' : '回到岩浆，开始新的循环' }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.formation-inset{position:absolute;right:3%;bottom:4%;width:43%;border:1px solid #566677;background:#091524f5;border-radius:8px;overflow:hidden}.inset-title{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:8px 10px 0;color:#e9ceb0;font-size:10px}.inset-title small{color:#839bb0;font-size:8px;white-space:nowrap}.formation-inset svg{display:block;width:100%;height:auto}.formation-inset text{font:11px "PingFang SC","Microsoft YaHei",sans-serif;fill:#d3e2ed;text-anchor:middle;paint-order:stroke;stroke:#091524;stroke-width:3px;stroke-linejoin:round}@media(max-width:750px){.formation-inset{width:51%}.inset-title{font-size:8px;padding:6px 6px 0}.inset-title small{display:none}}
@container(max-width:570px){.formation-inset{width:61%}.formation-inset text{font-size:14px}.inset-title{font-size:10px}}
</style>
