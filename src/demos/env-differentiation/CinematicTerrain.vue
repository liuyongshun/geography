<script setup lang="ts">
import { computed, ref } from 'vue'
import { DemoHex } from '@/demos/theme'

interface Specimen {
  name: string
  note: string
  image: string
  sourceUrl: string
  credit: string
}

interface Zone {
  id: string
  range: string
  name: string
  short: string
  temp: string
  precip: string
  climate: string
  description: string
  color: string
  guidePath: string
  focusX: number
  focusY: number
  marker: string
  labelTop: string
  labelLeft: string
  plants: Specimen[]
  animals: Specimen[]
}

const ZONES: Zone[] = [
  {
    id: 'snow',
    range: '≥ 5000 m',
    name: '冰雪带',
    short: '终年积雪·冰川地貌',
    temp: '< -8 ℃',
    precip: '300–600 mm',
    climate: '终年严寒，冻融作用强',
    description: '山顶热量不足，冰雪长期保留，植被极少。',
    color: DemoHex.biomeIce,
    guidePath: 'M446 135 C 535 144, 628 157, 748 181',
    focusX: 623,
    focusY: 157,
    marker: '5,000 m',
    labelTop: '16%',
    labelLeft: '38%',
    plants: [{ name: '北极柳', note: '贴近地面生长，可抵御强风与低温', image: '/images/biomes/plants/plant-arctic-willow.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Salix_arctica_-_Arctic_willow.jpg', credit: 'Wikimedia Commons · CC BY-SA 2.0' }],
    animals: [{ name: '雪豹', note: '厚毛、宽大足垫，适应高寒岩坡', image: '/images/animals/snow-leopard.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Snow_leopard_portrait-2010-07-09.jpg', credit: 'Tambako The Jaguar · CC BY-SA 2.0' }],
  },
  {
    id: 'desert',
    range: '4000–5000 m',
    name: '高寒荒漠带',
    short: '裸岩、碎石与稀疏植被',
    temp: '-8 ～ -3 ℃',
    precip: '300–700 mm',
    climate: '风力强，昼夜温差大',
    description: '强风和冻融作用频繁，地表以裸岩、碎屑为主。',
    color: DemoHex.rock,
    guidePath: 'M414 226 C 530 230, 648 250, 802 278',
    focusX: 650,
    focusY: 250,
    marker: '4,000 m',
    labelTop: '28%',
    labelLeft: '41%',
    plants: [{ name: '针茅', note: '叶片细长，可减少蒸腾与强风损伤', image: '/images/biomes/plants/plant-feather-grass.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Stipa_capillata_kz07.jpg', credit: 'Krzysztof Ziarnek · Wikimedia Commons' }],
    animals: [{ name: '高原鼠兔（近缘种）', note: '穴居避寒，是高原食物网关键种；图片为北美鼠兔', image: '/images/animals/pika.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:American_Pika_collecting_Antennaria,_Wallowa-Whitman_National_Forest_(26528816780).jpg', credit: 'Mark Penninger, U.S. Forest Service · Public Domain' }],
  },
  {
    id: 'meadow',
    range: '3000–4000 m',
    name: '高山草甸带',
    short: '矮生草本·开花植物',
    temp: '-5 ～ 5 ℃',
    precip: '300–800 mm',
    climate: '气温低，风力强，紫外线强',
    description: '在高海拔、低温和强风环境下，植物低矮，生长季短。',
    color: DemoHex.biomeGrass,
    guidePath: 'M396 405 C 520 394, 655 416, 815 430',
    focusX: 655,
    focusY: 416,
    marker: '3,000 m',
    labelTop: '43%',
    labelLeft: '45%',
    plants: [{ name: '高山嵩草', note: '根系发达，形成致密草毡层', image: '/images/biomes/plants/plant-feather-grass.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Stipa_capillata_kz07.jpg', credit: 'Krzysztof Ziarnek · Wikimedia Commons' }],
    animals: [{ name: '喜马拉雅旱獭（近缘种）', note: '冬眠越冬，暖季集中取食；图片为阿尔卑斯旱獭', image: '/images/animals/marmot.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:071_Wild_marmot_at_Grand_Muveran_Nature_Reserve_Photo_by_Giles_Laurent.jpg', credit: 'Giles Laurent · CC BY-SA 4.0' }],
  },
  {
    id: 'conifer',
    range: '2000–3000 m',
    name: '针叶林带',
    short: '云杉、冷杉等耐寒树种',
    temp: '2 ～ 9 ℃',
    precip: '500–1000 mm',
    climate: '冷湿，山地降水较多',
    description: '水分条件较好，耐寒针叶树种形成连续森林。',
    color: DemoHex.biomeForest,
    guidePath: 'M360 525 C 520 520, 690 548, 915 566',
    focusX: 690,
    focusY: 548,
    marker: '2,000 m',
    labelTop: '57%',
    labelLeft: '51%',
    plants: [{ name: '黑云杉', note: '塔形树冠利于积雪滑落', image: '/images/biomes/plants/plant-black-spruce.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Picea_mariana_cone.JPG', credit: 'Tilo Podner · CC BY-SA 3.0' }],
    animals: [{ name: '红松鼠', note: '取食种子，也参与森林种子传播', image: '/images/animals/red-squirrel.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Squirrel_posing.jpg', credit: 'Peter Trimming · CC BY 2.0' }],
  },
  {
    id: 'mixed',
    range: '1000–2000 m',
    name: '常绿阔叶林带',
    short: '山地森林·生物多样',
    temp: '8 ～ 16 ℃',
    precip: '800–1400 mm',
    climate: '温和湿润，水热条件好',
    description: '热量与水分条件相对优越，森林群落结构复杂。',
    color: DemoHex.vegetation,
    guidePath: 'M326 645 C 500 630, 718 660, 984 704',
    focusX: 735,
    focusY: 663,
    marker: '1,000 m',
    labelTop: '68%',
    labelLeft: '54%',
    plants: [{ name: '山茶', note: '林下耐阴，叶片常绿', image: '/images/biomes/plants/plant-camellia.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Camellia-japonica.jpg', credit: 'Nagahitoyuki · Wikimedia Commons' }],
    animals: [{ name: '红腹锦鸡', note: '活动于灌丛和林下，食物多样', image: '/images/animals/golden-pheasant.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Chrysolophus_pictus_MHNT.jpg', credit: 'Didier Descouens · CC BY-SA 3.0' }],
  },
  {
    id: 'valley',
    range: '0–1000 m',
    name: '河谷森林带',
    short: '河湖水系·山地基带',
    temp: '12 ～ 20 ℃',
    precip: '700–1200 mm',
    climate: '温暖，河谷水分充足',
    description: '河谷地形聚水，温度较高，构成山地垂直自然带的基带。',
    color: DemoHex.vegetation,
    guidePath: 'M286 770 C 505 748, 770 766, 1110 814',
    focusX: 900,
    focusY: 786,
    marker: '500 m',
    labelTop: '78%',
    labelLeft: '58%',
    plants: [{ name: '欧洲白桦', note: '根系耐水湿，能稳固河岸土壤', image: '/images/biomes/plants/plant-birch.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Betula_pendula_leaves.jpg', credit: 'Nefronus · CC0' }],
    animals: [{ name: '梅花鹿', note: '林缘与河谷草地提供食物和水源', image: '/images/animals/sika-deer.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82_%D0%BE%D0%BB%D0%B5%D0%BD%D1%8F.jpg', credit: 'Byrdyak · CC BY-SA 4.0' }],
  },
]

