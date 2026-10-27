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
const day = ref(true)
const phase = ref(4)
const contrast = ref(6)
const greening = ref(false)
const pressure = ref(true)
const phases = ['冷热不均', '垂直运动', '气压差异', '水平环流']
const title = computed(() => props.stepId === 'breeze' ? (day.value ? '白天 · 海风' : '夜晚 · 陆风') : props.stepId === 'city' ? '城市热岛环流' : '热力环流的形成')
const strength = computed(() => props.stepId === 'city' ? (greening.value ? 2 : 6) : props.stepId === 'breeze' ? 6 : contrast.value)
const hint = computed(() => {
  if (props.stepId === 'breeze') return day.value ? '陆地升温快 → 近地面陆低海高 → 海风' : '陆地降温快 → 近地面陆高海低 → 陆风'
  if (props.stepId === 'city') return greening.value ? '增加绿地、水面等可缓解热岛，示意环流随温差减弱' : '城区比郊区暖 → 城区上升 → 近地面风从郊区吹向城区'
  if (!contrast.value) return '温差为零：本模型中没有热力差异驱动的环流'
  return ['地面受热不均，是热力环流形成的根本原因', '热空气膨胀上升，冷空气收缩下沉', '空气重新分布，形成同一高度上的气压差异', '同一水平面：空气由高压流向低压，构成闭合环流'][phase.value - 1]!
})
const note = computed(() => props.stepId === 'breeze' ? '海陆热力性质不同使昼夜风向转换；海风、陆风均按近地面风的来向命名。图示忽略背景风和地转偏向力。' : props.stepId === 'city' ? '热岛环流可能把郊区污染物带入城区；大气污染企业应布置在热岛环流范围之外，并结合盛行风判断。' : '气压高低必须在同一水平面比较；高空“高压”的绝对气压仍低于近地面。温差和流速为教学示意。')
let stage: AtmosphereScene | undefined

