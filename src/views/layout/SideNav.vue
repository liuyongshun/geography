<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import curriculumJson from '@content/curriculum/xiangjiao.json'
import { findTutorial, firstTutorialInGrade, type Curriculum, type Tutorial } from '@/curriculum/types'
import { getDemo } from '@/curriculum/demoRegistry'
import UtilityMenu from './UtilityMenu.vue'

const curriculum = curriculumJson as Curriculum
const route = useRoute()
const router = useRouter()

const activeGradeId = ref<string | null>(curriculum.grades[0]?.id ?? null)
const openBooks = ref<string[]>([])
const collapsed = ref(false)
let collapsedBeforeLeaderboard = false
watch(() => route.name, (name, previous) => {
  if (name === 'leaderboard') {
    collapsedBeforeLeaderboard = collapsed.value
    collapsed.value = true
  } else if (previous === 'leaderboard') {
    collapsed.value = collapsedBeforeLeaderboard
  }
}, { immediate: true })

const activeGrade = computed(() => {
  const id = activeGradeId.value
  return curriculum.grades.find((g) => g.id === id) ?? curriculum.grades[0]
})

const currentTutorialId = computed(() => {
  const id = route.params.tutorialId
  return typeof id === 'string' ? id : null
})

/** 教材 ready，或 DemoLab 已实现，都算可学 */
function isTutorialReady(t: Tutorial): boolean {
  if (t.status === 'ready') return true
  return getDemo(t.id)?.status === 'ready'
}

watch(
  () => route.params.tutorialId,
  (id) => {
    if (typeof id !== 'string') return
    const hit = findTutorial(curriculum, id)
    if (!hit) return
    activeGradeId.value = hit.grade.id
    if (!openBooks.value.includes(hit.book.id)) openBooks.value = [...openBooks.value, hit.book.id]
  },
  { immediate: true },
)

function selectGrade(id: string) {
  activeGradeId.value = id
  const hit = firstTutorialInGrade(curriculum, id)
  if (!hit) return
  if (!openBooks.value.includes(hit.book.id)) {
    openBooks.value = [...openBooks.value, hit.book.id]
  }
  openTutorial(hit.tutorial.id)
}

function toggleBook(id: string) {
  openBooks.value = openBooks.value.includes(id)
    ? openBooks.value.filter((x) => x !== id)
    : [...openBooks.value, id]
}

function openTutorial(tutorialId: string) {
  const hit = findTutorial(curriculum, tutorialId)
  const demo = getDemo(tutorialId)
  // 演示课（含暂缓占位）→ DemoLab；已上线地球实验 → GeoLab；其余 → 教程说明
  if (demo) {
    router.push({ name: 'demo', params: { tutorialId } })
    return
  }
  if (hit?.tutorial.status === 'ready') {
    router.push({ name: 'lab', params: { tutorialId } })
    return
  }
  router.push({ name: 'tutorial', params: { tutorialId } })
}