/** 林线 / 雪线：课堂示意关键界线（与左侧带谱海拔对齐，非实测） */
interface KeyLine {
  id: 'treeline' | 'snowline'
  name: string
  altitude: string
  note: string
  guidePath: string
  labelTop: string
  labelLeft?: string
  labelRight?: string
  /** 点击后打开的相邻自然带 */
  zoneId: string
  /** 左侧海拔轴上的大致位置（相对轴轨） */
  axisTop: string
}

const KEY_LINES: KeyLine[] = [
  {
    id: 'snowline',
    name: '雪线',
    altitude: '约 5,000 m',
    note: '常年积雪下界；之上为冰雪带',
    // 与冰雪带下缘（5,000 m）导引线同高程
    guidePath: 'M446 135 C 535 144, 628 157, 748 181',
    labelTop: '13%',
    labelLeft: '58%',
    zoneId: 'snow',
    axisTop: '20%',
  },
  {
    id: 'treeline',
    name: '林线',
    altitude: '约 3,000 m',
    note: '乔木连续分布上界；之上转为高山草甸',
    // 与针叶林上缘 / 草甸下缘（3,000 m）导引线同高程
    guidePath: 'M396 405 C 520 394, 655 416, 815 430',
    labelTop: '40%',
    // 与雪线标签相对控制点的横向偏移一致，避免压住 3,000 m 控制点。
    labelLeft: '62%',
    zoneId: 'conifer',
    axisTop: '51%',
  },
]

