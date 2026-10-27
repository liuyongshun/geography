<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ title: string; hint: string; note: string; playing: boolean; error?: string }>()
const emit = defineEmits<{ toggle: []; reset: [] }>()
const host = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
let press: { x: number; y: number } | null = null
function down(e: PointerEvent) { if (e.button === 0) press = { x: e.clientX, y: e.clientY } }
function up(e: PointerEvent) {
  if (press && e.button === 0 && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) emit('toggle')
  press = null
}
defineExpose({ host, canvas })
</script>
<template>
  <div class="atmosphere-wrap">
    <div class="toolbar" data-dili-chrome>
      <span class="hint">{{ hint }}</span>
      <div class="tools"><slot name="tools" /></div>
      <button class="chip" type="button" :aria-pressed="!playing" @click="emit('toggle')">{{ playing ? '暂停演示' : '继续演示' }}</button>
      <button class="chip" type="button" @click="emit('reset')">复位视角</button>
    </div>
    <div class="scene-body">
    <div ref="host" class="scene-stage">
      <canvas ref="canvas" :aria-label="`${title}，可拖拽旋转、滚轮缩放`" @pointerdown="down" @pointerup="up" @pointercancel="press = null" />
      <aside class="scene-hud" data-dili-chrome><b>{{ title }}</b><span>真实地球 · 临边视角 · 拖拽环视 · 点击暂停 / 恢复</span></aside>
      <div v-if="error" class="scene-error">{{ error }}</div>
    </div>
      <div class="scene-panel" data-dili-chrome><slot name="panel" /></div>
    </div>
    <footer class="scene-note" data-dili-chrome><i />{{ note }}</footer>
  </div>
</template>
<style>
.atmosphere-wrap { height:100%; min-height:0; display:flex; flex-direction:column; background:var(--demo-canvas); color:var(--demo-ink); }
.atmosphere-wrap .toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:8px 14px; background:var(--bg-surface); border-bottom:1px solid var(--border); }
.atmosphere-wrap .hint { flex:1 1 240px; font-size:12px; color:var(--text-400); }
.atmosphere-wrap .tools { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.atmosphere-wrap .chip { background:transparent; border:1px solid var(--border); color:var(--text-500); font:inherit; font-size:12px; border-radius:8px; padding:5px 10px; cursor:pointer; }
.atmosphere-wrap .chip.on { color:var(--demo-ink); border-color:var(--demo-accent); background:rgba(74,163,217,.14); }
.atmosphere-wrap .chip:focus-visible { outline:2px solid var(--demo-lift); outline-offset:2px; }
.atmosphere-wrap .scene-body { flex:1; position:relative; min-height:0; }
.atmosphere-wrap .scene-stage { height:100%; position:relative; min-height:340px; overflow:hidden; }
.atmosphere-wrap canvas { display:block; width:100%; height:100%; touch-action:none; }
.atmosphere-wrap .scene-hud { position:absolute; top:14px; left:16px; pointer-events:none; display:grid; gap:5px; }
.atmosphere-wrap .scene-hud b { color:var(--demo-ink-muted); font-size:13px; font-weight:500; }
.atmosphere-wrap .scene-hud span { color:var(--demo-ink-dim); font-size:10px; }
.atmosphere-wrap .scene-panel { position:absolute; right:14px; top:14px; width:205px; border:1px solid rgba(158,201,232,.17); border-radius:12px; background:rgba(10,16,32,.88); backdrop-filter:blur(10px); padding:14px; font-size:12px; }
.atmosphere-wrap .scene-panel:empty { display:none; }
.atmosphere-wrap .scene-panel h3 { margin:0 0 8px; font-size:13px; font-weight:500; color:var(--demo-lift); }
.atmosphere-wrap .scene-panel p { line-height:1.7; margin:5px 0; color:var(--demo-ink-muted); }
.atmosphere-wrap .scene-panel small { display:block; line-height:1.6; font-size:10px; color:var(--demo-ink-dim); }
.atmosphere-wrap .scene-panel input[type=range] { width:100%; accent-color:var(--demo-accent); margin:12px 0; }
.atmosphere-wrap .scene-note { display:flex; align-items:center; gap:8px; padding:10px 16px; border-top:1px solid var(--border); font-size:11px; line-height:1.7; color:var(--demo-ink-muted); background:var(--bg-surface); }
.atmosphere-wrap .scene-note i { width:5px; height:5px; border-radius:50%; background:var(--demo-lift); flex-shrink:0; }
.atmosphere-wrap .scene-error { position:absolute; inset:40% 10% auto; text-align:center; background:var(--demo-panel); padding:20px; }
@media(max-width:1100px) { .atmosphere-wrap .scene-panel { width:170px; padding:10px; } }
@media(max-width:760px) { .atmosphere-wrap .scene-panel { position:relative; top:auto; right:auto; width:auto; margin:0 10px 10px; } .atmosphere-wrap .scene-body { overflow:auto; display:flex; flex-direction:column; } .atmosphere-wrap .scene-stage { flex:1 0 340px; height:auto; } .atmosphere-wrap .scene-hud { top:8px; left:10px; } }
</style>
