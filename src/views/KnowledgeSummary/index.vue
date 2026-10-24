<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import curriculumJson from '@content/curriculum/xiangjiao.json'
import type { Curriculum } from '@/curriculum/types'
import {
  bookKnowledgeTree,
  chapterKnowledgeTree,
  gradeKnowledgeTree,
  knowledgeStats,
  type KnowledgeNode,
  type KnowledgeNodeKind,
} from '@/curriculum/knowledgeMap'

type Scope = 'grade' | 'book' | 'chapter'
type Detail = 'outline' | 'full'

const curriculum = curriculumJson as Curriculum
const scope = ref<Scope>('chapter')
const detail = ref<Detail>('full')
const gradeId = ref(curriculum.grades[1]?.id ?? curriculum.grades[0]?.id ?? '')
const bookId = ref('')
const chapterId = ref('')
const chartRef = ref<HTMLDivElement | null>(null)

const grade = computed(() => curriculum.grades.find((item) => item.id === gradeId.value) ?? curriculum.grades[0]!)
const books = computed(() => grade.value.books)
const book = computed(() => books.value.find((item) => item.id === bookId.value) ?? books.value[0]!)
const chapters = computed(() => book.value.chapters)
const chapter = computed(() => chapters.value.find((item) => item.id === chapterId.value) ?? chapters.value[0]!)

watch(
  grade,
  (value) => {
    if (!value.books.some((item) => item.id === bookId.value)) bookId.value = value.books[0]?.id ?? ''
  },
  { immediate: true },
)

watch(
  book,
  (value) => {
    if (!value.chapters.some((item) => item.id === chapterId.value)) chapterId.value = value.chapters[0]?.id ?? ''
  },
  { immediate: true },
)

const tree = computed<KnowledgeNode>(() => {
  if (scope.value === 'grade') return gradeKnowledgeTree(grade.value)
  if (scope.value === 'book') return bookKnowledgeTree(book.value)
  return chapterKnowledgeTree(chapter.value)
})

const stats = computed(() => knowledgeStats(tree.value))
const scopePath = computed(() => {
  if (scope.value === 'grade') return grade.value.label
  if (scope.value === 'book') return `${grade.value.label} / ${book.value.code}`
  return `${grade.value.label} / ${book.value.code} / ${chapter.value.no}`
})

const NODE_COLOR: Record<KnowledgeNodeKind, string> = {
  grade: '#ffd88a',
  book: '#8fd0ff',
  chapter: '#63b8ff',
  section: '#9ec9e8',
  tutorial: '#d5e2ec',
  point: '#ffffff',
}

const NODE_META: Record<KnowledgeNodeKind, { tag: string; text: string; background: string; border: string; badge: string; width: number }> = {
  grade: { tag: '年级', text: '#fff4d0', background: 'rgba(84, 61, 24, .94)', border: '#e8b85b', badge: '#f2c66d', width: 150 },
  book: { tag: '课本', text: '#e7f6ff', background: 'rgba(20, 61, 88, .96)', border: '#5fadd8', badge: '#7fc9ef', width: 170 },
  chapter: { tag: '章节', text: '#ecf8ff', background: 'rgba(17, 66, 101, .96)', border: '#63b8ff', badge: '#89d0ff', width: 176 },
  section: { tag: '小节', text: '#e4f1f8', background: 'rgba(18, 45, 65, .96)', border: '#4f7d99', badge: '#83b6d2', width: 124 },
  tutorial: { tag: '主题', text: '#e8f0f5', background: 'rgba(19, 36, 52, .96)', border: '#47667b', badge: '#9ec9e8', width: 128 },
  point: { tag: '要点', text: '#f2f7fa', background: 'rgba(11, 27, 41, .96)', border: '#2f536b', badge: '#69b9ed', width: 200 },
}