const selectedId = ref('meadow')
/** 默认草甸邻接林线，一并点亮关键界线 */
const selectedKeyId = ref<'treeline' | 'snowline' | null>('treeline')
const activeTab = ref<'climate' | 'plants' | 'animals' | 'landscape'>('climate')
const panelOpen = ref(true)
const preview = ref<Specimen | null>(null)
const tiltX = ref(0)
const tiltY = ref(0)

const zone = computed(() => ZONES.find((item) => item.id === selectedId.value) ?? ZONES[2]!)
const activeKeyLine = computed(() => KEY_LINES.find((item) => item.id === selectedKeyId.value) ?? null)
const sceneStyle = computed(() => ({
  '--look-x': `${tiltX.value}px`,
  '--look-y': `${tiltY.value}px`,
}))

function trackPointer(event: PointerEvent) {
  const node = event.currentTarget as HTMLElement
  const rect = node.getBoundingClientRect()
  tiltX.value = ((event.clientX - rect.left) / rect.width - 0.5) * 52
  tiltY.value = ((event.clientY - rect.top) / rect.height - 0.5) * 32
}

function keyLineForZone(id: string): KeyLine['id'] | null {
  return KEY_LINES.find((line) => line.zoneId === id)?.id
    ?? (id === 'meadow' ? 'treeline' : id === 'desert' ? 'snowline' : null)
}

/** 与关键线共用路径时，让沙金/绿色关键线优先，避免叠描 */
function zoneGuideActive(item: Zone) {
  if (selectedId.value !== item.id) return false
  const shared = KEY_LINES.find((line) => line.guidePath === item.guidePath)
  return !shared || selectedKeyId.value !== shared.id
}

function selectZone(id: string) {
  selectedId.value = id
  selectedKeyId.value = keyLineForZone(id)
  panelOpen.value = true
}

function selectKeyLine(id: KeyLine['id']) {
  const line = KEY_LINES.find((item) => item.id === id)
  if (!line) return
  selectedKeyId.value = id
  selectedId.value = line.zoneId
  panelOpen.value = true
}

function resetPointer() {
  tiltX.value = 0
  tiltY.value = 0
}
</script>

