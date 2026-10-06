<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import curriculumJson from '@content/curriculum/xiangjiao.json'
import { findTutorial, type Curriculum, type Tutorial } from '@/curriculum/types'
import { getDemo } from '@/curriculum/demoRegistry'

const curriculum = curriculumJson as Curriculum
const route = useRoute()
const router = useRouter()

const activeGradeId = ref(curriculum.grades[1]?.id ?? curriculum.grades[0].id)
const openBooks = ref<string[]>(['xx1'])

const activeGrade = computed(
  () => curriculum.grades.find((g) => g.id === activeGradeId.value) ?? curriculum.grades[0],
)

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
    for (const grade of curriculum.grades) {
      for (const book of grade.books) {
        for (const chapter of book.chapters) {
          for (const section of chapter.sections) {
            if (section.tutorials.some((t) => t.id === id)) {
              activeGradeId.value = grade.id
              if (!openBooks.value.includes(book.id)) openBooks.value = [...openBooks.value, book.id]
              return
            }
          }
        }
      }
    }
  },
  { immediate: true },
)

function selectGrade(id: string) {
  activeGradeId.value = id
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
</script>

<template>
  <aside class="nav">
    <div class="brand">
      <p class="edition">{{ curriculum.edition }}</p>
      <h2>地理过程教程</h2>
      <p class="pub">{{ curriculum.publisher }}</p>
    </div>

    <div class="grades">
      <button
        v-for="g in curriculum.grades"
        :key="g.id"
        type="button"
        class="grade"
        :class="{ on: g.id === activeGradeId }"
        @click="selectGrade(g.id)"
      >
        {{ g.label }}
      </button>
    </div>
    <p class="grade-sum">{{ activeGrade.summary }}</p>

    <div class="books">
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
                <span class="tag">{{ isTutorialReady(t) ? '可学' : '筹备' }}</span>
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
  width: 292px;
  flex-shrink: 0;
  height: 100%;
  overflow: auto;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.brand {
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--border);
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
.grades {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 10px 12px 0;
}
.grade {
  border: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-700);
  border-radius: 8px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.grade.on {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary-mid);
  box-shadow: var(--glow-teal);
}
.grade-sum {
  margin: 8px 12px 4px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-400);
}
.books {
  padding: 6px 8px 16px;
  flex: 1;
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
  padding: 10px 10px 4px;
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
  grid-template-columns: 10px 1fr auto;
  gap: 8px;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--text-700);
  text-align: left;
  padding: 7px 8px;
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
.tag {
  font-size: 10px;
  color: var(--text-400);
}
.tut.ready .tag {
  color: var(--primary);
}
</style>