function nodeLabel(node: KnowledgeNode) {
  const meta = NODE_META[node.kind]
  const compact = node.kind === 'point'
  return {
    color: meta.text,
    fontSize: compact ? 11 : 12,
    fontWeight: node.kind === 'chapter' || node.kind === 'grade' || node.kind === 'book' ? 700 : 600,
    lineHeight: compact ? 17 : 18,
    width: meta.width,
    overflow: compact ? 'break' : 'truncate',
    backgroundColor: meta.background,
    borderColor: meta.border,
    borderWidth: 1,
    borderRadius: compact ? 7 : 9,
    padding: compact ? [6, 9] : [8, 10],
    shadowBlur: node.kind === 'chapter' ? 14 : 7,
    shadowColor: node.kind === 'chapter' ? 'rgba(52, 158, 229, .25)' : 'rgba(0, 0, 0, .2)',
    formatter: `{badge|${meta.tag}}  {name|${node.name}}`,
    rich: {
      badge: {
        color: '#071421',
        backgroundColor: meta.badge,
        borderRadius: 4,
        padding: [2, 5],
        fontSize: 9,
        fontWeight: 700,
      },
      name: {
        color: meta.text,
        fontSize: compact ? 11 : 12,
        fontWeight: node.kind === 'chapter' || node.kind === 'grade' || node.kind === 'book' ? 700 : 600,
      },
    },
  }
}

function chartNode(node: KnowledgeNode): Record<string, unknown> {
  return {
    name: node.name,
    value: node.note ?? '',
    symbolSize: node.kind === 'point' ? 7 : node.kind === 'chapter' ? 12 : 9,
    itemStyle: {
      color: NODE_COLOR[node.kind],
      borderColor: NODE_META[node.kind].border,
      borderWidth: 2,
    },
    label: nodeLabel(node),
    lineStyle: { color: node.kind === 'point' ? '#34546a' : '#47748f', width: node.kind === 'point' ? 1.2 : 1.6, opacity: 0.86 },
    children: node.children?.map(chartNode),
  }
}

let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null
const zoomPercent = ref(100)
let currentZoom = 1
let targetZoom = 1
let zoomFrame: number | null = null
let zoomOriginX = 0
let zoomOriginY = 0
const WHEEL_ZOOM_SENSITIVITY = 0.0019

function stopZoomAnimation() {
  if (zoomFrame !== null) cancelAnimationFrame(zoomFrame)
  zoomFrame = null
}

function animateZoom() {
  if (!chart || !chartRef.value) {
    zoomFrame = null
    return
  }
  const ratio = targetZoom / currentZoom
  if (Math.abs(ratio - 1) < 0.0008) {
    currentZoom = targetZoom
    zoomPercent.value = Math.round(currentZoom * 100)
    zoomFrame = null
    return
  }
  // 阻尼追随目标倍率，连续滚动时不会出现离散跳变。
  const appliedFactor = 1 + (ratio - 1) * 0.24
  chart.dispatchAction({
    type: 'treeRoam',
    seriesId: 'knowledge-tree',
    zoom: appliedFactor,
    originX: zoomOriginX,
    originY: zoomOriginY,
  })
  currentZoom *= appliedFactor
  zoomPercent.value = Math.round(currentZoom * 100)
  zoomFrame = requestAnimationFrame(animateZoom)
}

function zoomBy(factor: number, originX?: number, originY?: number) {
  if (!chart || !chartRef.value) return
  const rect = chartRef.value.getBoundingClientRect()
  targetZoom = Math.min(1.75, Math.max(0.7, targetZoom * factor))
  zoomOriginX = originX ?? rect.width / 2
  zoomOriginY = originY ?? rect.height / 2
  if (zoomFrame === null) zoomFrame = requestAnimationFrame(animateZoom)
}

function resetView() {
  stopZoomAnimation()
  renderChart()
}

