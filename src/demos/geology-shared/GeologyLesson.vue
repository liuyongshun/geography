<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { DemoEntry } from '@/curriculum/demoRegistry'
import AnimatedLandscape from './AnimatedLandscape.vue'
import StrataSection from './StrataSection.vue'
import RockFormation from './RockFormation.vue'
import { CYCLE_ACTIONS, CYCLE_EDGES, CYCLE_NODES, ROCK_PHASES, ROCK_TYPES } from './lessonData'

const props = defineProps<{ topic: 'rock' | 'landform'; stepId: string; demo: DemoEntry }>()
const playing = ref(true)
const speed = ref(1)
const labels = ref(true)
const time = ref(0)
const processProgress = ref(0)
const phase = computed(() => Math.min(ROCK_PHASES.length - 1, Math.floor(processProgress.value * ROCK_PHASES.length)))
const phaseProgress = computed(() => processProgress.value >= 1 ? 1 : processProgress.value * ROCK_PHASES.length - phase.value)
const reducedMotion = ref(false)
const selectedRock = ref(0)
const action = ref('all')
const fold = ref<'anticline' | 'syncline'>('anticline')
const amount = ref(.55)
const external = ref<'river' | 'wind' | 'glacier' | 'sea'>('river')
const isRock = computed(() => props.topic === 'rock')
const isProcess = computed(() => isRock.value && props.stepId === 'process')
const isTypes = computed(() => isRock.value && props.stepId === 'types')
const isCycle = computed(() => isRock.value && props.stepId === 'cycle')
const isFold = computed(() => !isRock.value && props.stepId === 'fold')
const isFault = computed(() => !isRock.value && props.stepId === 'fault')
const isStrata = computed(() => isFold.value || isFault.value)
const isExternal = computed(() => !isRock.value && props.stepId === 'external')
const currentPhase = computed(() => ROCK_PHASES[phase.value]!)
const currentRock = computed(() => ROCK_TYPES[selectedRock.value]!)
const currentAction = computed(() => CYCLE_ACTIONS.find(item => item.id === action.value) ?? CYCLE_ACTIONS[0]!)
const externalMeta = computed(() => ({
  river: { title: '流水：侵蚀、搬运与堆积', note: '上游侵蚀形成河谷；出山口坡度减缓，易形成冲积扇；河口可形成三角洲。', target: '沿水流方向观察泥沙的搬运', x: 61, y: 46 },
  wind: { title: '风力：侵蚀与堆积', note: '干旱、半干旱地区风力作用显著，可形成风蚀蘑菇、风蚀洼地及沙丘等地貌。', target: '风蚀与风积地貌 · 区域示意', x: 15, y: 36 },
  glacier: { title: '冰川：侵蚀与搬运', note: '冰川沿谷地缓慢运动，刨蚀和磨蚀地表，可形成冰斗、角峰与 U 形谷等。', target: '山地冰川 · 缓慢向下运动', x: 24, y: 27 },
  sea: { title: '海浪：海岸侵蚀与堆积', note: '海浪不断作用于海岸，可形成海蚀崖、海蚀柱及沙滩等海岸地貌。', target: '海浪不断作用于海岸', x: 74, y: 39 },
}[external.value]))
const title = computed(() => isProcess.value ? (phase.value === 0 ? '岩浆，从地底到地表' : `岩石形成 · ${currentPhase.value.title}`) : isTypes.value ? '三大类岩石，各有来处' : isCycle.value ? '岩石，在循环中转化' : isFold.value ? '水平挤压，让岩层弯曲' : isFault.value ? '断裂错动，改变地表高差' : isExternal.value ? '外力，持续雕刻地表' : '内力与外力，共同塑造地表')
const note = computed(() => isProcess.value ? currentPhase.value.note : isTypes.value ? currentRock.value.detail : isCycle.value ? currentAction.value.note : isFold.value ? '背斜与向斜依据岩层弯曲形态判断；地形倒置后，背斜可能成谷、向斜可能成山。' : isFault.value ? '岩体沿断层面发生明显位移。图示正断层，上盘相对下降；断层的判别需要观察岩层错动。' : isExternal.value ? externalMeta.value.note : '内力作用主要塑造地表的基本形态，外力作用不断改造地表，两者长期共同作用。')
const stars = Array.from({ length: 38 }, (_, i) => ({ id: i, phase: ((i * .61803398875) % 1), vx: Math.sin(i * 12.7) * .026, vy: -.058 - (i % 7) * .004, life: 1.2 + (i % 6) * .19 }))
const sparks = computed(() => stars.map(s => {
  const age = (time.value + s.phase * s.life) % s.life
  return { id: s.id, x: (.417 + s.vx * age) * 1000, y: (.178 + s.vy * age + .045 * age * age) * 667, opacity: 1 - age / s.life, size: .65 + s.id % 3 * .35 }
}))
const riverPoints = [[.605,.318],[.558,.344],[.626,.38],[.636,.40],[.568,.433],[.551,.456],[.617,.478],[.70,.468],[.755,.497],[.79,.543]]
function riverPoint(t: number) {
  const v = t * (riverPoints.length - 1), i = Math.min(riverPoints.length - 2, Math.floor(v)), f = v - i
  return { x: (riverPoints[i]![0]! * (1-f) + riverPoints[i+1]![0]! * f)*1000, y: (riverPoints[i]![1]! * (1-f) + riverPoints[i+1]![1]! * f)*667 }
}
const sediment = computed(() => Array.from({length:22}, (_,i) => ({...riverPoint((time.value*.065+i/22)%1),id:i})))
const motionStyle = computed(() => ({ '--motion': playing.value ? 'running' : 'paused', '--flow-duration': `${2.8 / speed.value}s` }))
let frame = 0, last = 0, visible = true, strataClock = 0
function tick(now: number) {
  frame = requestAnimationFrame(tick)
  const dt = last ? Math.min((now-last)/1000,.05) : 0
  last = now
  if (!playing.value || !visible) return
  const elapsed = dt * speed.value
  time.value += elapsed
  if (isProcess.value) {
    processProgress.value += elapsed / (9 * ROCK_PHASES.length)
    if (processProgress.value > 1) processProgress.value %= 1
  }
  if (isStrata.value) { strataClock += elapsed; amount.value = .5 - .5 * Math.cos(strataClock * .3) }
}
function selectPhase(index: number) { processProgress.value = (index + .6) / ROCK_PHASES.length; playing.value = false }
function reset() { time.value = 0; processProgress.value = 0; strataClock = 0; amount.value = 0; playing.value = true }
function scrubStrata() {
  playing.value = false
  strataClock = Math.acos(1 - 2 * Math.min(1, Math.max(0, amount.value))) / .3
}
function onVisibility() { visible = !document.hidden; last = 0 }
watch(() => props.stepId, () => { reset(); action.value = 'all'; playing.value = !reducedMotion.value })
onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  playing.value = !reducedMotion.value
  visible = !document.hidden
  document.addEventListener('visibilitychange', onVisibility)
  frame = requestAnimationFrame(tick)
})
onUnmounted(() => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility) })
</script>

