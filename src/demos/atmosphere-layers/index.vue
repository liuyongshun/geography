<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import { DemoHex as C } from '@/demos/theme'
import AtmosphereFrame from '@/demos/atmosphere-shared/AtmosphereFrame.vue'
import { createAtmosphereScene, at, v, type AtmosphereScene } from '@/demos/atmosphere-shared/scene'

const props = defineProps<{ stepId: string; demo: DemoEntry }>()
const frame = ref<InstanceType<typeof AtmosphereFrame>>()
const playing = ref(true)
const error = ref('')
const component = ref<'dry' | 'vapor' | 'dust'>('dry')
const focus = ref<'all' | 'tropo' | 'strato' | 'upper'>('all')
const altitude = ref(8)
const components = [ { id: 'dry', title: '干洁空气' }, { id: 'vapor', title: '水汽' }, { id: 'dust', title: '固体杂质' } ] as const
const layers = [ { id: 'all', title: '全部' }, { id: 'tropo', title: '对流层' }, { id: 'strato', title: '平流层' }, { id: 'upper', title: '高层大气' } ] as const
const composing = computed(() => props.stepId === 'compose')
const componentText = computed(() => ({
  dry: { title: '干洁空气 · 体积分数', text: '氮气约 78%，氧气约 21%，氩等其他气体约 1%。', extra: '氮是生物体的重要元素；氧维持生命活动；微量二氧化碳参与光合作用并吸收长波辐射。' },
  vapor: { title: '水汽 · 含量因时因地变化', text: '水汽是成云致雨的物质来源，也是重要的温室气体。', extra: '吸收地面长波辐射，凝结时释放潜热。水汽不计入干洁空气的 78% / 21% / 1%。' },
  dust: { title: '固体杂质 · 凝结核', text: '尘埃、海盐等微粒可充当凝结核，帮助水汽凝结成云滴。', extra: '部分微粒散射或吸收太阳辐射；较大尘埃还可反射太阳辐射。数量不等同于图中示意。' },
}[component.value]))
function temperature(h: number) {
  if (h <= 12) return 15 - 6.5 * h
  if (h <= 20) return -63
  if (h <= 50) return -63 + (h - 20) * 2.1
  return -(h - 50) * 2.5
}
const layerName = computed(() => altitude.value < 12 ? '对流层' : altitude.value < 50 ? '平流层' : '高层大气')
const hint = computed(() => composing.value ? '从空气成分，观察生命、天气与保温的物质基础' : '按气温的垂直变化分层 · 拖动高度探针观察温度')
const note = computed(() => composing.value ? '低层大气由干洁空气、水汽和固体杂质组成；含量少的成分也能发挥重要作用。' : '对流层上冷下热，利于对流；平流层上热下冷，层结稳定。对流层顶高度随纬度和季节变化，图取约 12 km。')
let stage: AtmosphereScene | undefined
let probe: THREE.Mesh | undefined
let probeTag: THREE.Sprite | undefined
// 与受热过程共用 15.6 / 24.2 / 33.5 的教学球壳，物理高度在面板中注明。
const heightY = (h: number) => h <= 12 ? h / 12 * 15.6 : h <= 50 ? 15.6 + (h - 12) / 38 * 8.6 : 24.2 + (h - 50) / 35 * 9.3
const profileX = (h: number) => 24 + (temperature(h) + 90) * 1.1
const profileY = (h: number) => 132 - h / 85 * 120
const profilePoints = [0, 12, 20, 32, 50, 70, 85].map((h) => `${profileX(h)},${profileY(h)}`).join(' ')