// 环流高度教学放大；所有位置沿真实地球球面展开。
const p = (x: number, h: number, z = 0) => v(x, h * .45, z)
function terrain(s: AtmosphereScene) {
  s.region(31, props.stepId === 'breeze' ? 122 : 105, props.stepId === 'breeze' && !day.value)
  s.shell(15.6, C.cold, .13)
  s.shell(24.2, C.coldSoft, .07)
  s.cloud(-32, 8, -12, .55)
  s.cloud(31, 10, -14, .65)
  if (props.stepId === 'breeze') {
    // 实际地表纹理中的中国东部海岸：大陆位于西侧，太平洋位于东侧。
    s.label('中国东部 · 陆地', p(-23, 1.5, 20), C.inkMuted, 1.3)
    s.label('西太平洋 · 海洋', p(23, 1.5, 20), C.coldSoft, 1.3)
    s.patch(-23, 0, 7, day.value ? C.warm : C.cold, .12)
    s.patch(23, 0, 7, day.value ? C.cold : C.warm, .10)
    if (day.value) s.showSun(-30, 31, -10)
  } else if (props.stepId === 'city') {
    // 热岛叠在真实地表，不再构造方块城市或独立地台。
    s.patch(0, 0, 12, greening.value ? C.vegetation : C.warm, greening.value ? .10 : .20)
    s.patch(-30, 0, 7, C.vegetation, .09)
    s.patch(30, 0, 7, C.vegetation, .09)
    s.label('郊区', p(-31, 1, 20), C.vegetation, 1.35)
    s.label('城市热岛 · 地表示意区', p(0, 1, 21), C.warm, 1.4)
    s.label('郊区', p(31, 1, 20), C.vegetation, 1.35)
  } else {
    if (strength.value) {
      s.patch(-23, 0, 8, C.warm, .13)
      s.patch(23, 0, 8, C.cold, .10)
    }
    s.label(strength.value ? '受热地表' : '温度相同', p(-23, 1, 21), strength.value ? C.warm : C.inkDim, 1.35)
    s.label(strength.value ? '冷却地表' : '温度相同', p(23, 1, 21), strength.value ? C.coldSoft : C.inkDim, 1.35)
  }
}
function airColumn(s: AtmosphereScene, x: number, warm: boolean) {
  const color = warm ? C.warm : C.cold
  for (let i = 0; i < 28; i++) {
    const angle = i * 2.4
    const radius = 1 + i % 4 * .6
    const base = i / 28
    const particle = s.mesh(new THREE.SphereGeometry(.16 + i % 3 * .045, 8, 6), color, p(x, 0))
    s.ticks.push((t) => {
      const progress = (base + t * .025 * strength.value / 6) % 1
      particle.position.copy(at(x + Math.cos(angle) * radius, (3 + (warm ? progress : 1 - progress) * 28) * .45, Math.sin(angle) * radius - 1))
    })
  }
}
function pressureTags(s: AtmosphereScene, x: number, warm: boolean) {
  s.label(warm ? '低压' : '高压', p(x, 5.2, 13), warm ? C.low : C.high, 1.4)
  s.label(warm ? '高压' : '低压', p(x, 34, 4), warm ? C.high : C.low, 1.4)
}
function singleCell(s: AtmosphereScene) {
  const activePhase = props.stepId === 'cell' ? phase.value : 4
  const warmLeft = props.stepId !== 'breeze' || day.value
  const hot = warmLeft ? -23 : 23
  const cold = -hot
  if (!strength.value) {
    s.label('无热力环流', p(0, 20, 5), C.inkMuted, 1.65)
    return
  }
  if (activePhase >= 2) {
    airColumn(s, hot, true)
    airColumn(s, cold, false)
    s.flow([p(hot, 3, 0), p(hot, 17, 0), p(hot, 31, 0)], C.warm, .06 * strength.value / 6, 4)
    s.flow([p(cold, 31, 0), p(cold, 17, 0), p(cold, 3, 0)], C.cold, .06 * strength.value / 6, 4)
    s.label('上升', p(hot + (warmLeft ? -6 : 6), 19, 4), C.warm, 1.3)
    s.label('下沉', p(cold + (warmLeft ? 6 : -6), 19, 4), C.coldSoft, 1.3)
  }
  if (activePhase >= 3 && pressure.value) {
    pressureTags(s, hot, true)
    pressureTags(s, cold, false)
    s.line([p(-37, 4, -3), p(0, 4, -3), p(37, 4, -3)], C.inkFaint, .06, .7)
    s.line([p(-37, 31, -3), p(0, 31, -3), p(37, 31, -3)], C.inkFaint, .06, .7)
  }
  if (activePhase >= 4) {
    const speed = .055 * strength.value / 6
    s.flow([p(hot, 31, 0), p(hot * .55, 33, 0), p(cold * .55, 33, 0), p(cold, 31, 0)], C.lift, speed, 5)
    s.flow([p(cold, 3, 0), p(cold * .55, 2.5, 0), p(hot * .55, 2.5, 0), p(hot, 3, 0)], C.rain, speed, 5)
    s.label(props.stepId === 'breeze' ? (day.value ? '海风 ←' : '陆风 →') : '近地面：高压 → 低压', p(0, 8, 18), C.rain, 1.3)
    s.label('高空反向补偿', p(0, 38, 0), C.lift, 1.3)
  }
}
function cityCell(s: AtmosphereScene) {
  airColumn(s, 0, true)
  const speed = .05 * strength.value / 6
  s.flow([p(0, 9, 0), p(0, 20, 0), p(0, 32, 0)], C.warm, speed, 4)
  for (const side of [-1, 1]) {
    const x = side * 30
    s.flow([p(side * 2, 32, 0), p(side * 15, 34, 0), p(x, 30, 0), p(x, 5, 0)], C.cold, speed, 6)
    s.flow([p(x, 4, 0), p(side * 19, 3, 0), p(side * 10, 7, 0), p(side * 2, 9, 0)], C.rain, speed, 4)
    if (pressure.value) {
      s.label('高压', p(x, 10, 12), C.high, 1.3)
      s.label('低压', p(x, 36, 4), C.low, 1.3)
    }
  }
  if (pressure.value) {
    s.label('低压', p(0, 10, 12), C.low, 1.4)
    s.label('高压', p(0, 36, 4), C.high, 1.4)
  }
  s.label('城区暖空气上升', p(0, 23, 7), C.warm, 1.35)
}
function rebuild() {
  if (!stage) return
  stage.clear()
  terrain(stage)
  if (props.stepId === 'city') cityCell(stage)
  else singleCell(stage)
}
watch([() => props.stepId, day, phase, contrast, greening, pressure], rebuild)
onMounted(() => {
  if (!frame.value?.host || !frame.value.canvas) return
  try {
    stage = createAtmosphereScene(frame.value.host, frame.value.canvas)
    stage.camera.position.set(0, 25, 106)
    stage.controls.target.set(0, 12, 0)
    stage.controls.saveState()
    rebuild()
    stage.start(() => playing.value)
  } catch { error.value = '三维场景暂时无法启动，请检查浏览器的 WebGL 支持。' }
})
onUnmounted(() => stage?.dispose())
</script>
<template>
  <AtmosphereFrame ref="frame" :title="title" :hint="hint" :note="note" :playing="playing" :error="error" @toggle="playing = !playing" @reset="stage?.controls.reset()">
    <template #tools>
      <template v-if="props.stepId === 'cell'"><button v-for="(name, index) in phases" :key="name" type="button" class="chip" :class="{ on: phase === index + 1 }" :aria-pressed="phase === index + 1" @click="phase = index + 1">{{ index + 1 }} · {{ name }}</button></template>
      <template v-else-if="props.stepId === 'breeze'"><button class="chip" type="button" :class="{ on: day }" :aria-pressed="day" @click="day = true">白天 · 海风</button><button class="chip" type="button" :class="{ on: !day }" :aria-pressed="!day" @click="day = false">夜晚 · 陆风</button></template>
      <template v-else><button class="chip" type="button" :class="{ on: !greening }" :aria-pressed="!greening" @click="greening = false">典型热岛</button><button class="chip" type="button" :class="{ on: greening }" :aria-pressed="greening" @click="greening = true">增加绿地</button></template>
      <button class="chip" type="button" :class="{ on: pressure }" :aria-pressed="pressure" @click="pressure = !pressure">气压标注</button>
    </template>
    <template #panel>
      <h3>{{ props.stepId === 'cell' ? '实验 · 改变地面温差' : props.stepId === 'breeze' ? '观察 · 昼夜风向转换' : '实验 · 缓解城市热岛' }}</h3>
      <template v-if="props.stepId === 'cell'">
        <label for="thermal-contrast">暖区比冷区高 {{ contrast }} °C</label>
        <input id="thermal-contrast" v-model.number="contrast" type="range" min="0" max="12" step="1" aria-label="两地地面温差（摄氏度）" />
        <p>{{ contrast ? '温差增大，示意气流加快。按上方 1—4 步依次观察形成过程。' : '两地温度相同，环流消失。增大温差，重新观察。' }}</p>
      </template>
      <template v-else-if="props.stepId === 'breeze'">
        <p>{{ day ? '白天陆地更暖，空气上升；海洋较冷，空气下沉。' : '夜晚陆地更冷，空气下沉；海洋较暖，空气上升。' }}</p>
        <p class="direction">{{ day ? '近地面：海洋 → 陆地' : '近地面：陆地 → 海洋' }}</p>
      </template>
      <template v-else>
        <p>城区与郊区温差：<strong>{{ strength }} °C</strong></p>
        <p>{{ greening ? '绿地增加后，模型中的温差减小、气流放缓。' : '地表蓄热、人为排热及蒸发减少等，使城区气温较高。' }}</p>
        <small>6 °C / 2 °C 为对照情景设定，非绿化降温的固定效果。</small>
      </template>
      <div class="legend"><span style="color:var(--demo-warm)">● 暖空气上升</span><span style="color:var(--demo-cold)">● 冷空气下沉</span><span style="color:var(--demo-lift)">● 高空输送</span><span style="color:var(--demo-rain)">● 近地面补偿</span></div>
      <small>真实地球底图 · 环流为局地机制示意，范围与高度已放大；气压比较同一高度。</small>
    </template>
  </AtmosphereFrame>
</template>
<style scoped>
.legend { display:grid; grid-template-columns:1fr 1fr; gap:8px 3px; margin:14px 0; font-size:10px; }
.direction { color:var(--demo-lift)!important; }
</style>
