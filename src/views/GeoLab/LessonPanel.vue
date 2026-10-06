<script setup lang="ts">
import { computed } from 'vue'
import { useGeoSceneStore } from '@/stores/geoScene'

const store = useGeoSceneStore()
const quiz = computed(() => store.step.quiz)
const correctId = computed(() => quiz.value?.options.find((o) => o.correct)?.id)
const isCorrect = computed(() => quiz.value && store.quizChoice === correctId.value)

function submit() {
  if (!store.quizChoice) return
  store.quizRevealed = true
}

function showAnswer() {
  if (!quiz.value) return
  store.quizChoice = correctId.value ?? null
  store.quizRevealed = true
}
</script>

<template>
  <aside class="panel">
    <header>
      <p class="kicker">{{ store.pack.subject }} · {{ store.stepIndex + 1 }}/{{ store.pack.steps.length }}</p>
      <h2>{{ store.step.title }}</h2>
    </header>

    <ol class="steps">
      <li
        v-for="(s, i) in store.pack.steps"
        :key="s.id"
        :class="{ active: i === store.stepIndex }"
        @click="store.go(i)"
      >
        {{ s.title }}
      </li>
    </ol>

    <p class="subtitle">{{ store.step.subtitle }}</p>
    <p class="see"><b>3D：</b>{{ store.step.see3d }}</p>
    <p class="see"><b>扁平：</b>{{ store.step.see2d }}</p>

    <div class="transport">
      <el-button size="small" @click="store.prev" :disabled="store.stepIndex === 0">上一步</el-button>
      <el-button v-if="!store.playing" size="small" type="primary" @click="store.play">播放讲解</el-button>
      <el-button v-else size="small" type="warning" @click="store.stop">暂停</el-button>
      <el-button size="small" @click="store.next" :disabled="store.stepIndex >= store.pack.steps.length - 1">下一步</el-button>
    </div>

    <section v-if="quiz" class="quiz">
      <h3>探究</h3>
      <p>{{ quiz.prompt }}</p>
      <el-radio-group v-model="store.quizChoice" class="opts">
        <el-radio v-for="o in quiz.options" :key="o.id" :value="o.id">{{ o.text }}</el-radio>
      </el-radio-group>
      <div class="quiz-actions">
        <el-button size="small" type="primary" @click="submit">提交</el-button>
        <el-button v-if="store.mode === 'teach'" size="small" @click="showAnswer">显示答案</el-button>
      </div>
      <p v-if="store.quizRevealed" class="explain" :class="{ ok: isCorrect, bad: !isCorrect }">
        {{ isCorrect ? '判断正确。' : '再对照动画想一想。' }}
        {{ quiz.explain }}
      </p>
    </section>

    <p class="disclaimer">{{ store.pack.disclaimer }}</p>
    <ul class="refs">
      <li v-for="r in store.pack.references" :key="r">{{ r }}</li>
    </ul>
  </aside>
</template>

<style scoped>
.panel {
  width: 320px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  padding: 16px 16px 20px;
  overflow: auto;
}
.kicker {
  margin: 0;
  font-size: 11px;
  color: var(--text-400);
  letter-spacing: 0.04em;
}
h2 {
  margin: 4px 0 12px;
  font-size: 16px;
  color: var(--text-900);
}
.steps {
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
}
.steps li {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-500);
  cursor: pointer;
}
.steps li.active {
  background: var(--primary-light);
  color: var(--primary-mid);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--primary);
}
.subtitle {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-700);
}
.see {
  font-size: 12px;
  color: var(--text-500);
  margin: 6px 0;
}
.transport {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 16px;
}
.quiz {
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.quiz h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
}
.quiz-actions {
  display: flex;
  gap: 8px;
}
.explain {
  font-size: 12px;
  line-height: 1.55;
  margin-top: 8px;
}
.explain.ok { color: var(--geo-ok); }
.explain.bad { color: var(--geo-warn); }
.disclaimer {
  margin-top: 18px;
  font-size: 11px;
  color: var(--text-400);
  line-height: 1.5;
}
.refs {
  margin: 6px 0 0;
  padding-left: 16px;
  font-size: 11px;
  color: var(--text-400);
}
</style>