<template>
  <div
    class="cinematic"
    :style="sceneStyle"
    @pointermove="trackPointer"
    @pointerleave="resetPointer"
  >
    <div class="plate" aria-hidden="true" />
    <div class="cloud cloud-a" aria-hidden="true" />
    <div class="cloud cloud-b" aria-hidden="true" />
    <div class="grade" aria-hidden="true" />

    <header class="brand glass">
      <span class="mountain-mark" aria-hidden="true">
        <i />
        <i />
      </span>
      <span>
        <strong>山地垂直自然带</strong>
        <small>探索不同海拔下的气候、植被与自然景观</small>
      </span>
    </header>

    <aside class="elevation glass">
      <h3>海拔（米）</h3>
      <div class="elevation-line" />
      <button
        v-for="line in KEY_LINES"
        :key="`tick-${line.id}`"
        class="key-tick"
        :class="[line.id, { active: selectedKeyId === line.id }]"
        type="button"
        :style="{ top: line.axisTop }"
        :aria-label="`查看${line.name}`"
        @click="selectKeyLine(line.id)"
      >
        <i />
        <span>{{ line.name }}</span>
      </button>
      <button
        v-for="item in ZONES"
        :key="item.id"
        type="button"
        :class="{ active: selectedId === item.id }"
        @click="selectZone(item.id)"
      >
        <i :style="{ '--zone': item.color }" />
        <span><b>{{ item.range.replace(' m', '') }}</b>{{ item.name }}</span>
      </button>
    </aside>

    <svg class="mountain-guides" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
      <g v-for="item in ZONES" :key="item.id">
        <path class="guide-halo" :class="{ active: zoneGuideActive(item) }" :d="item.guidePath" />
        <path class="guide" :class="{ active: zoneGuideActive(item) }" :d="item.guidePath" />
      </g>
      <g v-for="line in KEY_LINES" :key="`key-${line.id}`">
        <path class="key-halo" :class="{ active: selectedKeyId === line.id }" :d="line.guidePath" />
        <path class="key-guide" :class="[line.id, { active: selectedKeyId === line.id }]" :d="line.guidePath" />
      </g>
      <circle class="focus-pulse" :cx="zone.focusX" :cy="zone.focusY" r="15" />
      <circle class="focus" :cx="zone.focusX" :cy="zone.focusY" r="9" />
    </svg>

    <button
      v-for="item in ZONES"
      :key="`label-${item.id}`"
      class="zone-label"
      :class="{ selected: selectedId === item.id }"
      :style="{ top: item.labelTop, left: item.labelLeft }"
      type="button"
      :aria-label="`查看${item.name}`"
      @click="selectZone(item.id)"
    >
      <b>{{ item.marker }}</b>
      <span>{{ item.name }}</span>
    </button>

    <button
      v-for="line in KEY_LINES"
      :key="`key-label-${line.id}`"
      class="key-label"
      :class="[line.id, { selected: selectedKeyId === line.id }]"
      :style="{ top: line.labelTop, left: line.labelLeft, right: line.labelRight }"
      type="button"
      :aria-label="`查看${line.name}`"
      :title="line.note"
      @click="selectKeyLine(line.id)"
    >
      <b>{{ line.name }}</b>
      <span>{{ line.altitude }}</span>
    </button>

    <aside v-if="panelOpen" class="detail glass">
      <button class="close" type="button" aria-label="关闭详情" @click="panelOpen = false">×</button>
      <h2>{{ zone.name }}</h2>
      <p class="range">海拔 {{ zone.range }}</p>
      <p v-if="activeKeyLine" class="key-note">
        <b>{{ activeKeyLine.name }}</b>{{ activeKeyLine.note }}
      </p>
      <div class="photo" :class="`photo-${zone.id}`" />
      <p class="description">{{ zone.description }}</p>
      <div class="detail-tabs" role="tablist" aria-label="自然带信息">
        <button type="button" :class="{ active: activeTab === 'climate' }" @click="activeTab = 'climate'">气候特征</button>
        <button type="button" :class="{ active: activeTab === 'plants' }" @click="activeTab = 'plants'">典型植被</button>
        <button type="button" :class="{ active: activeTab === 'animals' }" @click="activeTab = 'animals'">代表动物</button>
        <button type="button" :class="{ active: activeTab === 'landscape' }" @click="activeTab = 'landscape'">景观特点</button>
      </div>
      <div v-if="activeTab === 'climate'" class="facts">
        <p><i>℃</i><span>示意年均温</span><b>{{ zone.temp }}</b></p>
        <p><i>❄</i><span>示意年降水量</span><b>{{ zone.precip }}</b></p>
        <p><i>≈</i><span>气候特点</span><b>{{ zone.climate }}</b></p>
      </div>
      <div v-else-if="activeTab === 'plants'" class="specimen-grid">
        <button
          v-for="item in zone.plants"
          :key="item.name"
          class="specimen"
          type="button"
          @click="preview = item"
        >
          <div class="specimen-image" :style="{ backgroundImage: `url(${item.image})` }" />
          <span><b>{{ item.name }}</b><small>{{ item.note }}</small></span>
        </button>
      </div>
      <div v-else-if="activeTab === 'animals'" class="specimen-grid">
          <button v-for="item in zone.animals" :key="item.name" type="button" class="specimen" @click="preview = item">
            <div class="specimen-image" :style="{ backgroundImage: `url(${item.image})` }" />
            <span><b>{{ item.name }}</b><small>{{ item.note }}</small></span>
          </button>
      </div>
      <p v-else class="tab-copy">
        {{ zone.short }}。景观沿海拔方向呈明显带状更替，界线会因坡向、水分和局地地形而上下波动。
      </p>
    </aside>
    <button v-else class="reopen glass" type="button" @click="panelOpen = true">自然带详情</button>

    <div class="cinematic-note">课堂示意 · 虚构山系与示意数值 · 非实拍、非实测地形、非卫星正射图</div>
    <div v-if="preview" class="specimen-preview" role="dialog" aria-modal="true" :aria-label="`${preview.name}图片预览`" @click.self="preview = null">
      <figure>
        <button type="button" aria-label="关闭图片预览" @click="preview = null">×</button>
        <img :src="preview.image" :alt="`${preview.name}真实图片`" />
        <figcaption><b>{{ preview.name }}</b><span>{{ preview.note }}</span><a :href="preview.sourceUrl" target="_blank" rel="noreferrer">{{ preview.credit }}</a></figcaption>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.cinematic {
  --look-x: 0px;
  --look-y: 0px;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
  overflow: hidden;
  color: var(--knowledge-body);
  background: var(--demo-canvas);
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.plate {
  position: absolute;
  inset: -3%;
  background: url('/images/env-differentiation/alpine-2_5d-hero-4k.webp') center / cover no-repeat;
  transition: transform .22s cubic-bezier(.2,.75,.2,1), filter .35s ease;
  will-change: transform;
}
.plate {
  transform: translate3d(calc(var(--look-x) * -.55), calc(var(--look-y) * -.45), 0) scale(1.12);
}
.cloud {
  position: absolute;
  width: 34vw;
  height: 10vw;
  min-height: 70px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgb(255 255 255 / 48%) 0, rgb(238 248 255 / 21%) 42%, transparent 72%);
  filter: blur(15px);
  opacity: .55;
  animation: drift 18s ease-in-out infinite alternate;
  pointer-events: none;
}
.cloud-a { left: 3%; top: 41%; }
.cloud-b { right: 8%; top: 49%; opacity: .4; animation-delay: -7s; }
.grade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgb(5 17 31 / 42%) 0, transparent 26%, transparent 70%, rgb(5 17 31 / 22%) 100%), linear-gradient(0deg, rgb(3 14 25 / 22%), transparent 38%);
  pointer-events: none;
}
@keyframes drift { to { transform: translate3d(30px, -7px, 0) scale(1.08); } }
.glass {
  border: 1px solid rgb(182 220 245 / 17%);
  background: linear-gradient(145deg, color-mix(in srgb, var(--demo-panel) 92%, var(--demo-accent)), color-mix(in srgb, var(--demo-canvas) 82%, transparent));
  box-shadow: 0 16px 38px rgb(0 10 22 / 28%);
  backdrop-filter: blur(14px) saturate(1.15);
}
.brand {
  position: absolute;
  z-index: 5;
  top: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 12px 18px;
  border-radius: 16px;
}
.brand strong { display: block; color: var(--knowledge-title); font-size: 20px; letter-spacing: .03em; }
.brand small { display: block; margin-top: 3px; color: var(--knowledge-muted); font-size: 10px; }
.mountain-mark { position: relative; width: 52px; height: 36px; }
.mountain-mark i { position: absolute; bottom: 0; width: 36px; height: 30px; background: var(--demo-ink); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.mountain-mark i:first-child { left: 0; }
.mountain-mark i:last-child { right: 0; height: 23px; opacity: .9; }
.elevation {
  position: absolute;
  z-index: 5;
  top: 108px;
  bottom: 24px;
  left: 16px;
  display: flex;
  width: 206px;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 12px 10px;
  border-radius: 14px;
  background: linear-gradient(90deg, rgb(15 43 70 / 77%), rgb(15 43 70 / 15%));
}
.elevation h3 { margin: 0 0 3px; font-size: 11px; color: var(--knowledge-body); }
.elevation-line { position: absolute; top: 55px; bottom: 26px; left: 23px; width: 1px; background: rgb(226 244 255 / 55%); }
.elevation > button:not(.key-tick) {
  position: relative;
  display: grid;
  grid-template-columns: 25px 1fr;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 2px 4px;
  border: 0;
  color: var(--knowledge-body);
  text-align: left;
  background: transparent;
  cursor: pointer;
}
.elevation > button:not(.key-tick) > i {
  z-index: 1;
  width: 10px;
  height: 10px;
  margin-left: 2px;
  border: 2px solid var(--demo-ink-muted);
  border-radius: 50%;
  background: rgb(130 158 180 / 80%);
  box-shadow: 0 0 0 3px rgb(255 255 255 / 12%);
}
.elevation > button:not(.key-tick) span { display: grid; gap: 2px; font-size: 11px; }
.elevation > button:not(.key-tick) b { font-size: 12px; font-weight: 500; }
.elevation > button:not(.key-tick).active { color: var(--knowledge-data); text-shadow: 0 1px 8px var(--demo-accent); }
.elevation > button:not(.key-tick).active > i { background: var(--demo-accent); border-color: var(--demo-ink); box-shadow: 0 0 0 5px color-mix(in srgb, var(--demo-accent) 36%, transparent), 0 0 18px var(--demo-accent); }
.elevation > button:not(.key-tick).active b { font-weight: 700; }
.key-tick {
  position: absolute;
  z-index: 2;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  color: var(--demo-lift);
  background: transparent;
  cursor: pointer;
  transform: translateY(-50%);
}
.key-tick > i {
  width: 9px;
  height: 9px;
  border: 1.5px solid var(--demo-lift);
  border-radius: 1px;
  background: rgb(240 208 120 / 85%);
  box-shadow: 0 0 0 2px rgb(12 28 42 / 55%);
  transform: rotate(45deg);
}
.key-tick span {
  padding: 1px 5px;
  border-radius: 3px;
  background: rgb(18 42 64 / 78%);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  text-shadow: 0 1px 2px var(--demo-canvas);
}
.key-tick.active { color: var(--demo-ink); }
.key-tick.active > i {
  background: var(--demo-lift);
  border-color: var(--demo-ink);
  box-shadow: 0 0 0 3px rgb(240 208 120 / 35%), 0 0 12px rgb(240 208 120 / 55%);
}
.key-tick.active span { background: rgb(120 88 18 / 82%); }
.mountain-guides {
  position: absolute;
  inset: 0;
  z-index: 3;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transform: translate3d(calc(var(--look-x) * -.3), calc(var(--look-y) * -.24), 0) scale(1.07);
  transition: transform .22s cubic-bezier(.2,.75,.2,1);
  will-change: transform;
}
.guide,
.guide-halo { fill: none; vector-effect: non-scaling-stroke; }
.guide-halo {
  stroke: rgb(3 13 24 / 72%);
  stroke-width: 5.5;
  stroke-linecap: round;
}
.guide {
  stroke: rgb(235 248 255 / 88%);
  stroke-width: 1.8;
  stroke-dasharray: 8 6;
  stroke-linecap: round;
  filter: drop-shadow(0 1px 2px rgb(0 12 25 / 92%));
  transition: stroke .25s ease, stroke-width .25s ease, opacity .25s ease;
}
.guide.active {
  stroke: var(--demo-accent);
  stroke-width: 4;
  stroke-dasharray: none;
  filter: drop-shadow(0 0 6px var(--demo-accent)) drop-shadow(0 0 12px color-mix(in srgb, var(--demo-accent) 72%, transparent));
}
.guide-halo.active { stroke: rgb(5 27 44 / 90%); stroke-width: 8; }
.key-halo,
.key-guide { fill: none; vector-effect: non-scaling-stroke; }
.key-halo {
  stroke: rgb(18 28 12 / 70%);
  stroke-width: 6;
  stroke-linecap: round;
  opacity: .55;
}
.key-guide {
  stroke: var(--demo-lift);
  stroke-width: 2.2;
  stroke-dasharray: 14 7;
  stroke-linecap: round;
  filter: drop-shadow(0 1px 2px rgb(0 12 25 / 90%));
  transition: stroke .25s ease, stroke-width .25s ease, opacity .25s ease;
}
.key-guide.treeline { stroke: var(--demo-vegetation); }
.key-guide.active {
  stroke-width: 3.4;
  stroke-dasharray: 10 5;
  filter: drop-shadow(0 0 6px rgb(240 208 120 / 70%));
}
.key-guide.treeline.active { filter: drop-shadow(0 0 6px rgb(140 200 90 / 70%)); }
.key-halo.active { stroke: rgb(22 28 10 / 88%); stroke-width: 8; opacity: .9; }
.focus {
  fill: var(--demo-accent);
  stroke: var(--demo-ink);
  stroke-width: 4;
  filter: drop-shadow(0 0 9px var(--demo-accent));
}
.focus-pulse {
  fill: rgb(63 182 255 / 18%);
  stroke: rgb(122 211 255 / 70%);
  stroke-width: 2;
  transform-box: fill-box;
  transform-origin: center;
  animation: focus-pulse 1.8s ease-out infinite;
}
@keyframes focus-pulse { 70%, 100% { opacity: 0; transform: scale(1.8); } }
.scene-label,
.zone-label {
  position: absolute;
  z-index: 4;
  display: grid;
  gap: 2px;
  padding: 5px 8px;
  border: 0;
  border-radius: 5px;
  color: var(--knowledge-data);
  text-align: left;
  background: rgb(19 45 68 / 66%);
  text-shadow: 0 1px 3px var(--demo-canvas);
  box-shadow: 0 3px 12px rgb(0 0 0 / 16%);
  transform: translate3d(calc(var(--look-x) * -.3), calc(var(--look-y) * -.24), 0);
  transition: transform .22s cubic-bezier(.2,.75,.2,1), background .2s ease, box-shadow .2s ease;
  will-change: transform;
}
.scene-label b,
.zone-label b { font-size: 12px; }
.scene-label span,
.zone-label span { font-size: 11px; }
.zone-label { cursor: pointer; }
.zone-label.selected {
  color: var(--demo-ink);
  background: color-mix(in srgb, var(--demo-accent) 90%, var(--demo-panel));
  box-shadow: 0 0 0 1px rgb(136 218 255 / 72%), 0 5px 20px rgb(13 106 176 / 52%);
}
.key-label {
  position: absolute;
  z-index: 4;
  display: grid;
  gap: 1px;
  padding: 4px 8px;
  border: 1px solid rgb(240 208 120 / 42%);
  border-radius: 5px;
  color: var(--demo-lift);
  text-align: left;
  background: rgb(32 40 18 / 72%);
  text-shadow: 0 1px 3px var(--demo-canvas);
  box-shadow: 0 3px 12px rgb(0 0 0 / 18%);
  cursor: pointer;
  max-width: min(142px, calc(100% - 20px));
  transform: translate3d(calc(var(--look-x) * -.3), calc(var(--look-y) * -.24), 0);
  transition: transform .22s cubic-bezier(.2,.75,.2,1), background .2s ease, box-shadow .2s ease, border-color .2s ease;
  will-change: transform;
}
.key-label.treeline {
  border-color: rgb(159 208 122 / 45%);
  color: var(--demo-vegetation);
  background: rgb(18 36 20 / 74%);
}
.key-label b { font-size: 11px; letter-spacing: .06em; }
.key-label span { color: rgb(255 255 255 / 78%); font-size: 10px; }
.key-label.selected {
  color: var(--demo-ink);
  background: rgb(120 88 18 / 88%);
  border-color: rgb(255 224 140 / 78%);
  box-shadow: 0 0 0 1px rgb(240 208 120 / 55%), 0 5px 18px rgb(90 70 10 / 45%);
}
.key-label.treeline.selected {
  background: rgb(48 86 28 / 90%);
  border-color: rgb(180 230 130 / 78%);
  box-shadow: 0 0 0 1px rgb(159 208 122 / 55%), 0 5px 18px rgb(30 60 12 / 45%);
}
.detail {
  position: absolute;
  z-index: 6;
  top: 16px;
  right: 16px;
  width: min(332px, 28vw);
  padding: 18px;
  border-radius: 16px;
}
.detail h2 { margin: 0; color: var(--knowledge-title); font-size: 21px; }
.detail .range { margin: 3px 0 8px; color: var(--knowledge-muted); font-size: 12px; }
.key-note {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin: 0 0 10px;
  padding: 6px 8px;
  border: 1px solid rgb(240 208 120 / 28%);
  border-radius: 6px;
  color: var(--knowledge-body);
  background: rgb(48 42 16 / 42%);
  font-size: 10px;
  line-height: 1.55;
}
.key-note b {
  flex: none;
  color: var(--demo-lift);
  font-size: 11px;
  letter-spacing: .04em;
}
.close { position: absolute; top: 8px; right: 10px; border: 0; color: white; background: transparent; font-size: 26px; cursor: pointer; }
.photo {
  height: 128px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 8px;
  background-image: url('/images/env-differentiation/alpine-2_5d-hero-4k.webp');
  background-size: 265%;
  background-position: 43% 55%;
}
.photo-snow, .photo-desert { background-position: 38% 18%; }
.photo-conifer, .photo-mixed { background-position: 29% 69%; }
.photo-valley { background-position: 75% 84%; }
.description { min-height: 44px; margin: 10px 0; color: var(--knowledge-body); font-size: 11px; line-height: 1.75; }
.detail-tabs { display: grid; grid-template-columns: repeat(4, 1fr); overflow: hidden; border-radius: 7px; background: rgb(3 16 28 / 40%); }
.detail-tabs button { padding: 7px 2px; border: 0; color: var(--knowledge-muted); background: transparent; font-size: 10px; cursor: pointer; }
.detail-tabs button.active { color: var(--knowledge-data); background: linear-gradient(180deg, var(--demo-cold-soft), var(--demo-accent)); }
.facts { display: grid; gap: 9px; margin-top: 12px; }
.facts p { display: grid; grid-template-columns: 32px 1fr; margin: 0; }
.facts i { grid-row: span 2; align-self: center; color: var(--demo-ink); font-size: 22px; font-style: normal; }
.facts span { color: var(--knowledge-muted); font-size: 10px; }
.facts b { margin-top: 2px; color: var(--knowledge-data); font-size: 13px; font-weight: 500; }
.specimen-grid { display: grid; gap: 8px; margin-top: 11px; }
.specimen {
  position: relative;
  display: grid;
  grid-template-columns: 112px 1fr;
  align-items: center;
  min-height: 112px;
  overflow: hidden;
  border: 1px solid rgb(142 207 246 / 20%);
  border-radius: 9px;
  padding: 0;
  background: linear-gradient(110deg, rgb(27 78 98 / 52%), rgb(8 30 48 / 48%));
  color: inherit;
  text-align: left;
  cursor: zoom-in;
  animation: specimen-breathe 3.8s ease-in-out infinite alternate;
}
.specimen:nth-child(2) { animation-delay: -1.9s; }
.specimen-image {
  align-self: stretch;
  min-height: 112px;
  background-position: center;
  background-size: cover;
  filter: saturate(.9) contrast(1.06);
  transform: scale(1.04);
  transition: transform .45s ease, filter .45s ease;
}
.specimen:hover .specimen-image { filter: saturate(1.1) contrast(1.08); transform: scale(1.13); }
.specimen > span { display: grid; gap: 3px; padding: 8px 9px; }
.specimen b { color: var(--knowledge-data); font-size: 12px; }
.specimen small { color: var(--knowledge-muted); font-size: 9px; line-height: 1.45; }
@keyframes specimen-breathe { to { border-color: rgb(116 208 255 / 40%); box-shadow: inset 0 0 18px rgb(57 164 217 / 8%); } }
.specimen-preview {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 10 18 / 72%);
  backdrop-filter: blur(5px);
}
.specimen-preview figure {
  position: relative;
  width: min(760px, 92vw);
  max-height: 90%;
  margin: 0;
  overflow: auto;
  border: 1px solid rgb(203 232 250 / 42%);
  border-radius: 12px;
  background: var(--demo-panel);
  box-shadow: 0 22px 55px rgb(0 0 0 / 55%);
}
.specimen-preview figure > button { position: absolute; z-index: 1; top: 8px; right: 8px; width: 32px; height: 32px; border: 0; border-radius: 50%; color: white; background: rgb(0 12 22 / 72%); font-size: 24px; cursor: pointer; }
.specimen-preview img { display: block; width: 100%; max-height: 65vh; object-fit: contain; background: var(--demo-canvas); }
.specimen-preview figcaption { display: grid; gap: 4px; padding: 12px 16px; color: var(--knowledge-body); font-size: 12px; line-height: 1.5; }
.specimen-preview figcaption b { color: var(--knowledge-title); font-size: 15px; }
.specimen-preview figcaption a { color: var(--demo-accent-soft); font-size: 10px; }
.tab-copy { min-height: 82px; margin: 14px 0 0; color: var(--knowledge-body); font-size: 12px; line-height: 1.8; }
.reopen { position: absolute; z-index: 6; top: 18px; right: 18px; padding: 9px 12px; border-radius: 10px; color: white; cursor: pointer; }
.cinematic-note { position: absolute; right: 16px; bottom: 12px; z-index: 4; max-width: 50%; color: var(--demo-ink-muted); font-size: 9px; text-align: right; text-shadow: 0 1px 4px var(--demo-canvas); }
@media (max-width: 980px) {
  .detail { width: 280px; }
  .elevation { width: 175px; }
}
@media (max-width: 760px) {
  .brand small, .mountain-guides, .peak-label, .zone-label, .key-label, .key-tick { display: none; }
  .brand strong { font-size: 15px; }
  .elevation { top: 84px; bottom: 16px; width: 150px; }
  .detail { top: 84px; right: 8px; width: 230px; padding: 12px; }
  .photo { height: 90px; }
  .cinematic-note { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .plate, .cloud, .mountain-guides, .zone-label, .key-label, .focus-pulse, .specimen { transition: none; animation: none; }
}
</style>
