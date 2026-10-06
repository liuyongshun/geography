<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import curriculumJson from '@content/curriculum/xiangjiao.json'
import {
  KIND_LABEL,
  countTutorials,
  findTutorial,
  type Curriculum,
} from '@/curriculum/types'
import { getDemo } from '@/curriculum/demoRegistry'

const curriculum = curriculumJson as Curriculum
const route = useRoute()
const router = useRouter()

const tutorialId = computed(() => String(route.params.tutorialId || ''))
const hit = computed(() => findTutorial(curriculum, tutorialId.value))
const demo = computed(() => getDemo(tutorialId.value))

const bookStats = computed(() => {
  if (!hit.value) return null
  return countTutorials(hit.value.book)
})

function enterLab() {
  router.push({ name: 'lab', params: { tutorialId: tutorialId.value } })
}

function enterDemo() {
  router.push({ name: 'demo', params: { tutorialId: tutorialId.value } })
}

function previewOnGlobe() {
  router.push({ name: 'lab', params: { tutorialId: tutorialId.value } })
}
</script>

<template>
  <div v-if="hit" class="page">
    <p class="crumb">
      {{ hit.grade.label }} · {{ hit.book.code }} · {{ hit.chapter.no }}{{ hit.chapter.title }}
    </p>
    <h1>{{ hit.tutorial.title }}</h1>
    <p class="sec">对应课文：{{ hit.section.title }}</p>

    <div class="chips">
      <span class="chip">{{ KIND_LABEL[hit.tutorial.kind] }}</span>
      <span class="chip">约 {{ hit.tutorial.minutes }} 分钟</span>
      <span class="chip" :class="hit.tutorial.status">
        {{ hit.tutorial.status === 'ready' ? '已上线' : '筹备中' }}
      </span>
    </div>

    <section class="card">
      <h2>课本信息</h2>
      <dl>
        <div><dt>教材版本</dt><dd>{{ curriculum.edition }}</dd></div>
        <div><dt>出版社</dt><dd>{{ curriculum.publisher }}</dd></div>
        <div><dt>册别</dt><dd>{{ hit.book.code }} · {{ hit.book.title }}</dd></div>
        <div><dt>章节</dt><dd>{{ hit.chapter.no }} {{ hit.chapter.title }} / {{ hit.section.title }}</dd></div>
        <div><dt>课标依据</dt><dd>{{ curriculum.standard }}</dd></div>
        <div v-if="bookStats"><dt>本册进度</dt><dd>可学 {{ bookStats.ready }} / 共 {{ bookStats.total }} 个教程</dd></div>
      </dl>
    </section>

    <section class="card">
      <h2>学习目标</h2>
      <ul>
        <li v-for="o in hit.tutorial.objectives" :key="o">{{ o }}</li>
      </ul>
    </section>

    <section class="card">
      <h2>教程说明</h2>
      <p v-if="demo">
        本课走「演示课」形态：左侧课步，右侧图形交互（少文案）。
        {{ demo.status === 'ready' ? '演示已可进入。' : '演示画布暂缓，先显示占位并可地球预览。' }}
      </p>
      <p v-else-if="hit.tutorial.status === 'ready'">
        本课已提供双视图交互实验：左侧 3D 环流质点与气压色带，右侧课本式扁平示意。可拖动月份、开关地转偏向与海陆热力，并按课步播放讲解。
      </p>
      <p v-else>
        完整课步仍在筹备。可先「在地球上预览」：系统会按本章知识点自动打开对应图层。
      </p>
      <div class="actions">
        <el-button
          v-if="demo"
          type="primary"
          size="large"
          @click="enterDemo"
        >
          {{ demo.status === 'ready' ? '进入图形演示' : '打开演示（占位）' }}
        </el-button>
        <el-button
          v-else-if="hit.tutorial.status === 'ready'"
          type="primary"
          size="large"
          @click="enterLab"
        >
          进入交互实验
        </el-button>
        <el-button
          v-else
          type="primary"
          size="large"
          @click="previewOnGlobe"
        >
          在地球上预览
        </el-button>
        <el-button
          v-if="demo"
          size="large"
          @click="previewOnGlobe"
        >
          地球预览
        </el-button>
      </div>
    </section>
  </div>
  <div v-else class="page empty">
    <h1>未找到教程</h1>
    <p>请从左侧导航选择年级与章节。</p>
  </div>
</template>

<style scoped>
.page {
  max-width: 760px;
  padding: 24px 28px 48px;
}
.crumb {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-400);
}
h1 {
  margin: 0 0 6px;
  font-size: 26px;
  line-height: 1.3;
}
.sec {
  margin: 0 0 14px;
  color: var(--text-500);
  font-size: 14px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}
.chip {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-700);
  background: var(--bg-subtle);
}
.chip.ready {
  color: var(--primary-mid);
  border-color: var(--primary);
  background: var(--primary-light);
}
.chip.planned {
  color: var(--text-400);
}
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 16px 18px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-sm);
}
.card h2 {
  margin: 0 0 10px;
  font-size: 15px;
  color: var(--primary-mid);
}
dl {
  margin: 0;
  display: grid;
  gap: 8px;
}
dl > div {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 8px;
  font-size: 13px;
}
dt {
  color: var(--text-400);
}
dd {
  margin: 0;
  color: var(--text-700);
  line-height: 1.5;
}
ul {
  margin: 0;
  padding-left: 18px;
  color: var(--text-700);
  font-size: 14px;
  line-height: 1.7;
}
.card > p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-700);
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.empty {
  color: var(--text-500);
}
</style>
