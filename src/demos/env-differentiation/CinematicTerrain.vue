<script setup lang="ts">
import { computed, ref } from 'vue'

interface Specimen {
  name: string
  note: string
  icon: string
  image?: string
  video?: string
  videoCredit?: string
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
    color: '#eaf6ff',
    guidePath: 'M446 135 C 535 144, 628 157, 748 181',
    focusX: 623,
    focusY: 157,
    marker: '5,000 m',
    labelTop: '16%',
    labelLeft: '38%',
    plants: [
      { name: '雪莲', note: '绒毛减少热量散失，贴近地面生长', icon: '❉', image: '/images/biomes/plants/plant-arctic-willow.jpg' },
      { name: '垫状点地梅', note: '形成紧密垫状体，抵御强风和低温', icon: '✿' },
    ],
    animals: [
      {
        name: '雪豹', note: '厚毛、宽大足垫，适应高寒岩坡', icon: '🐆',
        video: '/videos/animals/snow-leopard.webm',
        videoCredit: '印度喜马偕尔邦斯皮提的野生雪豹，红外相机拍摄。Rishi Sharma · CC BY 3.0',
      },
      {
        name: '岩羊', note: '蹄缘坚硬，善于在陡峭裸岩活动', icon: '🐐',
        video: '/videos/animals/alpine-ibex.webm',
        videoCredit: '实拍为阿尔卑斯羱羊在岩坡活动，与岩羊同为羊亚科。Tobias Gasser · CC BY-SA 2.5',
      },
    ],
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
    color: '#b9c7d2',
    guidePath: 'M414 226 C 530 230, 648 250, 802 278',
    focusX: 650,
    focusY: 250,
    marker: '4,000 m',
    labelTop: '28%',
    labelLeft: '41%',
    plants: [
      { name: '高山蒿', note: '叶片细小，被毛可降低蒸腾', icon: '❋', image: '/images/biomes/plants/plant-feather-grass.jpg' },
      { name: '高山紫菀', note: '生长期短，花期集中于暖季', icon: '✾' },
    ],
    animals: [
      {
        name: '高原鼠兔', note: '穴居避寒，是高原食物网关键种', icon: '🐇',
        video: '/videos/animals/american-pika.webm',
        videoCredit: '实拍为北美鼠兔在落基山碎石间取食，与高原鼠兔同属。mark byzewski · CC BY 2.0',
      },
      { name: '藏原羚', note: '耐缺氧，季节性迁移寻找食物', icon: '🦌' },
    ],
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
    color: '#61b8ff',
    guidePath: 'M396 405 C 520 394, 655 416, 815 430',
    focusX: 655,
    focusY: 416,
    marker: '3,000 m',
    labelTop: '43%',
    labelLeft: '45%',
    plants: [
      { name: '高山嵩草', note: '根系发达，形成致密草毡层', icon: '♒', image: '/images/biomes/plants/plant-feather-grass.jpg' },
      { name: '龙胆', note: '植株低矮，花色鲜艳吸引传粉昆虫', icon: '✿' },
    ],
    animals: [
      {
        name: '喜马拉雅旱獭', note: '冬眠越冬，暖季集中取食', icon: '🦫',
        video: '/videos/animals/alpine-marmot-foraging.webm',
        videoCredit: '实拍为阿尔卑斯旱獭在瑞士高山取食，与喜马拉雅旱獭同属。Marcel Zurreck · CC BY 4.0',
      },
      {
        name: '高山兀鹫', note: '利用山谷上升气流长距离滑翔', icon: '🦅',
        video: '/videos/animals/himalayan-vulture.webm',
        videoCredit: '喜马拉雅兀鹫实拍，地点为科威特。Alahamali70 · CC BY-SA 4.0',
      },
    ],
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
    color: '#d8f0ff',
    guidePath: 'M360 525 C 520 520, 690 548, 915 566',
    focusX: 690,
    focusY: 548,
    marker: '2,000 m',
    labelTop: '57%',
    labelLeft: '51%',
    plants: [
      { name: '云杉', note: '塔形树冠利于积雪滑落', icon: '▲', image: '/images/biomes/plants/plant-black-spruce.jpg' },
      { name: '冷杉', note: '叶片针状、表皮厚，耐寒耐湿', icon: '♠' },
    ],
    animals: [
      {
        name: '红松鼠', note: '取食种子，也参与森林种子传播', icon: '🐿️',
        video: '/videos/animals/red-squirrel.webm',
        videoCredit: '欧亚红松鼠在树上取食浆果。Roberto Verzo · CC BY 3.0',
      },
      { name: '林麝', note: '善于在针叶林下隐蔽活动', icon: '🦌' },
    ],
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
    color: '#edf8ff',
    guidePath: 'M326 645 C 500 630, 718 660, 984 704',
    focusX: 735,
    focusY: 663,
    marker: '1,000 m',
    labelTop: '68%',
    labelLeft: '54%',
    plants: [
      { name: '青冈', note: '常绿革质叶，适应湿润环境', icon: '●', image: '/images/biomes/plants/plant-oak.jpg' },
      { name: '山茶', note: '林下耐阴，叶片常绿', icon: '✿', image: '/images/biomes/plants/plant-camellia.jpg' },
    ],
    animals: [
      {
        name: '红腹锦鸡', note: '活动于灌丛和林下，食物多样', icon: '🦚',
        video: '/videos/animals/golden-pheasant.webm',
        videoCredit: '红腹锦鸡实拍，画面中有笼网。Andrew Simone · CC BY 2.0',
      },
      { name: '猕猴', note: '杂食性，随季节改变取食层位', icon: '🐒' },
    ],
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
    color: '#edf8ff',
    guidePath: 'M286 770 C 505 748, 770 766, 1110 814',
    focusX: 900,
    focusY: 786,
    marker: '500 m',
    labelTop: '78%',
    labelLeft: '58%',
    plants: [
      { name: '栎类', note: '乔木层发达，形成连续林冠', icon: '♣', image: '/images/biomes/plants/plant-oak.jpg' },
      { name: '河岸柳', note: '根系耐水湿，稳固河岸土壤', icon: '⌇', image: '/images/biomes/plants/plant-birch.jpg' },
    ],
    animals: [
      {
        name: '梅花鹿', note: '林缘与河谷草地提供食物和水源', icon: '🦌',
        video: '/videos/animals/sika-deer.webm',
        videoCredit: '实拍为北海道钏路的虾夷梅花鹿，是梅花鹿的亚种。Nesnad · CC BY 4.0',
      },
      {
        name: '画眉', note: '灌丛层栖息，取食昆虫和浆果', icon: '🐦',
        video: '/videos/animals/hwamei.webm',
        videoCredit: '画眉实拍，地点为日本横滨。ContributorQ · CC BY 3.0',
      },
    ],
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
  labelLeft: string
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
    labelLeft: '66%',
    zoneId: 'conifer',
    axisTop: '51%',
  },
]

