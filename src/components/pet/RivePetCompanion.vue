<script setup lang="ts">
import { Alignment, Fit, Layout, Rive, RuntimeLoader } from '@rive-app/canvas'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  src: string
  stateMachine: string
  ariaLabel?: string
}>(), {
  ariaLabel: '学习伙伴',
})

const emit = defineEmits<{
  loaded: []
  error: [message: string]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let animation: Rive | undefined
let resizeObserver: ResizeObserver | undefined

function resize() {
  animation?.resizeDrawingSurfaceToCanvas()
}

/** 由课程流程调用，例如 petRef?.trigger('success')。 */
function trigger(name: string) {
  animation?.stateMachineInputs(props.stateMachine)?.find((input) => input.name === name)?.fire()
}

onMounted(() => {
  if (!canvas.value) return
  // 桌面端随应用离线分发运行时，避免加载模型时请求公共 CDN。
  RuntimeLoader.setWasmUrl('/rive/rive.wasm')
  RuntimeLoader.setWasmFallbackUrl(null)
  animation = new Rive({
    canvas: canvas.value,
    src: props.src,
    stateMachine: props.stateMachine,
    autoplay: true,
    enableRiveAssetCDN: false,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.BottomCenter }),
    onLoad: () => {
      resize()
      emit('loaded')
    },
    onLoadError: (event) => emit('error', String(event.data ?? 'Rive 模型加载失败')),
  })
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  animation?.cleanup()
  animation = undefined
})

defineExpose({ trigger })
</script>

<template>
  <canvas ref="canvas" class="rive-pet" :aria-label="ariaLabel" />
</template>

<style scoped>
.rive-pet { display:block; width:100%; height:100%; touch-action:manipulation; }
</style>
