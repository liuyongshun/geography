<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{ mode: 'fold' | 'fault'; amount: number; fold: 'anticline' | 'syncline'; labels: boolean }>()
const uid = useId().replace(/:/g, '')
const colors = ['#c7b89d', '#82786a', '#d6c6a4', '#726e67', '#bca886', '#8d806d', '#c9bda1', '#77736c', '#ae9b80', '#716960']
function bend(y: number, x: number) {
  const q = (x - 500) / 380
  return y + (props.fold === 'anticline' ? -1 : 1) * props.amount * 100 * Math.cos(q * Math.PI * .65) * Math.exp(-Math.pow(q, 4))
}
function line(y: number, reverse = false) {
  const points = Array.from({ length: 81 }, (_, i) => {
    const x = i * 12.5
    return [x, bend(y, x)]
  })
  if (reverse) points.reverse()
  return points.map(point => point.join(',')).join(' L ')
}
const layers = computed(() => colors.map((color, i) => {
  const top = 210 + i * 40, bottom = top + 40
  return { color, path: `M ${line(top)} L ${line(bottom, true)} Z` }
}))
const offset = computed(() => props.amount * 100)
function faultX(y: number) { return 470 + (y - 210) * .28 }
const blocks = computed(() => colors.flatMap((color, i) => {
  const top = 210 + i * 40, bottom = top + 40
  const topR = top + offset.value, bottomR = bottom + offset.value
  return [
    { color, path: `M 0 ${top} L ${faultX(top)} ${top} L ${faultX(bottom)} ${bottom} L 0 ${bottom} Z` },
    { color, path: `M ${faultX(topR) + 5} ${topR} L 1000 ${topR} L 1000 ${bottomR} L ${faultX(bottomR) + 5} ${bottomR} Z` },
  ]
}))
</script>

<template>
  <svg class="strata" viewBox="0 0 1000 600" role="img" :aria-label="mode === 'fold' ? '水平岩层受挤压逐渐形成褶皱，可切换背斜和向斜' : '向右倾斜的断层面两侧岩层发生相对错动，右侧上盘下降形成正断层'">
    <defs>
      <pattern :id="`${uid}-rock`" patternUnits="userSpaceOnUse" width="240" height="240"><image href="/textures/rocks/sedimentary-color.jpg" width="240" height="240" /></pattern>
      <marker :id="`${uid}-arrow`" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ffd28a" /></marker>
    </defs>
    <image href="/textures/geology/landform-cutaway.jpg" x="0" y="-60" width="1000" height="667" />
    <path d="M0 175H1000V600H0Z" fill="#0c1520" opacity=".86" />
    <g v-if="mode === 'fold'">
      <g v-for="(layer, i) in layers" :key="i">
        <path :d="layer.path" :fill="layer.color" />
        <path :d="layer.path" :fill="`url(#${uid}-rock)`" opacity=".45" />
        <path :d="`M ${line(210 + i * 40)}`" fill="none" stroke="#302a23" stroke-width="3" />
        <path :d="`M ${line(225 + i * 40)}`" fill="none" stroke="#e9ddc5" stroke-width="1" opacity=".38" />
      </g>
      <path :d="`M ${line(210)}`" fill="none" stroke="#8b9e76" stroke-width="10" />
      <path d="M60 360H200" stroke="#ffd28a" stroke-width="5" :marker-end="`url(#${uid}-arrow)`" />
      <path d="M940 360H800" stroke="#ffd28a" stroke-width="5" :marker-end="`url(#${uid}-arrow)`" />
      <g v-if="labels" class="diagram-label"><text x="120" y="336">水平挤压</text><text x="880" y="336">水平挤压</text><text x="500" :y="bend(210, 500) - 24">{{ fold === 'anticline' ? '背斜 · 岩层向上拱起' : '向斜 · 岩层向下弯曲' }}</text><text x="500" y="564" class="note">{{ fold === 'anticline' ? '一般情况下，背斜岩层中间老、两翼新' : '一般情况下，向斜岩层中间新、两翼老' }}</text></g>
    </g>
    <g v-else>
      <g v-for="(block, i) in blocks" :key="i"><path :d="block.path" :fill="block.color" /><path :d="block.path" :fill="`url(#${uid}-rock)`" opacity=".43" /><path :d="block.path" fill="none" stroke="#302a23" stroke-width="2.5" /></g>
      <path d="M0 210H470" stroke="#8b9e76" stroke-width="9" /><path :d="`M ${faultX(210 + offset) + 5} ${210 + offset} H1000`" stroke="#8b9e76" stroke-width="9" />
      <path d="M470 210L579 600" stroke="#e8ae75" stroke-width="3" stroke-dasharray="8 6" />
      <path d="M406 402L383 320" stroke="#ffd28a" stroke-width="5" :marker-end="`url(#${uid}-arrow)`" />
      <path d="M619 320L642 402" stroke="#ffd28a" stroke-width="5" :marker-end="`url(#${uid}-arrow)`" />
      <g v-if="labels" class="diagram-label"><text x="267" y="164">下盘 · 相对上升</text><text x="747" :y="164 + offset">上盘 · 相对下降</text><text x="500" y="564" class="note">正断层：上盘沿断层面相对下降</text></g>
    </g>
    <rect x="24" y="24" width="194" height="31" rx="5" fill="#071321dc" /><text x="39" y="45" fill="#cfdeea" font-size="12" letter-spacing="2">地质剖面 / 过程示意</text>
  </svg>
</template>

<style scoped>
.strata{display:block;width:100%;height:100%;position:absolute;inset:0}.diagram-label text{font-family:"PingFang SC","Microsoft YaHei",sans-serif;fill:#f8e1b5;font-size:19px;font-weight:600;text-anchor:middle;paint-order:stroke;stroke:#102031;stroke-width:5px;stroke-linejoin:round}.diagram-label text.note{font-size:16px;fill:#e2e9ef;font-weight:400}
@container(max-width:570px){.diagram-label text{font-size:28px}.diagram-label text.note{font-size:24px}}
</style>
