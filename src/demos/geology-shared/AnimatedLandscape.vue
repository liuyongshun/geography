<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { fragmentShader, vertexShader } from './shaders'

const props = defineProps<{ kind: 'magma' | 'landform' | 'wind'; time: number }>()
const canvas = ref<HTMLCanvasElement>()
const failed = ref(false)
const source = props.kind === 'magma' ? '/textures/geology/volcano-cutaway.jpg' : props.kind === 'wind' ? '/textures/geology/wind-cutaway.png' : '/textures/geology/landform-cutaway.jpg'
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let buffer: WebGLBuffer | null = null
let texture: WebGLTexture | null = null
let observer: ResizeObserver | null = null
let timeLocation: WebGLUniformLocation | null = null
let resolutionLocation: WebGLUniformLocation | null = null
let disposed = false
const shaders: WebGLShader[] = []
const image = new Image()

function draw() {
  if (!gl || !program || failed.value) return
  gl.uniform1f(timeLocation, props.time)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}
function resize() {
  if (!canvas.value || !gl) return
  const bounds = canvas.value.getBoundingClientRect()
  const dpr = Math.min(devicePixelRatio || 1, 1.5)
  canvas.value.width = Math.max(1, Math.round(bounds.width * dpr))
  canvas.value.height = Math.max(1, Math.round(bounds.height * dpr))
  gl.viewport(0, 0, canvas.value.width, canvas.value.height)
  gl.uniform2f(resolutionLocation, canvas.value.width, canvas.value.height)
  draw()
}
function compile(type: number, source: string) {
  const shader = gl!.createShader(type)
  if (!shader) throw new Error('Cannot create geological shader')
  shaders.push(shader)
  gl!.shaderSource(shader, source)
  gl!.compileShader(shader)
  if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(shader) || 'Shader compilation failed')
  return shader
}
function contextLost(event: Event) { event.preventDefault(); failed.value = true }
onMounted(() => {
  canvas.value?.addEventListener('webglcontextlost', contextLost)
  image.onload = () => {
    if (disposed || !canvas.value) return
    try {
      gl = canvas.value.getContext('webgl', { alpha: false, antialias: false })
      if (!gl) throw new Error('WebGL unavailable')
      program = gl.createProgram()
      if (!program) throw new Error('Cannot create program')
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Program link failed')
      gl.useProgram(program)
      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      texture = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.uniform1i(gl.getUniformLocation(program, 'art'), 0)
      gl.uniform1f(gl.getUniformLocation(program, 'landscape'), props.kind === 'magma' ? 0 : props.kind === 'wind' ? 2 : 1)
      timeLocation = gl.getUniformLocation(program, 'time')
      resolutionLocation = gl.getUniformLocation(program, 'resolution')
      observer = new ResizeObserver(resize)
      observer.observe(canvas.value)
      resize()
    } catch (error) {
      failed.value = true
      console.warn('Geological scene uses static fallback:', error)
    }
  }
  image.onerror = () => { failed.value = true }
  image.src = source
})
watch(() => props.time, draw)
onUnmounted(() => {
  disposed = true
  image.onload = null
  image.onerror = null
  observer?.disconnect()
  canvas.value?.removeEventListener('webglcontextlost', contextLost)
  if (gl) {
    gl.deleteTexture(texture)
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
    shaders.forEach(shader => gl!.deleteShader(shader))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  gl = null
})
</script>

<template>
  <div class="landscape">
    <img :src="source" :alt="kind === 'magma' ? '火山、上升通道与地下岩浆房的地质剖面' : kind === 'wind' ? '左侧风蚀蘑菇岩与右侧沙丘构成的风力侵蚀和堆积地貌' : '从冰川山地、冲积扇到河流平原和三角洲海岸的连续地貌剖面'">
    <canvas v-show="!failed" ref="canvas" aria-hidden="true" />
    <span v-if="failed" class="fallback">当前设备显示静态剖面</span>
  </div>
</template>

<style scoped>
.landscape,.landscape img,.landscape canvas{position:absolute;inset:0;width:100%;height:100%}.landscape img{object-fit:fill}.fallback{position:absolute;bottom:10px;right:10px;background:#071321df;padding:5px 9px;border-radius:4px;color:#c1d3e2;font-size:10px}
</style>