function handleChartWheel(event: WheelEvent) {
  event.preventDefault()
  const rect = chartRef.value?.getBoundingClientRect()
  if (!rect) return
  const normalizedDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY
  const restrainedDelta = Math.max(-120, Math.min(120, normalizedDelta))
  const factor = Math.exp(-restrainedDelta * WHEEL_ZOOM_SENSITIVITY)
  zoomBy(factor, event.clientX - rect.left, event.clientY - rect.top)
}

function renderChart() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value, undefined, { renderer: 'canvas' })
  const initialDepth = detail.value === 'full' ? 10 : scope.value === 'chapter' ? 2 : 1
  stopZoomAnimation()
  currentZoom = 1
  targetZoom = 1
  zoomPercent.value = 100
  chart.clear()
  chart.setOption({
    backgroundColor: 'transparent',
    animationDuration: 550,
    animationDurationUpdate: 420,
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: 'rgba(8, 24, 41, .96)',
      borderColor: '#31516a',
      textStyle: { color: '#d5e2ec', fontSize: 12 },
      formatter: (params: { name: string; value?: string }) => params.value
        ? `<b>${params.name}</b><br/><span style="color:#a9bdcc">${params.value}</span>`
        : params.name,
    },
    series: [
      {
        id: 'knowledge-tree',
        type: 'tree',
        data: [chartNode(tree.value)],
        top: 46,
        left: scope.value === 'grade' ? 204 : 192,
        bottom: 46,
        right: 230,
        orient: 'LR',
        roam: 'move',
        scaleLimit: { min: 0.7, max: 1.75 },
        nodeScaleRatio: 0.28,
        expandAndCollapse: true,
        initialTreeDepth: initialDepth,
        edgeShape: 'curve',
        edgeForkPosition: '54%',
        symbol: 'circle',
        label: {
          position: 'left',
          verticalAlign: 'middle',
          align: 'right',
          distance: 10,
        },
        leaves: {
          label: {
            position: 'right',
            align: 'left',
            distance: 10,
          },
        },
        emphasis: {
          focus: 'descendant',
          lineStyle: { color: '#63b8ff', width: 2 },
          itemStyle: { shadowBlur: 12, shadowColor: 'rgba(99, 184, 255, .72)' },
        },
      },
    ],
  })
}

watch([tree, detail], () => nextTick(renderChart), { deep: true })

onMounted(() => {
  renderChart()
  chartRef.value?.addEventListener('wheel', handleChartWheel, { passive: false })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  if (chartRef.value) resizeObserver.observe(chartRef.value)
})

