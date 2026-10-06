<script setup lang="ts">
import { computed, ref, watch, defineAsyncComponent, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import curriculumJson from '@content/curriculum/xiangjiao.json'
import { findTutorial, type Curriculum } from '@/curriculum/types'
import {
  ENGINE_LABEL,
  getDemo,
} from '@/curriculum/demoRegistry'
import DemoPlaceholder from './DemoPlaceholder.vue'

const curriculum = curriculumJson as Curriculum
const route = useRoute()
const router = useRouter()

const tutorialId = computed(() => String(route.params.tutorialId || ''))
const hit = computed(() => findTutorial(curriculum, tutorialId.value))
const demo = computed(() => getDemo(tutorialId.value))

const stepId = ref('')
watch(
  demo,
  (d) => {
    stepId.value = d?.steps[0]?.id ?? ''
  },
  { immediate: true },
)

const canvas = computed(() => {
  const d = demo.value
  if (!d || d.status !== 'ready' || !d.load) return null
  return defineAsyncComponent(d.load) as Component
})

function goGlobe() {
  router.push({ name: 'lab', params: { tutorialId: tutorialId.value } })
}
</script>

<template>
  <div class="demo-lab">
    <header class="top">
      <div class="titles" v-if="hit && demo">
        <h1>{{ demo.title }}</h1>
        <p class="path">
          {{ hit.grade.label }} · {{ hit.book.code }} ·
          {{ hit.chapter.no }}{{ hit.chapter.title }}
          <span class="eng">· {{ ENGINE_LABEL[demo.engine] }}</span>
        </p>
      </div>
      <el-button v-if="demo" size="small" @click="goGlobe">地球预览</el-button>
    </header>

    <div v-if="demo" class="body">
      <aside class="side">
        <p class="side-label">课步</p>
        <nav class="steps">
          <button
            v-for="s in demo.steps"
            :key="s.id"
            type="button"
            class="step"
            :class="{ on: stepId === s.id }"
            @click="stepId = s.id"
          >
            {{ s.title }}
          </button>
        </nav>
      </aside>

      <main class="stage">
        <component
          :is="canvas"
          v-if="canvas"
          :step-id="stepId"
          :demo="demo"
        />
        <DemoPlaceholder
          v-else
          :title="demo.title"
          :engine="demo.engine"
        >
          <el-button size="small" type="primary" plain @click="goGlobe">
            在地球上预览
          </el-button>
        </DemoPlaceholder>
      </main>
    </div>

    <div v-else class="missing">
      <p>未登记演示：{{ tutorialId }}</p>
      <p>请从左侧目录选择课时。</p>
    </div>
  </div>
</template>

<style scoped>
.demo-lab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-app);
}
.top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.titles {
  flex: 1;
  min-width: 0;
}
.titles h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-700);
}
.path {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-400);
}
.eng {
  color: var(--primary-mid);
}
.body {
  flex: 1;
  display: grid;
  grid-template-columns: 100px 1fr;
  min-height: 0;
}
.side {
  border-right: 1px solid var(--border);
  background: var(--bg-surface);
  padding: 8px 4px;
  overflow: auto;
}
.side-label {
  margin: 0 4px 6px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-400);
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.step {
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-500);
  font-size: 11px;
  line-height: 1.35;
  padding: 6px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.step:hover {
  color: var(--text-700);
  background: var(--bg-subtle);
}
.step.on {
  color: var(--primary-mid);
  border-color: rgba(64, 160, 180, 0.35);
  background: rgba(64, 160, 180, 0.1);
}
.stage {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.missing {
  flex: 1;
  display: grid;
  place-content: center;
  gap: 12px;
  color: var(--text-500);
  text-align: center;
}

@media (max-width: 720px) {
  .body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .side {
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .steps {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
