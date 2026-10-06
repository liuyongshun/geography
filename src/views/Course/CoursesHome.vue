<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import curriculumJson from '@content/curriculum/xiangjiao.json'
import { countTutorials, type Curriculum, type Tutorial } from '@/curriculum/types'

const curriculum = curriculumJson as Curriculum
const router = useRouter()

const readyList = computed(() => {
  const list: Array<{ grade: string; book: string; section: string; tutorial: Tutorial }> = []
  for (const grade of curriculum.grades) {
    for (const book of grade.books) {
      for (const chapter of book.chapters) {
        for (const section of chapter.sections) {
          for (const tutorial of section.tutorials) {
            if (tutorial.status === 'ready') {
              list.push({
                grade: grade.label,
                book: book.code,
                section: `${chapter.no}${chapter.title} · ${section.title}`,
                tutorial,
              })
            }
          }
        }
      }
    }
  }
  return list
})

function open(id: string) {
  router.push({ name: 'tutorial', params: { tutorialId: id } })
}
</script>

<template>
  <div class="page">
    <header class="hero">
      <p class="eyebrow">{{ curriculum.edition }} · {{ curriculum.publisher }}</p>
      <h1>按年级跟随课本学地理过程</h1>
      <p class="lead">
        左侧直接浏览高一 / 高二 / 高三课本目录。点教程即可学习：已上线课进入双视图实验，筹备中的课先看课本信息与学习目标。
      </p>
      <p class="std">依据：{{ curriculum.standard }}</p>
    </header>

    <section class="ready">
      <h2>已上线教程</h2>
      <div class="cards">
        <article v-for="item in readyList" :key="item.tutorial.id" @click="open(item.tutorial.id)">
          <p class="path">{{ item.grade }} · {{ item.book }}</p>
          <h3>{{ item.tutorial.title }}</h3>
          <p class="sec">{{ item.section }}</p>
          <button type="button">查看并进入实验 →</button>
        </article>
      </div>
    </section>

    <section class="grades">
      <h2>年级与课本</h2>
      <div class="grid">
        <article v-for="g in curriculum.grades" :key="g.id">
          <h3>{{ g.label }}</h3>
          <p>{{ g.summary }}</p>
          <ul>
            <li v-for="b in g.books" :key="b.id">
              <strong>{{ b.code }}</strong>
              {{ b.title }}
              <span>{{ countTutorials(b).ready }}/{{ countTutorials(b).total }}</span>
            </li>
          </ul>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  padding: 24px 28px 56px;
  max-width: 980px;
}
.hero {
  margin-bottom: 28px;
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--primary-mid);
  font-size: 12px;
  letter-spacing: 0.04em;
}
h1 {
  margin: 0 0 10px;
  font-size: 28px;
  line-height: 1.3;
}
.lead {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-700);
  max-width: 720px;
}
.std {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-400);
}
h2 {
  margin: 0 0 12px;
  font-size: 16px;
  color: var(--primary-mid);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.ready article {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 14px 16px;
  cursor: pointer;
  box-shadow: var(--glow-teal);
}
.path {
  margin: 0;
  font-size: 11px;
  color: var(--text-400);
}
.ready h3 {
  margin: 6px 0;
  font-size: 16px;
}
.sec {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--text-500);
  line-height: 1.5;
}
.ready button {
  border: 0;
  background: transparent;
  color: var(--primary-mid);
  padding: 0;
  cursor: pointer;
  font-size: 13px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.grades article {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 14px;
}
.grades h3 {
  margin: 0 0 8px;
  font-size: 18px;
}
.grades p {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-500);
  line-height: 1.5;
  min-height: 36px;
}
.grades ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.grades li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 8px;
  font-size: 12px;
  color: var(--text-700);
  padding: 6px 0;
  border-top: 1px dashed var(--border);
}
.grades strong {
  grid-column: 1 / -1;
  color: var(--primary-mid);
  font-size: 11px;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