onUnmounted(() => {
  stopZoomAnimation()
  chartRef.value?.removeEventListener('wheel', handleChartWheel)
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <main class="summary-page">
    <header class="summary-head">
      <div>
        <p class="eyebrow">知识收拢 · 自动生成</p>
        <h1>地理知识思维导图</h1>
        <p>直接读取教材目录与学习目标，按年级、课本或章节形成知识树。</p>
      </div>
      <div class="source-note">
        <span>当前范围</span>
        <strong>{{ scopePath }}</strong>
        <small>数据源：{{ curriculum.edition }}</small>
      </div>
    </header>

    <section class="filters" aria-label="知识总结范围">
      <div class="scope-tabs" role="tablist" aria-label="总结层级">
        <button type="button" role="tab" :aria-selected="scope === 'grade'" :class="{ active: scope === 'grade' }" @click="scope = 'grade'">按年级</button>
        <button type="button" role="tab" :aria-selected="scope === 'book'" :class="{ active: scope === 'book' }" @click="scope = 'book'">按课本</button>
        <button type="button" role="tab" :aria-selected="scope === 'chapter'" :class="{ active: scope === 'chapter' }" @click="scope = 'chapter'">按章节</button>
      </div>

      <label>
        <span>年级</span>
        <select v-model="gradeId">
          <option v-for="item in curriculum.grades" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
      </label>
      <label v-if="scope !== 'grade'">
        <span>课本</span>
        <select v-model="bookId">
          <option v-for="item in books" :key="item.id" :value="item.id">{{ item.code }} · {{ item.title }}</option>
        </select>
      </label>
      <label v-if="scope === 'chapter'">
        <span>章节</span>
        <select v-model="chapterId">
          <option v-for="item in chapters" :key="item.id" :value="item.id">{{ item.no }} · {{ item.title }}</option>
        </select>
      </label>
      <div class="detail-toggle">
        <button type="button" :class="{ active: detail === 'outline' }" @click="detail = 'outline'">主干</button>
        <button type="button" :class="{ active: detail === 'full' }" @click="detail = 'full'">完整知识点</button>
      </div>
    </section>

    <section class="summary-grid">
      <aside class="stats">
        <p class="scope-label">{{ tree.name }}</p>
        <h2>{{ tree.note ?? '知识结构总览' }}</h2>
        <div class="stat-grid">
          <p v-if="stats.books"><b>{{ stats.books }}</b><span>课本</span></p>
          <p><b>{{ stats.chapters }}</b><span>章节</span></p>
          <p><b>{{ stats.tutorials }}</b><span>主题</span></p>
          <p><b>{{ stats.points }}</b><span>知识点</span></p>
        </div>
        <div class="legend">
          <span><i class="chapter-dot" />章节主干</span>
          <span><i class="tutorial-dot" />学习主题</span>
          <span><i class="point-dot" />知识目标</span>
        </div>
        <p class="tip">轻滚缩放，拖动画布；右下角可精确调节或复位，单击节点展开或收起分支。</p>
      </aside>

      <div class="map-card">
        <div ref="chartRef" class="mind-map" role="img" :aria-label="`${tree.name}知识思维导图`" />
        <div class="map-controls" aria-label="思维导图缩放控制">
          <button type="button" aria-label="缩小思维导图" title="缩小" @click="zoomBy(0.88)">−</button>
          <button type="button" class="zoom-value" title="恢复初始视图" @click="resetView">{{ zoomPercent }}%</button>
          <button type="button" aria-label="放大思维导图" title="放大" @click="zoomBy(1.12)">＋</button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.summary-page {
  min-height: 100%;
  padding: 24px 28px 32px;
  color: var(--knowledge-body);
  background:
    radial-gradient(circle at 72% 8%, rgb(60 124 166 / 14%), transparent 32%),
    var(--bg-app);
}
.summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  max-width: 1280px;
  margin: 0 auto 18px;
}
.eyebrow { margin: 0 0 6px; color: var(--knowledge-active); font-size: 11px; letter-spacing: .08em; }
h1 { margin: 0; color: var(--knowledge-title); font-size: 26px; }
.summary-head > div > p:last-child { margin: 8px 0 0; color: var(--knowledge-muted); font-size: 13px; }
.source-note {
  display: grid;
  min-width: 220px;
  gap: 3px;
  padding: 10px 13px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgb(16 24 42 / 78%);
}
.source-note span, .source-note small { color: var(--knowledge-faint); font-size: 10px; }
.source-note strong { color: var(--knowledge-title); font-size: 12px; }
.filters {
  display: flex;
  align-items: end;
  gap: 10px;
  max-width: 1280px;
  margin: 0 auto 14px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-surface);
}
.scope-tabs, .detail-toggle { display: flex; gap: 3px; padding: 3px; border-radius: 8px; background: var(--bg-subtle); }
.scope-tabs button, .detail-toggle button {
  border: 0;
  border-radius: 6px;
  padding: 7px 11px;
  color: var(--knowledge-muted);
  background: transparent;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.scope-tabs button.active, .detail-toggle button.active { color: var(--knowledge-data); background: #256f9f; }
.filters label { display: grid; min-width: 130px; gap: 4px; }
.filters label:nth-of-type(2) { min-width: 220px; }
.filters label:nth-of-type(3) { min-width: 210px; }
.filters label span { color: var(--knowledge-faint); font-size: 9px; }
.filters select {
  min-height: 32px;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 0 28px 0 9px;
  color: var(--knowledge-body);
  background: #0c1626;
  font: inherit;
  font-size: 11px;
}
.detail-toggle { margin-left: auto; }
.summary-grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
  max-width: 1280px;
  height: min(700px, calc(100vh - 210px));
  min-height: 480px;
  margin: 0 auto;
}
.stats, .map-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: linear-gradient(145deg, rgb(16 30 49 / 96%), rgb(8 18 31 / 96%));
  box-shadow: 0 16px 36px rgb(0 0 0 / 20%);
}
.stats { padding: 16px; }
.scope-label { margin: 0 0 8px; color: var(--knowledge-active); font-size: 11px; }
.stats h2 { margin: 0 0 18px; color: var(--knowledge-title); font-size: 14px; line-height: 1.55; }
.stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
.stat-grid p { display: grid; gap: 2px; padding: 10px; border: 1px solid rgb(99 184 255 / 14%); border-radius: 9px; background: rgb(99 184 255 / 6%); }
.stat-grid b { color: var(--knowledge-data); font-size: 19px; }
.stat-grid span { color: var(--knowledge-muted); font-size: 10px; }
.legend { display: grid; gap: 9px; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border); }
.legend span { display: flex; align-items: center; gap: 8px; color: var(--knowledge-muted); font-size: 10px; }
.legend i { width: 8px; height: 8px; border-radius: 50%; }
.chapter-dot { background: var(--knowledge-active); }
.tutorial-dot { background: var(--knowledge-body); }
.point-dot { border: 1px solid var(--knowledge-active); background: var(--knowledge-data); }
.tip { margin: 18px 0 0; color: var(--knowledge-faint); font-size: 10px; line-height: 1.65; }
.map-card { position: relative; min-width: 0; overflow: hidden; }
.map-card::before {
  position: absolute;
  inset: 0;
  content: '';
  opacity: .12;
  background-image: radial-gradient(circle, #45627a 1px, transparent 1px);
  background-size: 22px 22px;
  pointer-events: none;
}
.map-card::after {
  position: absolute;
  inset: 0;
  content: '';
  background:
    radial-gradient(circle at 20% 42%, rgb(46 132 183 / 10%), transparent 28%),
    radial-gradient(circle at 82% 56%, rgb(43 102 141 / 8%), transparent 30%);
  pointer-events: none;
}
.mind-map { position: relative; width: 100%; height: 100%; }
.map-controls {
  position: absolute;
  z-index: 4;
  right: 14px;
  bottom: 14px;
  display: flex;
  overflow: hidden;
  border: 1px solid rgb(111 164 195 / 28%);
  border-radius: 10px;
  background: rgb(7 20 33 / 88%);
  box-shadow: 0 8px 24px rgb(0 0 0 / 22%);
  backdrop-filter: blur(10px);
}
.map-controls button {
  min-width: 34px;
  height: 32px;
  padding: 0 9px;
  border: 0;
  border-right: 1px solid rgb(111 164 195 / 18%);
  color: #c9e2ef;
  background: transparent;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
}
.map-controls button:last-child { border-right: 0; }
.map-controls button:hover { color: #fff; background: rgb(78 153 197 / 18%); }
.map-controls .zoom-value { min-width: 58px; color: #8ec8e8; font-size: 10px; font-weight: 700; }
@media (max-width: 980px) {
  .summary-head { flex-direction: column; gap: 12px; }
  .source-note { width: 100%; }
  .filters { flex-wrap: wrap; }
  .detail-toggle { margin-left: 0; }
  .summary-grid { grid-template-columns: 1fr; height: auto; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .map-card { height: 560px; overflow-x: auto; }
  .mind-map { min-width: 820px; }
}
</style>
