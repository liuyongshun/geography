<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import sunUrl from '@meteocons/svg/line/clear-day.svg?url'
import { useGeoSceneStore } from '@/stores/geoScene'
import { monthLabel } from '@/engine/atmosphere'

const props = withDefaults(
  defineProps<{
    /** 非气压带课时只保留月份 + 黄赤交角 */
    compact?: boolean
  }>(),
  { compact: false },
)

const store = useGeoSceneStore()
const { month, axialTilt, coriolis, landSea, sectioned, mode } = storeToRefs(store)

/** 精简模式：月份/交角始终可调（无课步锁） */
const monthEnabled = computed(() => (props.compact ? true : store.can('month')))
const tiltEnabled = computed(() => (props.compact ? true : store.can('axialTilt')))

function onMonth(v: number | number[]) {
  // 精简模式直接写，避免被课步 allowedInteractions 拦住
  if (props.compact) {
    month.value = Number(v)
    return
  }
  store.setMonth(Number(v))
}

async function toggleFullscreen() {
  const el = document.querySelector('.geo-lab')
  if (!el) return
  if (!document.fullscreenElement) await el.requestFullscreen()
  else await document.exitFullscreen()
}
</script>

<template>
  <div class="bar" :class="{ compact }">
    <div v-if="!compact" class="modes">
      <el-radio-group
        :model-value="mode"
        size="small"
        @change="(v: string | number | boolean) => store.setMode(v as 'teach' | 'student')"
      >
        <el-radio-button value="teach">授课</el-radio-button>
        <el-radio-button value="student">学生探究</el-radio-button>
      </el-radio-group>
    </div>

    <div class="ctrl" :class="{ locked: !monthEnabled }">
      <img :src="sunUrl" alt="" class="sun-icon" width="22" height="22" />
      <span>直射点 / 月份</span>
      <el-slider
        :model-value="month"
        :min="1"
        :max="12"
        :step="0.1"
        :disabled="!monthEnabled"
        @update:model-value="onMonth"
      />
      <span class="val">
        {{ monthLabel(month) }} · {{ store.subsolar.toFixed(1) }}°
        <em v-if="!axialTilt" class="tilt-off">（交角已关）</em>
      </span>
    </div>

    <div class="toggles">
      <el-switch
        v-model="axialTilt"
        :disabled="!tiltEnabled"
        active-text="黄赤交角"
      />
      <template v-if="!compact">
        <el-switch
          v-model="coriolis"
          :disabled="!store.can('coriolis')"
          active-text="地转偏向"
        />
        <el-switch
          v-model="landSea"
          :disabled="!store.can('landSea')"
          active-text="海陆热力"
        />
        <el-switch
          v-model="sectioned"
          :disabled="!store.can('sectioned')"
          active-text="剖开地球"
        />
      </template>
    </div>

    <el-button v-if="!compact" size="small" @click="toggleFullscreen">全屏授课</el-button>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 18px;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}
.bar.compact {
  padding: 8px 14px;
  gap: 10px 14px;
}
.ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 280px;
  flex: 1;
  font-size: 12px;
  color: var(--text-500);
}
.sun-icon {
  flex-shrink: 0;
  display: block;
}
.ctrl .el-slider {
  flex: 1;
  max-width: 220px;
}
.val {
  color: var(--text-700);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tilt-off {
  font-style: normal;
  color: #e8b84a;
  margin-left: 4px;
}
.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
}
.locked {
  opacity: 0.55;
}
</style>