const selectedId = ref('meadow')
/** 默认草甸邻接林线，一并点亮关键界线 */
const selectedKeyId = ref<'treeline' | 'snowline' | null>('treeline')
const activeTab = ref<'climate' | 'plants' | 'animals' | 'landscape'>('climate')
const panelOpen = ref(true)
const tiltX = ref(0)
const tiltY = ref(0)
const activeAnimalIndex = ref(0)

const zone = computed(() => ZONES.find((item) => item.id === selectedId.value) ?? ZONES[2]!)
const activeKeyLine = computed(() => KEY_LINES.find((item) => item.id === selectedKeyId.value) ?? null)
const activeAnimal = computed(() => zone.value.animals[activeAnimalIndex.value] ?? zone.value.animals[0]!)
const hasFilm = computed(() => zone.value.animals.some((item) => item.video))
const sceneStyle = computed(() => ({
  '--look-x': `${tiltX.value}px`,
  '--look-y': `${tiltY.value}px`,
}))

function trackPointer(event: PointerEvent) {
  const node = event.currentTarget as HTMLElement
  const rect = node.getBoundingClientRect()
  tiltX.value = ((event.clientX - rect.left) / rect.width - 0.5) * 34
  tiltY.value = ((event.clientY - rect.top) / rect.height - 0.5) * 20
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
  activeAnimalIndex.value = 0
  panelOpen.value = true
}