<template>
  <section class="geology" :style="motionStyle" :aria-label="demo.title">
    <header class="lesson-heading" data-dili-chrome><div><p class="eyebrow">第二章 · 岩石圈与地表形态 / {{ isRock ? '01' : '02' }}</p><h2>{{ title }}</h2></div><span class="live"><i :class="{ paused: !playing }" />{{ playing ? '动态演示' : '已暂停' }}</span></header>

    <div v-if="isCycle" class="cycle-actions" data-dili-chrome aria-label="选择岩石转化作用"><button v-for="item in CYCLE_ACTIONS" :key="item.id" :class="{selected:action===item.id}" :aria-pressed="action===item.id" @click="action=item.id">{{ item.name }}</button></div>
    <div v-if="isFold" class="mode-actions" data-dili-chrome><button :class="{selected:fold==='anticline'}" :aria-pressed="fold==='anticline'" @click="fold='anticline'">背斜</button><button :class="{selected:fold==='syncline'}" :aria-pressed="fold==='syncline'" @click="fold='syncline'">向斜</button></div>
    <div v-if="isExternal" class="mode-actions" data-dili-chrome><button v-for="item in ([['river','流水'],['wind','风力'],['glacier','冰川'],['sea','海浪']] as const)" :key="item[0]" :class="{selected:external===item[0]}" :aria-pressed="external===item[0]" @click="external=item[0]">{{ item[1] }}</button></div>

    <div class="scene-grid" :class="{ 'cycle-grid': isCycle }">
      <div class="visual" :class="{'hide-labels':!labels, 'cycle-view':isCycle, 'types-view':isTypes,'strata-view':isStrata}" >
        <StrataSection v-if="isStrata" :mode="isFold?'fold':'fault'" :amount="amount" :fold="fold" :labels="labels" />
        <img v-else-if="isTypes||isCycle" class="static-backdrop" src="/textures/geology/volcano-cutaway.jpg" alt="火山与岩浆房地质剖面背景">
        <AnimatedLandscape v-else :key="isRock?'magma':isExternal&&external==='wind'?'wind':'landform'" :kind="isRock?'magma':isExternal&&external==='wind'?'wind':'landform'" :time="time" />

        <template v-if="isProcess">
          <svg class="effects" viewBox="0 0 1000 667" aria-hidden="true"><defs><marker id="magma-up-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#f2d5a2" /></marker></defs><path v-if="labels" d="M450 355V277" stroke="#f2d5a2" stroke-width="2" fill="none" marker-end="url(#magma-up-arrow)"/><circle v-for="spark in sparks" :key="spark.id" :cx="spark.x" :cy="spark.y" :r="spark.size" :opacity="spark.opacity" fill="#ffbd59" /></svg>
          <div v-if="phase===0" class="scene-tag" style="left:19%;top:76%"><span>岩浆房<small>地下翻涌</small></span></div>
          <div v-if="phase===0" class="scene-tag" style="left:46%;top:47%"><span>上升通道<small>岩浆向上运移</small></span></div>
          <div v-if="phase===0" class="scene-tag" style="left:70%;top:34%"><span>地表熔岩<small>沿坡流动</small></span></div>
          <div class="focus-ring" :style="{left:currentPhase.x+'%',top:currentPhase.y+'%'}" />
          <div class="scene-kicker">地质剖面 · {{ currentPhase.title }}</div>
          <RockFormation :phase="phase" :progress="phaseProgress" :time="time" />
        </template>

        <template v-if="isTypes">
          <div class="type-shade" />
          <div class="type-gallery"><button v-for="(rock,index) in ROCK_TYPES" :key="rock.id" class="rock-card" :class="{active:selectedRock===index}" :style="{'--rock-color':rock.color}" :aria-pressed="selectedRock===index" @click="selectedRock=index"><span class="rock-english">{{ rock.en }}</span><div class="rock-specimen" :style="{backgroundImage:`url(/textures/rocks/${rock.texture})`}" /><h3>{{ rock.name }}</h3><p>{{ rock.how }}</p><small>{{ rock.examples }}</small></button></div>
          <div class="type-clue">{{ currentRock.clue }}<small>岩石纹理示意 · 非鉴定依据</small></div>
        </template>

        <template v-if="isCycle">
          <div class="cycle-shade" />
          <svg class="cycle-diagram" viewBox="0 0 1000 590" role="img" aria-label="三类岩石与岩浆之间通过冷却凝固、外力作用及固结成岩、变质作用、重熔再生转化的路径">
            <defs><marker v-for="item in CYCLE_ACTIONS.slice(1)" :id="`rock-arrow-${item.id}`" :key="item.id" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" :fill="item.color" /></marker></defs>
            <g v-for="(edge,index) in CYCLE_EDGES" :key="index" :class="{'edge-muted':action!=='all'&&action!==edge.id}">
              <path :d="edge.path" fill="none" :stroke="CYCLE_ACTIONS.find(a=>a.id===edge.id)!.color" stroke-width="2.5" :marker-end="`url(#rock-arrow-${edge.id})`" />
              <path class="flow-line" :d="edge.path" fill="none" stroke="#fff2c9" stroke-width="3.5" stroke-dasharray="5 24" />
              <text v-if="labels" :x="edge.x" :y="edge.y" :fill="CYCLE_ACTIONS.find(a=>a.id===edge.id)!.color" class="edge-label">{{ edge.label }}</text>
            </g>
            <g v-for="node in CYCLE_NODES" :key="node.id" :transform="`translate(${node.x},${node.y})`"><rect x="-77" y="-38" width="154" height="76" rx="13" fill="#0c1b2b" :stroke="node.color" stroke-width="1.5" /><image :href="`/textures/rocks/${node.texture}`" x="-65" y="-26" width="52" height="52" preserveAspectRatio="xMidYMid slice" /><text x="28" y="8" class="node-label">{{ node.name }}</text></g>
          </svg>
        </template>

        <template v-if="!isRock&&!isStrata">
          <div class="scene-kicker">{{ isExternal&&external==='wind' ? '干旱地区 / 风蚀与风积地貌' : '山地 → 平原 → 海岸 / 连续地貌剖面' }}</div>
          <svg class="effects" viewBox="0 0 1000 667" aria-hidden="true">
            <defs><marker id="external-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#c7e6ee" /></marker><marker id="wind-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#f2d09a" /></marker></defs>
            <g v-if="!isExternal||external==='river'"><path d="M605 212L558 229L626 253L636 267L568 289L551 304L617 319L700 312L755 331L790 362" fill="none" stroke="#c7e6ee" stroke-width="1.5" opacity=".65" marker-end="url(#external-arrow)"/><circle v-for="particle in sediment" :key="particle.id" :cx="particle.x" :cy="particle.y" r="1.8" fill="#ffe2a3" opacity=".8" /></g>
            <g v-if="!isExternal"><path v-for="i in 3" :key="i" :d="`M${22+i*73} ${540+i*10}v-61`" stroke="#ffa65f" stroke-width="3" marker-end="url(#landform-up)" class="uplift" /><defs><marker id="landform-up" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ffa65f" /></marker></defs></g>
            <g v-if="isExternal&&external==='wind'" class="wind-lines"><path v-for="i in 5" :key="i" :d="`M ${85+i*25} ${300+i*12} Q 400 ${280+i*12} ${690+i*24} ${287+i*12}`" fill="none" stroke="#f2d09a" stroke-width="2" stroke-dasharray="10 24" marker-end="url(#wind-arrow)" /></g>
            <g v-if="isExternal&&external==='glacier'" class="glacier-lines"><path d="M125 115Q175 166 215 221T287 285" fill="none" stroke="#e8f8ff" stroke-width="4" stroke-dasharray="5 25" marker-end="url(#external-arrow)" /></g>
            <g v-if="isExternal&&external==='sea'" class="sea-lines"><path v-for="i in 4" :key="i" :d="`M ${920+i*12} ${240+i*25} Q ${855+i*7} ${249+i*25} ${803+i*8} ${259+i*25}`" fill="none" stroke="#b0e7f0" stroke-width="2" stroke-dasharray="8 23" marker-end="url(#external-arrow)" /></g>
          </svg>
          <template v-if="!isExternal"><div class="scene-tag cool" style="left:18%;top:24%"><span>冰川<small>侵蚀 · 搬运</small></span></div><div class="scene-tag cool" style="left:32%;top:43%"><span>冲积扇<small>流水堆积</small></span></div><div class="scene-tag cool" style="left:59%;top:43%"><span>河流平原<small>侵蚀 · 搬运 · 堆积</small></span></div><div class="scene-tag cool" style="left:79%;top:52%"><span>三角洲<small>河口堆积</small></span></div><div class="scene-tag" style="left:14%;top:83%"><span>内力抬升<small>塑造地表基本形态</small></span></div></template>
          <template v-else-if="external==='wind'"><div class="scene-tag" style="left:12%;top:26%"><span>风蚀蘑菇岩<small>近地表磨蚀较强</small></span></div><div class="scene-tag" style="left:70%;top:43%"><span>沙丘<small>风力堆积</small></span></div></template>
          <div v-else class="scene-tag cool" :style="{left:externalMeta.x+'%',top:externalMeta.y+'%'}"><span>{{ externalMeta.target }}</span></div>
        </template>
      </div>

      <aside class="knowledge" data-dili-chrome>
        <template v-if="isProcess"><p class="rail-eyebrow">形成过程</p><h3>{{ currentPhase.title }}</h3><p>{{ currentPhase.note }}</p><div class="rail-rule"><b>地下是岩浆</b><span>喷出地表后称为熔岩。</span></div><div class="rail-rule"><b>冷却形成岩浆岩</b><span>侵入岩与喷出岩的形成环境不同。</span></div></template>
        <template v-else-if="isTypes"><p class="rail-eyebrow">岩石识别</p><h3 :style="{color:currentRock.color}">{{ currentRock.name }}</h3><p>{{ currentRock.detail }}</p><div class="rail-rule"><b>形成方式</b><span>{{ currentRock.how }}</span></div><div class="rail-rule"><b>典型实例</b><span>{{ currentRock.examples }}</span></div></template>
        <template v-else-if="isCycle"><p class="rail-eyebrow">物质循环</p><h3 :style="{color:currentAction.color}">{{ currentAction.name }}</h3><p>{{ currentAction.note }}</p><div class="rail-rule"><b>判图关键</b><span>岩浆只能直接冷却形成岩浆岩。</span></div><div class="rail-rule"><b>沉积岩的形成</b><span>外力作用产生沉积物，还需要固结成岩。</span></div></template>
        <template v-else-if="isFold"><p class="rail-eyebrow">内力作用 · 褶皱</p><h3>{{ fold==='anticline'?'背斜':'向斜' }}</h3><p>{{ fold==='anticline'?'岩层向上拱起；一般情况下，中间岩层较老、两翼较新。':'岩层向下弯曲；一般情况下，中间岩层较新、两翼较老。' }}</p><div class="rail-rule"><b>成因</b><span>岩层受到水平挤压，发生弯曲变形。</span></div><div class="rail-rule"><b>注意地形倒置</b><span>背斜可能成谷，向斜可能成山，不能只看地表起伏。</span></div></template>
        <template v-else-if="isFault"><p class="rail-eyebrow">内力作用 · 断层</p><h3>正断层</h3><p>图示断层面向右倾斜，右侧为上盘，沿断层面相对下降。</p><div class="rail-rule"><b>观察标志</b><span>对比同一岩层在两侧的位置，判断相对错动。</span></div><div class="rail-rule"><b>构造与地貌</b><span>断层作用可形成断块山、谷地等地貌。</span></div></template>
        <template v-else-if="isExternal"><p class="rail-eyebrow">外力作用</p><h3>{{ externalMeta.title }}</h3><p>{{ externalMeta.note }}</p><div class="rail-rule"><b>能量来源</b><span>主要是太阳辐射能，也受重力等影响。</span></div><div class="rail-rule"><b>总体趋势</b><span>削高填低，使地表趋于平缓。</span></div></template>
        <template v-else><div class="force"><p class="rail-eyebrow warm">内力作用</p><h3>来自地球内部</h3><p>地壳运动 · 岩浆活动 · 变质作用</p><b>使地表趋于高低不平</b></div><div class="force"><p class="rail-eyebrow blue">外力作用</p><h3>主要来自太阳辐射</h3><p>风化 · 侵蚀 · 搬运 · 堆积</p><b>总体使地表趋于平缓</b></div><p class="force-conclusion">地表形态是两者长期共同作用的结果。</p></template>
      </aside>
    </div>

    <nav v-if="isProcess" class="phase-strip" data-dili-chrome aria-label="选择岩石形成阶段"><button v-for="(item,index) in ROCK_PHASES" :key="item.title" :class="{selected:phase===index}" :aria-pressed="phase===index" @click="selectPhase(index)"><span>0{{ index+1 }}</span>{{ item.title }}</button></nav>
    <div v-if="isProcess" class="amount-control process-timeline" data-dili-chrome><label for="rock-process-progress">形成进程</label><input id="rock-process-progress" v-model.number="processProgress" type="range" min="0" max="1" step="0.001" @input="playing=false"><output>{{ Math.round(processProgress*100) }}%</output><span>{{ currentPhase.title }}</span></div>
    <div v-if="isStrata" class="amount-control" data-dili-chrome><label :for="`geology-${stepId}-amount`">{{ isFold?'挤压强度':'相对断距' }}</label><input :id="`geology-${stepId}-amount`" v-model.number="amount" type="range" min="0" max="1" step="0.01" @input="scrubStrata"><output>{{ Math.round(amount*100) }}%</output><span>拖动观察岩层变化</span></div>
    <footer class="controls" data-dili-chrome><div class="control-group"><button :aria-pressed="playing" @click="playing=!playing">{{ playing?'暂停演示':'继续演示' }}</button><button class="quiet" @click="reset">重新播放</button></div><div class="control-group"><label>速度 <input v-model.number="speed" aria-label="动画速度" type="range" min="0.25" max="2" step="0.25"><output>{{ speed }}×</output></label><label><input v-model="labels" type="checkbox">显示标注</label></div></footer>
    <div class="lesson-note" data-dili-chrome><span>{{ note }}</span><small>地理过程示意 · 时间与空间尺度经过压缩</small></div>
  </section>