function compositionScene(s: AtmosphereScene) {
  s.region(31, 105)
  s.shell(15.6, C.cold, .15)
  s.shell(24.2, C.coldSoft, .12)
  s.shell(33.5, C.air, .07)
  s.cloud(-25, 8.5, -4, .8)
  s.cloud(24, 10, -6, 1)
  s.label('中国 · 真实地表', v(-5, 1.3, 20), C.inkMuted, 1.35)
  // 物质直接分布在地球低层大气内，分子点位仅用于观察成分作用。
  const colors = component.value === 'dry' ? [C.coldSoft, C.cloud, C.lift] : component.value === 'vapor' ? [C.rain] : [C.soil]
  for (let i = 0; i < (component.value === 'dry' ? 100 : 42); i++) {
    const x = -32 + (i * 19 % 67)
    const h = 3 + (i * 7 % 11)
    const z = -6 + (i * 11 % 15)
    const color = component.value === 'dry' ? colors[i < 78 ? 0 : i < 99 ? 1 : 2]! : colors[0]!
    const dot = s.mesh(new THREE.SphereGeometry(component.value === 'dust' ? .25 : .13, 8, 6), color, v(x, h, z), .8)
    s.ticks.push((t) => dot.position.copy(at(x + Math.sin(t * .2 + i) * .18, h + Math.sin(t * .25 + i) * .12, z)))
  }
  if (component.value === 'dry') {
    s.label('氮气 N₂ · 78%', v(-25, 12, 13), C.coldSoft, 1.65)
    s.label('氧气 O₂ · 21%', v(2, 15, 10), C.ink, 1.65)
    s.label('其他气体 · 约 1%', v(27, 7, 12), C.lift, 1.45)
    s.flow([v(7, 1, 2), v(7, 5, 2), v(10, 9, 2)], C.warm, .06, 1)
    s.label('微量 CO₂ · 吸收长波', v(-3, 5, 17), C.warm, 1.3)
  } else if (component.value === 'vapor') {
    s.cloud(0, 9, 2, 1.1)
    s.flow([v(-12, .8, 5), v(-12, 4, 5), v(-9, 9, 5)], C.rain, .07, 2)
    s.flow([v(14, 1, 5), v(14, 5, 5), v(11, 10, 5)], C.warm, .06, 1)
    s.label('蒸发 · 水汽进入大气', v(-20, 4, 17), C.rain, 1.4)
    s.label('水汽凝结 · 成云致雨', v(2, 15, 14), C.cloud, 1.5)
    s.label('吸收地面长波', v(23, 5, 17), C.warm, 1.3)
  } else {
    s.cloud(0, 9, 2, 1.1)
    s.label('尘埃、海盐 · 凝结核', v(-15, 5, 16), C.lift, 1.5)
    s.label('水汽凝结 → 云滴', v(9, 14, 13), C.rain, 1.5)
    s.flow([v(-17, 22, -3), v(0, 9, 2), v(15, 16, 5)], C.lift, .05, 2)
    s.label('散射 / 反射太阳辐射', v(10, 22, 12), C.lift, 1.35)
  }
}
function layerScene(s: AtmosphereScene) {
  s.region(31, 105)
  s.shell(15.6, C.cold, focus.value === 'all' || focus.value === 'tropo' ? .2 : .045)
  s.shell(24.2, C.coldSoft, focus.value === 'all' || focus.value === 'strato' ? .3 : .045)
  s.shell(33.5, C.air, focus.value === 'all' || focus.value === 'upper' ? .15 : .045)
  s.label('对流层 · 0—12 km', v(-21, 7, 15), C.cold, 1.3)
  s.label('平流层 · 12—50 km', v(-21, 20, 15), C.coldSoft, 1.3)
  s.label('高层大气 · 50 km 以上', v(-21, 30, 15), C.inkMuted, 1.3)
  s.label('中国 · 真实地表', v(-8, 1.2, 22), C.inkMuted, 1.3)
  if (focus.value === 'all' || focus.value === 'tropo') {
    s.cloud(-6, 9, -2, 1)
    s.cloud(28, 8, -4, .7)
    s.flow([v(-4, 1, 2), v(-4, 7, 2), v(-1, 13, 2)], C.warm, .07, 2)
    s.flow([v(9, 13, 0), v(12, 7, 0), v(12, 1, 0)], C.cold, .07, 2)
    s.label('上冷下热 · 对流运动', v(3, 5, 17), C.warm, 1.25)
  }
  if (focus.value === 'all' || focus.value === 'strato') {
    s.showSun(-20, 44, -2)
    s.flow([v(-20, 40, -2), v(-8, 30, -1), v(5, 21, 0)], C.cold, .045, 2)
    s.flow([v(-13, 18.5, 0), v(3, 19, 0), v(25, 18.5, 0)], C.lift, .045, 3)
    s.label('臭氧吸收紫外 · 增温', v(10, 25, 13), C.lift, 1.45)
  }
  probe = s.mesh(new THREE.SphereGeometry(.45, 18, 14), C.lift, v(27, heightY(altitude.value) + .4, 5))
  probeTag = s.label('高度探针', v(27, heightY(altitude.value) + 3, 9), C.lift, 1.2)
  s.line([v(27, .3, 5), v(27, 17, 5), v(27, 35, 5)], C.inkDim, .055, .4)
}
function rebuild() {
  if (!stage) return
  stage.clear()
  probe = undefined
  probeTag = undefined
  if (composing.value) compositionScene(stage)
  else layerScene(stage)
}
watch([() => props.stepId, component, focus], rebuild)
watch(altitude, () => {
  probe?.position.copy(at(27, heightY(altitude.value) + .4, 5))
  probeTag?.position.copy(at(27, heightY(altitude.value) + 3, 9))
})
watch(focus, (value) => {
  if (value === 'tropo') altitude.value = 8
  if (value === 'strato') altitude.value = 30
  if (value === 'upper') altitude.value = 70
})
onMounted(() => {
  if (!frame.value?.host || !frame.value.canvas) return
  try {
    stage = createAtmosphereScene(frame.value.host, frame.value.canvas)
    stage.camera.position.set(0, 30, 112)
    stage.controls.target.set(0, 18, 0)
    stage.controls.saveState()
    rebuild()
    stage.start(() => playing.value)
  } catch { error.value = '三维场景暂时无法启动，请检查浏览器的 WebGL 支持。' }
})
onUnmounted(() => stage?.dispose())
</script>