function selectKeyLine(id: KeyLine['id']) {
  const line = KEY_LINES.find((item) => item.id === id)
  if (!line) return
  selectedKeyId.value = id
  selectedId.value = line.zoneId
  activeAnimalIndex.value = 0
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
      :style="{ top: line.labelTop, left: line.labelLeft }"
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
        <p><i>℃</i><span>年平均气温</span><b>{{ zone.temp }}</b></p>
        <p><i>❄</i><span>年降水量</span><b>{{ zone.precip }}</b></p>
        <p><i>≈</i><span>气候特点</span><b>{{ zone.climate }}</b></p>
      </div>
      <div v-else-if="activeTab === 'plants'" class="specimen-grid">
        <article
          v-for="item in zone.plants"
          :key="item.name"
          class="specimen"
        >
          <div v-if="item.image" class="specimen-image" :style="{ backgroundImage: `url(${item.image})` }" />
          <i v-else class="specimen-icon" aria-hidden="true">{{ item.icon }}</i>
          <span><b>{{ item.name }}</b><small>{{ item.note }}</small></span>
        </article>
      </div>
      <div v-else-if="activeTab === 'animals'" class="animal-explorer">
        <figure v-if="activeAnimal.video" class="animal-film">
          <video
            :key="activeAnimal.video"
            :src="activeAnimal.video"
            autoplay
            muted
            loop
            playsinline
            disablepictureinpicture
            :aria-label="`${activeAnimal.name}实拍`"
          />
          <figcaption>{{ activeAnimal.videoCredit }}</figcaption>
        </figure>
        <p v-else-if="hasFilm" class="animal-missing">这段还没有合适的开放授权实拍。</p>
        <div v-if="hasFilm" class="animal-switch" role="group" aria-label="选择动物实拍">
          <button
            v-for="(item, index) in zone.animals"
            :key="item.name"
            type="button"
            :class="{ active: activeAnimalIndex === index }"
            @click="activeAnimalIndex = index"
          >
            <i aria-hidden="true">{{ item.icon }}</i>
            <span><b>{{ item.name }}</b><small>{{ item.note }}</small></span>
          </button>
        </div>
        <div v-else class="specimen-grid">
          <article v-for="item in zone.animals" :key="item.name" class="specimen">
            <i class="specimen-icon" aria-hidden="true">{{ item.icon }}</i>
            <span><b>{{ item.name }}</b><small>{{ item.note }}</small></span>
          </article>
        </div>
      </div>
      <p v-else class="tab-copy">
        {{ zone.short }}。景观沿海拔方向呈明显带状更替，界线会因坡向、水分和局地地形而上下波动。
      </p>
    </aside>
    <button v-else class="reopen glass" type="button" @click="panelOpen = true">自然带详情</button>

    <div class="cinematic-note">2.5D 沉浸演示 · 固定教学机位</div>
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
  background: #17334f;
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
  transform: translate3d(calc(var(--look-x) * -.3), calc(var(--look-y) * -.24), 0) scale(1.07);
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
  background: linear-gradient(145deg, rgb(18 47 77 / 90%), rgb(8 28 48 / 82%));
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
.mountain-mark i { position: absolute; bottom: 0; width: 36px; height: 30px; background: #f5fbff; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
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
  border: 2px solid #ddecf6;
  border-radius: 50%;
  background: rgb(130 158 180 / 80%);
  box-shadow: 0 0 0 3px rgb(255 255 255 / 12%);
}
.elevation > button:not(.key-tick) span { display: grid; gap: 2px; font-size: 11px; }
.elevation > button:not(.key-tick) b { font-size: 12px; font-weight: 500; }
.elevation > button:not(.key-tick).active { color: var(--knowledge-data); text-shadow: 0 1px 8px #2b9fff; }
.elevation > button:not(.key-tick).active > i { background: #52aaff; border-color: #fff; box-shadow: 0 0 0 5px rgb(54 156 255 / 36%), 0 0 18px #4daaff; }
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
  color: #f0d078;
  background: transparent;
  cursor: pointer;
  transform: translateY(-50%);
}
.key-tick > i {
  width: 9px;
  height: 9px;
  border: 1.5px solid #f6e2a0;
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
  text-shadow: 0 1px 2px #06131d;
}
.key-tick.active { color: #fff4c8; }
.key-tick.active > i {
  background: #f0d078;
  border-color: #fff;
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
  stroke: #4fc2ff;
  stroke-width: 4;
  stroke-dasharray: none;
  filter: drop-shadow(0 0 6px #168ee8) drop-shadow(0 0 12px rgb(43 165 255 / 72%));
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
  stroke: #e8b84a;
  stroke-width: 2.2;
  stroke-dasharray: 14 7;
  stroke-linecap: round;
  filter: drop-shadow(0 1px 2px rgb(0 12 25 / 90%));
  transition: stroke .25s ease, stroke-width .25s ease, opacity .25s ease;
}
.key-guide.treeline { stroke: #9fd07a; }
.key-guide.active {
  stroke-width: 3.4;
  stroke-dasharray: 10 5;
  filter: drop-shadow(0 0 6px rgb(240 208 120 / 70%));
}
.key-guide.treeline.active { filter: drop-shadow(0 0 6px rgb(140 200 90 / 70%)); }
.key-halo.active { stroke: rgb(22 28 10 / 88%); stroke-width: 8; opacity: .9; }
.focus {
  fill: #258fe7;
  stroke: white;
  stroke-width: 4;
  filter: drop-shadow(0 0 9px #2aa5ff);
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
  text-shadow: 0 1px 3px #06131d;
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
  color: #fff;
  background: rgb(20 112 181 / 90%);
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
  color: #f6e7b0;
  text-align: left;
  background: rgb(32 40 18 / 72%);
  text-shadow: 0 1px 3px #06131d;
  box-shadow: 0 3px 12px rgb(0 0 0 / 18%);
  cursor: pointer;
  transform: translate3d(calc(var(--look-x) * -.3), calc(var(--look-y) * -.24), 0);
  transition: transform .22s cubic-bezier(.2,.75,.2,1), background .2s ease, box-shadow .2s ease, border-color .2s ease;
  will-change: transform;
}
.key-label.treeline {
  border-color: rgb(159 208 122 / 45%);
  color: #d7efb8;
  background: rgb(18 36 20 / 74%);
}
.key-label b { font-size: 11px; letter-spacing: .06em; }
.key-label span { color: rgb(255 255 255 / 78%); font-size: 10px; }
.key-label.selected {
  color: #fff8dc;
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
  color: #f0d078;
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
.detail-tabs button.active { color: var(--knowledge-data); background: linear-gradient(180deg, #4ca9eb, #2e7fba); }
.facts { display: grid; gap: 9px; margin-top: 12px; }
.facts p { display: grid; grid-template-columns: 32px 1fr; margin: 0; }
.facts i { grid-row: span 2; align-self: center; color: #f4fbff; font-size: 22px; font-style: normal; }
.facts span { color: var(--knowledge-muted); font-size: 10px; }
.facts b { margin-top: 2px; color: var(--knowledge-data); font-size: 13px; font-weight: 500; }
.specimen-grid { display: grid; gap: 8px; margin-top: 11px; }
.specimen {
  position: relative;
  display: grid;
  grid-template-columns: 58px 1fr;
  align-items: center;
  min-height: 58px;
  overflow: hidden;
  border: 1px solid rgb(142 207 246 / 20%);
  border-radius: 9px;
  background: linear-gradient(110deg, rgb(27 78 98 / 52%), rgb(8 30 48 / 48%));
  animation: specimen-breathe 3.8s ease-in-out infinite alternate;
}
.specimen:nth-child(2) { animation-delay: -1.9s; }
.specimen-image {
  align-self: stretch;
  min-height: 58px;
  background-position: center;
  background-size: cover;
  filter: saturate(.9) contrast(1.06);
  transform: scale(1.04);
  transition: transform .45s ease, filter .45s ease;
}
.specimen:hover .specimen-image { filter: saturate(1.1) contrast(1.08); transform: scale(1.13); }
.specimen-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-left: 8px;
  border: 1px solid rgb(157 220 255 / 28%);
  border-radius: 50%;
  color: #eaf8ff;
  background: radial-gradient(circle at 35% 28%, rgb(82 183 236 / 58%), rgb(18 66 94 / 65%));
  font-size: 25px;
  font-style: normal;
  filter: drop-shadow(0 4px 8px rgb(0 9 18 / 36%));
  animation: specimen-float 2.8s ease-in-out infinite alternate;
}
.specimen:nth-child(2) .specimen-icon { animation-delay: -1.4s; }
.specimen > span { display: grid; gap: 3px; padding: 8px 9px; }
.specimen b { color: var(--knowledge-data); font-size: 12px; }
.specimen small { color: var(--knowledge-muted); font-size: 9px; line-height: 1.45; }
.specimen.animal { background: linear-gradient(110deg, rgb(70 60 35 / 42%), rgb(8 30 48 / 48%)); }
.animal-explorer { display: grid; gap: 8px; margin-top: 10px; }
.animal-film { margin: 0; }
.animal-film video {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 8px;
  background: #07131c;
}
.animal-film video::-webkit-media-controls,
.animal-film video::-webkit-media-controls-enclosure {
  display: none !important;
}
.animal-film figcaption,
.animal-missing {
  margin-top: 4px;
  color: var(--knowledge-muted);
  font-size: 9px;
  line-height: 1.45;
}
.animal-missing { margin: 0; }
.animal-switch { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.animal-switch button {
  display: grid;
  grid-template-columns: 31px minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 5px;
  border: 1px solid rgb(138 205 239 / 18%);
  border-radius: 8px;
  color: var(--knowledge-body);
  text-align: left;
  background: rgb(7 27 43 / 62%);
  cursor: pointer;
}
.animal-switch button.active {
  border-color: rgb(99 199 255 / 68%);
  color: #fff;
  background: linear-gradient(135deg, rgb(36 126 177 / 74%), rgb(13 56 84 / 78%));
  box-shadow: 0 0 14px rgb(48 164 222 / 18%);
}
.animal-switch i { font-size: 21px; font-style: normal; text-align: center; }
.animal-switch span { display: grid; min-width: 0; gap: 2px; }
.animal-switch b { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.animal-switch small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--knowledge-muted);
  font-size: 8px;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
@keyframes specimen-breathe { to { border-color: rgb(116 208 255 / 40%); box-shadow: inset 0 0 18px rgb(57 164 217 / 8%); } }
@keyframes specimen-float { to { transform: translateY(-3px) rotate(1.5deg); } }
.tab-copy { min-height: 82px; margin: 14px 0 0; color: var(--knowledge-body); font-size: 12px; line-height: 1.8; }
.reopen { position: absolute; z-index: 6; top: 18px; right: 18px; padding: 9px 12px; border-radius: 10px; color: white; cursor: pointer; }
.cinematic-note { position: absolute; right: 16px; bottom: 12px; z-index: 4; color: rgb(224 241 251 / 72%); font-size: 9px; text-shadow: 0 1px 4px #07131c; }
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
  .plate, .cloud, .mountain-guides, .zone-label, .key-label, .focus-pulse, .specimen, .specimen-icon { transition: none; animation: none; }
}
</style>