</template>

<style scoped>
.geology{height:100%;overflow:auto;background:#080f1c;color:#e5edf5;padding:18px 22px 14px;container-type:inline-size;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif}.lesson-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:17px}.eyebrow{margin:0 0 7px;color:#809fb8;font-size:10px;letter-spacing:2px}h2{margin:0;font-size:23px;font-weight:600;letter-spacing:1px}.live{display:flex;align-items:center;gap:7px;font-size:11px;color:#98aec1;white-space:nowrap}.live i{width:6px;height:6px;border-radius:50%;background:#f8ac69}.live i.paused{background:#6f8191}.scene-grid{display:grid;grid-template-columns:minmax(0,1fr) 212px;gap:18px;align-items:start}.visual{position:relative;aspect-ratio:3/2;overflow:hidden;border-radius:9px;border:1px solid #26364a;background:#0b1726;isolation:isolate}.visual.strata-view{aspect-ratio:5/3}.static-backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}.effects{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.knowledge{padding:9px 0 0 2px;font-size:12px;line-height:1.85;color:#a6bbce}.knowledge h3{color:#efdfc0;font-size:20px;margin:5px 0 10px;line-height:1.5;font-weight:600}.knowledge p{margin:0 0 14px}.knowledge .rail-eyebrow{font-size:10px;letter-spacing:2px;color:#8eabc1;margin:0}.rail-rule{padding-top:12px;margin-top:12px;border-top:1px solid #233043;display:flex;flex-direction:column;gap:5px}.rail-rule b{font-weight:500;color:#d6e2ed;font-size:12px}.rail-rule span{font-size:11px}.scene-tag{position:absolute;display:flex;align-items:center;gap:7px;color:#f0f4f6;font-size:clamp(9px,1vw,12px);pointer-events:none;max-width:38%}.scene-tag:before{content:"";width:5px;height:5px;border-radius:50%;background:#ffb16a;flex-shrink:0}.scene-tag.cool:before{background:#91d9f2}.scene-tag>span{background:#091522dc;border:1px solid #ffffff17;border-radius:5px;padding:6px 9px;line-height:1.4}.scene-tag small{display:block;font-size:9px;color:#b3c5d5;margin-top:3px}.scene-kicker{position:absolute;top:12px;left:12px;background:#081523cc;color:#adc5da;font-size:9px;letter-spacing:1px;padding:7px 10px;border:1px solid #ffffff14;border-radius:20px}.hide-labels .scene-tag,.hide-labels .scene-kicker,.hide-labels .focus-ring{display:none}.focus-ring{position:absolute;width:26px;height:26px;border:1px solid #ffd29a;border-radius:50%;transform:translate(-50%,-50%);animation:focus-pulse 2.8s ease-out infinite;animation-play-state:var(--motion);pointer-events:none}@keyframes focus-pulse{0%{opacity:.9;scale:.7}100%{opacity:0;scale:1.8}}button{font:inherit;cursor:pointer;color:#b2c8da;background:#122338;border:1px solid #2b4158;border-radius:5px;padding:8px 12px;font-size:11px;transition:background .18s,border-color .18s}button:hover{background:#21384e;border-color:#63839d}button.selected{color:#ffe1b8;border-color:#bb895c;background:#392b22}button:focus-visible,input:focus-visible{outline:2px solid #8accec;outline-offset:3px}.phase-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:13px}.phase-strip button{text-align:left;padding:9px 8px;font-size:11px}.phase-strip span{font-size:9px;margin-right:6px;color:#89a3ba}.controls{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:15px}.control-group{display:flex;align-items:center;gap:10px}.controls label{display:flex;align-items:center;gap:7px;color:#9eb2c5;font-size:11px}.controls input[type=range]{width:91px}.controls output{font-variant-numeric:tabular-nums;min-width:30px;color:#d9b88f}input{accent-color:#e7a367}.quiet{background:transparent}.lesson-note{margin-top:13px;border-top:1px solid #1e2c3d;padding-top:11px;color:#97adc0;font-size:11px;line-height:1.8;display:flex;justify-content:space-between;gap:20px}.lesson-note small{color:#687f94;font-size:10px;flex-shrink:0}.force{padding-bottom:18px;margin-bottom:17px;border-bottom:1px solid #263449}.force .warm{color:#eeb37b}.force .blue{color:#8dcbe8}.force h3{font-size:17px;margin-top:6px}.force p{font-size:11px}.force b{font-size:12px;color:#d5e5ef;font-weight:500}.force-conclusion{color:#c7d9e9;font-size:11px}.amount-control{display:flex;align-items:center;gap:12px;margin-top:15px;color:#acc0d2;font-size:11px}.amount-control input{flex:1;max-width:450px}.amount-control output{min-width:34px;color:#edbb83}.amount-control>span{color:#6f8ba2}.cycle-actions,.mode-actions{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px}.type-shade,.cycle-shade{position:absolute;inset:0;background:#07111edb}.type-gallery{position:absolute;inset:12% 4% 16%;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-items:stretch}.rock-card{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 7px;background:#102132c9;border-color:#3a4a5b;border-radius:9px;min-width:0}.rock-card.active{border-color:var(--rock-color);background:#1a2937}.rock-english{color:#8ba2b6;font-size:8px;letter-spacing:1.5px}.rock-specimen{width:84%;aspect-ratio:1.15;margin:16px 0 10px;background-size:cover;background-position:center;clip-path:polygon(16% 3%,70% 0,95% 20%,100% 69%,76% 96%,25% 100%,2% 76%,0 32%);border-radius:20px;transition:filter .2s}.rock-card:nth-child(2) .rock-specimen{animation-delay:-1.7s}.rock-card:nth-child(3) .rock-specimen{animation-delay:-3.3s}@keyframes rock-float{50%{transform:translateY(-6px) rotate(2deg)}}.rock-card h3{margin:6px 0 7px;font-size:clamp(13px,1.6vw,21px);color:var(--rock-color);font-weight:600}.rock-card p{font-size:10px;margin:0 0 7px;color:#d7e2ed;line-height:1.5}.rock-card small{font-size:9px;color:#90a8bd;line-height:1.7}.type-clue small{display:block;margin-top:6px;font-size:9px;color:#8ca5bc}.type-clue{position:absolute;bottom:6%;left:6%;right:6%;color:#dfc59f;text-align:center;font-size:12px}.cycle-diagram{position:absolute;inset:0;width:100%;height:100%}.cycle-view{aspect-ratio:1000/590}.cycle-shade{background:#07101cea}.edge-label{font:13px "PingFang SC","Microsoft YaHei",sans-serif;text-anchor:middle;paint-order:stroke;stroke:#07111e;stroke-width:6;stroke-linejoin:round}.node-label{font:600 21px "PingFang SC","Microsoft YaHei",sans-serif;fill:#edf3f8;text-anchor:middle}.edge-muted{opacity:.09}.flow-line{animation:flow var(--flow-duration) linear infinite;animation-play-state:var(--motion);opacity:.65}@keyframes flow{to{stroke-dashoffset:-58}}.wind-lines,.glacier-lines,.sea-lines{animation:flow var(--flow-duration) linear infinite;animation-play-state:var(--motion)}.glacier-lines{animation-duration:calc(var(--flow-duration)*4)}.uplift{animation:uplift 3s ease-in-out infinite;animation-play-state:var(--motion)}@keyframes uplift{50%{transform:translateY(-9px);opacity:.55}}
@container(max-width:780px){.scene-grid{grid-template-columns:minmax(0,1fr) 172px;gap:13px}.knowledge{font-size:11px;line-height:1.75}.knowledge h3{font-size:17px}.rail-rule{padding-top:9px;margin-top:9px}.rail-rule span{font-size:10px}.phase-strip button{font-size:10px;padding:8px 5px}.phase-strip span{display:block;margin-bottom:3px}.force{margin-bottom:11px;padding-bottom:11px}.force h3{font-size:14px}.lesson-note{display:block}.lesson-note small{display:block;margin-top:4px}.scene-tag small{display:none}.scene-tag>span{padding:4px 6px}}
@container(max-width:570px){.scene-grid{grid-template-columns:1fr}.knowledge{display:grid;grid-template-columns:1fr 1fr;gap:7px 15px;padding:0}.knowledge>.rail-eyebrow,.knowledge>h3,.knowledge>p{grid-column:1/-1;margin:0}.rail-rule{margin-top:0;padding-top:6px}.force{margin:0;padding:0 0 8px}.force-conclusion{grid-column:1/-1}.controls{flex-wrap:wrap}.phase-strip{grid-template-columns:repeat(3,1fr)}.phase-strip span{display:inline;margin-right:6px}.amount-control>span{display:none}.lesson-heading h2{font-size:18px}.eyebrow{font-size:9px}.live{font-size:9px}.cycle-diagram .node-label{font-size:34px;transform:translateX(-28px)}.cycle-diagram g>image{display:none}.cycle-diagram .edge-label{display:none}.type-clue{font-size:10px}.rock-card{padding:10px 5px}.rock-card small{font-size:8px}.rock-specimen{margin:8px 0}.rock-english{font-size:7px}}
@media(prefers-reduced-motion:reduce){.focus-ring,.rock-specimen,.flow-line,.wind-lines,.glacier-lines,.sea-lines,.uplift{animation:none}}
/* Use DemoLab's existing fullscreen root; keep the geological scene in its native ratio. */
:global([data-dili-canvas]:fullscreen .geology),:global([data-dili-canvas]:-webkit-full-screen .geology){padding:0;overflow:hidden}
:global([data-dili-canvas]:fullscreen .scene-grid),:global([data-dili-canvas]:-webkit-full-screen .scene-grid){display:flex;align-items:center;justify-content:center;width:100%;height:100%;gap:0}
:global([data-dili-canvas]:fullscreen .visual),:global([data-dili-canvas]:-webkit-full-screen .visual){width:min(100%,150dvh);flex-shrink:0;border:0;border-radius:0}
</style>