function bookStats(bookId: string) {
  const book = activeGrade.value.books.find((b) => b.id === bookId)
  if (!book) return { ready: 0, total: 0 }
  let ready = 0
  let total = 0
  for (const chapter of book.chapters) {
    for (const section of chapter.sections) {
      for (const t of section.tutorials) {
        total += 1
        if (isTutorialReady(t)) ready += 1
      }
    }
  }
  return { ready, total }
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <aside class="nav" :class="{ collapsed }">
    <div class="brand">
      <div v-if="!collapsed" class="brand-copy">
        <p class="edition">{{ curriculum.edition }}</p>
        <p class="pub">{{ curriculum.publisher }}</p>
      </div>
      <div class="brand-actions">
        <UtilityMenu align="left" />
        <button
          type="button"
          class="collapse-btn"
          :aria-label="collapsed ? '展开主导航' : '收起主导航'"
          :title="collapsed ? '展开主导航' : '收起主导航'"
          @click="toggleCollapsed"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path :d="collapsed ? 'M7 4l6 6-6 6' : 'M13 4l-6 6 6 6'" />
          </svg>
        </button>
      </div>
    </div>

    <div class="grades">
      <button
        v-for="g in curriculum.grades"
        :key="g.id"
        type="button"
        class="grade"
        :class="{ on: g.id === activeGradeId }"
        :title="g.label"
        @click="selectGrade(g.id)"
      >
        <span v-if="!collapsed">{{ g.label }}</span>
        <span v-else>{{ g.label.replace('高', '') }}</span>
      </button>
    </div>
    <button
      type="button"
      class="leaderboard-entry"
      :class="{ on: route.name === 'leaderboard' }"
      title="珠峰攀登榜"
      @click="router.push({ name: 'leaderboard' })"
    >
      <span>▲</span><em v-if="!collapsed">珠峰攀登榜</em>
    </button>
    <div v-show="!collapsed" class="books">
      <section v-for="book in activeGrade.books" :key="book.id" class="book">
        <button type="button" class="book-hd" @click="toggleBook(book.id)">
          <span>
            <strong>{{ book.code }}</strong>
            <em>{{ book.title }}</em>
          </span>
          <span class="meta">
            {{ bookStats(book.id).ready }}/{{ bookStats(book.id).total }}
            <i>{{ openBooks.includes(book.id) ? '−' : '+' }}</i>
          </span>
        </button>
        <p class="focus">{{ book.focus }}</p>

        <div v-show="openBooks.includes(book.id)" class="chapters">
          <div v-for="ch in book.chapters" :key="ch.id" class="chapter">
            <h3>{{ ch.no }} {{ ch.title }}</h3>
            <div v-for="sec in ch.sections" :key="sec.id" class="section">
              <p class="sec-title">{{ sec.title }}</p>
              <button
                v-for="t in sec.tutorials"
                :key="`${sec.id}-${t.id}`"
                type="button"
                class="tut"
                :class="{ on: currentTutorialId === t.id, ready: isTutorialReady(t) }"
                @click="openTutorial(t.id)"
              >
                <span class="dot" />
                <span class="name">{{ t.title }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.nav {
  width: 236px;
  flex-shrink: 0;
  height: 100%;
  overflow: visible;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: width 0.22s ease;
}
.nav.collapsed {
  width: 62px;
}
.brand {
  position: relative;
  min-height: 58px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--border);
}
.brand-copy {
  padding-right: 58px;
}
.edition {
  margin: 0;
  font-size: 11px;
  color: var(--primary-mid);
  letter-spacing: 0.04em;
}
.brand h2 {
  margin: 4px 0 2px;
  font-size: 15px;
  color: var(--text-900);
}
.pub {
  margin: 0;
  font-size: 11px;
  color: var(--text-400);
}
.brand-actions {
  position: absolute;
  z-index: 20;
  top: 9px;
  right: 7px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.brand-actions :deep(.menu-trigger),
.collapse-btn {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}
.collapse-btn {
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border);
  color: var(--text-500);
  background: var(--bg-subtle);
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}
.collapse-btn:hover {
  color: var(--knowledge-active);
  border-color: rgba(99, 184, 255, 0.45);
  background: rgba(99, 184, 255, 0.09);
}
.collapse-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.collapsed .brand {
  min-height: 42px;
  padding-inline: 5px;
}
.collapsed .brand-actions {
  right: 5px;
}
.grades {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px 8px 0;
}
.leaderboard-entry {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 9px 8px 4px;
  padding: 8px 9px;
  border: 1px solid rgba(232, 184, 74, 0.35);
  border-radius: 9px;
  background: rgba(232, 184, 74, 0.08);
  color: #f0cf78;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
.leaderboard-entry:hover,.leaderboard-entry.on { background: rgba(232, 184, 74, 0.17); }
.leaderboard-entry em { font-style: normal; }
.collapsed .leaderboard-entry { justify-content: center; margin: 9px 9px 4px; padding: 9px 0; }
.collapsed .grades {
  grid-template-columns: 1fr;
  gap: 7px;
  padding: 8px 9px 0;
}
.grade {
  border: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-700);
  border-radius: 8px;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.grade.on {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary-mid);
  box-shadow: var(--glow-teal);
}
.collapsed .grade {
  height: 38px;
  padding: 0;
  font-size: 12px;
  border-radius: 9px;
}
.books {
  padding: 4px 6px 12px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.book {
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-subtle);
  overflow: hidden;
}
.book-hd {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text-900);
  padding: 8px 8px 2px;
  cursor: pointer;
}
.book-hd strong {
  display: block;
  font-size: 12px;
  color: var(--primary-mid);
}
.book-hd em {
  display: block;
  font-style: normal;
  font-size: 13px;
  font-weight: 650;
  margin-top: 2px;
}
.meta {
  font-size: 11px;
  color: var(--text-400);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}
.meta i {
  font-style: normal;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.focus {
  margin: 0 10px 8px;
  font-size: 11px;
  color: var(--text-500);
  line-height: 1.45;
}
.chapters {
  border-top: 1px solid var(--border);
  padding: 6px 6px 8px;
}
.chapter h3 {
  margin: 8px 6px 4px;
  font-size: 12px;
  color: var(--text-700);
  font-weight: 650;
}
.sec-title {
  margin: 6px 6px 4px;
  font-size: 11px;
  color: var(--text-400);
}
.tut {
  width: 100%;
  display: grid;
  grid-template-columns: 8px 1fr;
  gap: 6px;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--text-700);
  text-align: left;
  padding: 6px 6px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
}
.tut:hover {
  background: rgba(74, 163, 217, 0.1);
}
.tut.on {
  background: var(--primary-light);
  color: var(--primary-mid);
}
.tut .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-400);
}
.tut.ready .dot {
  background: var(--primary-mid);
  box-shadow: 0 0 8px rgba(74, 163, 217, 0.45);
}
.name {
  font-size: 12px;
  line-height: 1.35;
}
</style>