<template>
  <AtmosphereFrame ref="frame" :title="composing ? '大气的组成' : '大气的垂直分层'" :hint="hint" :note="note" :playing="playing" :error="error" @toggle="playing = !playing" @reset="stage?.controls.reset()">
    <template #tools>
      <template v-if="composing"><button v-for="item in components" :key="item.id" type="button" class="chip" :class="{ on: component === item.id }" :aria-pressed="component === item.id" @click="component = item.id">{{ item.title }}</button></template>
      <template v-else><button v-for="item in layers" :key="item.id" type="button" class="chip" :class="{ on: focus === item.id }" :aria-pressed="focus === item.id" @click="focus = item.id">{{ item.title }}</button></template>
    </template>
    <template #panel>
      <template v-if="composing"><h3>{{ componentText.title }}</h3><p>{{ componentText.text }}</p><small>{{ componentText.extra }}</small><small class="separation">{{ component === 'dry' ? '其他气体以氩为主；粒子为低层大气成分示意。' : '分子与微粒大小、间距为教学示意。' }}</small></template>
      <template v-else>
        <h3>高度探针 · {{ altitude }} km</h3>
        <label for="atmosphere-altitude">{{ layerName }} · {{ Math.round(temperature(altitude)) }} °C</label>
        <input id="atmosphere-altitude" v-model.number="altitude" type="range" min="0" max="85" step="1" aria-label="探测高度（千米）" />
        <p v-if="altitude < 12">每升高 1 km，气温平均下降约 6.5 °C。天气现象集中在此层。</p>
        <p v-else-if="altitude < 50">上部因臭氧吸收紫外线而增温；以水平运动为主，利于航空飞行。</p>
        <p v-else>50 km 以上统称高层大气。气温先降低，之后在热层升高；部分区域发生电离。</p>
        <svg class="temperature-profile" viewBox="0 0 180 150" role="img" aria-label="气温随高度变化的示意曲线">
          <path d="M20 8V134H166" fill="none" stroke="#5c6e82" />
          <path v-for="h in [12, 50, 85]" :key="h" :d="`M20 ${profileY(h)}H166`" stroke="#283747" />
          <polyline :points="profilePoints" fill="none" stroke="#e07a5f" stroke-width="2" />
          <circle :cx="profileX(altitude)" :cy="profileY(altitude)" r="3" fill="#f0d078" />
          <text x="2" y="12">km</text><text x="4" y="136">0</text><text x="3" :y="profileY(50)+3">50</text><text x="3" :y="profileY(85)+3">85</text>
          <text x="25" y="146">−80</text><text x="71" y="146">−40</text><text x="120" y="146">0 °C</text>
        </svg><small>温度为简化剖面值。球壳高度已放大，不表示厚度比例；高层大气仍向上延伸。</small>
      </template>
    </template>
  </AtmosphereFrame>
</template>
<style scoped>.temperature-profile { display:block; width:100%; max-height:150px; margin:8px 0; } .temperature-profile text { fill:#8aa0b4; font-size:9px; } .separation { margin-top:12px; padding-top:10px; border-top:1px solid rgba(158,201,232,.15); }</style>
