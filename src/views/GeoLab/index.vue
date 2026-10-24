<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGeoSceneStore } from '@/stores/geoScene'
import GlobeView from './GlobeView.vue'
import FlatSchematic from './FlatSchematic.vue'
import LessonPanel from './LessonPanel.vue'
import ControlsBar from './ControlsBar.vue'

const store = useGeoSceneStore()
const router = useRouter()
const route = useRoute()

const tutorialId = computed(() => {
  const id = route.params.tutorialId
  return typeof id === 'string' && id ? id : 'atmosphere-belts-winds'
})

/** 是否气压带风带完整实验课（有课步面板） */
const isAtmosphereLab = computed(() => tutorialId.value === 'atmosphere-belts-winds')

function applyBinding() {
  store.bindTutorial(tutorialId.value)
  if (isAtmosphereLab.value) store.applyStepState()
}

onMounted(() => {
  applyBinding()
})

watch(tutorialId, () => applyBinding())

onUnmounted(() => {
  store.stop()
  store.clearCityWeather()
})
</script>

<template>
  <div class="geo-lab">
    <!-- 月份/交角等季节控件：气压带课完整栏；其它课只要开了直射/晨昏/气压也给出精简栏 -->
    <ControlsBar :compact="!isAtmosphereLab" />
    <div class="stage" :class="{ 'globe-only': !isAtmosphereLab }">
      <div class="view">
        <h3>3D 地球 · 知识点已按本课知识点激活</h3>
        <GlobeView />
      </div>
      <template v-if="isAtmosphereLab">
        <div class="view">
          <h3>扁平示意</h3>
          <FlatSchematic />
        </div>
        <LessonPanel />
      </template>
      <aside v-else class="bind-panel">
        <h3>本课地球图层</h3>
        <p class="desc">
          已根据教材知识点自动打开下方 Tag。可手动增删；后续接完整实验后会补充课步讲解。
        </p>
        <ul>
          <li v-for="tag in store.layerTags" :key="tag.id">
            <span :class="{ on: store.layers[tag.id] }">{{ tag.label }}</span>
            <small>{{ tag.description }}</small>
          </li>
        </ul>
        <el-button type="primary" @click="router.push({ name: 'tutorial', params: { tutorialId } })">
          返回教程说明
        </el-button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.geo-lab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-app);
}
.stage {
  flex: 1;
  display: flex;
  min-height: 0;
}
.stage.globe-only .view {
  flex: 1.4;
}
.view {
  flex: 1;
  min-width: 0;
  padding: 10px 10px 12px;
  display: flex;
  flex-direction: column;
}
.view h3 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-500);
  font-weight: 600;
}
.bind-panel {
  width: 280px;
  flex-shrink: 0;
  padding: 12px 14px;
  border-left: 1px solid var(--border);
  background: var(--bg-surface);
  overflow: auto;
}
.bind-panel h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.bind-panel .desc {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-500);
}
.bind-panel ul {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: grid;
  gap: 8px;
}
.bind-panel li {
  display: grid;
  gap: 2px;
}
.bind-panel li span {
  font-size: 13px;
  color: var(--text-400);
}
.bind-panel li span.on {
  color: var(--primary-mid);
  font-weight: 600;
}
.bind-panel li small {
  font-size: 11px;
  color: var(--text-400);
  line-height: 1.4;
}
</style>
