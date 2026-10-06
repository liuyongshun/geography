import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import lessonJson from '@content/atmosphere/lesson.json'
import type { HotspotId, Interaction, LessonPack, LessonStep } from '@/engine/atmosphere'
import { subsolarLatitude } from '@/engine/atmosphere'
import {
  defaultLayerMap,
  layerMeta,
  LAYER_CATALOG,
  toggleableLayers,
  resolveToggleOn,
  resolveLayerMapConflicts,
  conflictHintFor,
  type LayerId,
  type GlobePickCity,
} from '@/engine/globe'
import { resolveTutorialLayers } from '@/curriculum/layerBindings'
import { findTutorial } from '@/curriculum/types'
import curriculumJson from '@content/curriculum/xiangjiao.json'
import type { Curriculum } from '@/curriculum/types'

const lesson = lessonJson as LessonPack
const curriculum = curriculumJson as Curriculum

export type RoleMode = 'teach' | 'student'

export interface CityWeather {
  city: GlobePickCity
  loading: boolean
  error: string | null
  tempC: number | null
  weatherCode: number | null
  windKmh: number | null
  humidity: number | null
  summary: string
}

export const useGeoSceneStore = defineStore('geoScene', () => {
  const month = ref(lesson.defaultState.month)
  const axialTilt = ref(lesson.defaultState.axialTilt)
  const coriolis = ref(lesson.defaultState.coriolis)
  const landSea = ref(lesson.defaultState.landSea)
  const sectioned = ref(false)
  const countriesDisclaimer = ref('')
  const highlightId = ref<HotspotId | null>(lesson.defaultState.highlightId)
  const mode = ref<RoleMode>('teach')
  const stepIndex = ref(0)
  const playing = ref(false)
  const quizChoice = ref<string | null>(null)
  const quizRevealed = ref(false)
  const hoverId = ref<HotspotId | null>(null)
  const layers = reactive(defaultLayerMap())
  const cityWeather = ref<CityWeather | null>(null)
  const boundTutorialId = ref<string | null>(null)
  /** Tag 互斥提示（数秒后清空） */
  const layerConflictNotice = ref<string | null>(null)
  let conflictTimer: ReturnType<typeof setTimeout> | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const pack = computed(() => lesson)
  const step = computed<LessonStep>(() => lesson.steps[stepIndex.value] ?? lesson.steps[0])
  const subsolar = computed(() => subsolarLatitude(month.value, axialTilt.value))
  const allowed = computed(() => new Set(step.value.allowedInteractions))
  const layerTags = computed(() => toggleableLayers())

  function flashConflictNotice(text: string | null) {
    if (conflictTimer) {
      clearTimeout(conflictTimer)
      conflictTimer = null
    }
    layerConflictNotice.value = text
    if (!text) return
    conflictTimer = setTimeout(() => {
      layerConflictNotice.value = null
      conflictTimer = null
    }, 5600)
  }

  function can(action: Interaction) {
    if (mode.value === 'teach') return true
    return allowed.value.has(action)
  }

  function isLayerOn(id: LayerId) {
    return Boolean(layers[id])
  }

  function tagTitle(id: LayerId) {
    const meta = layerMeta(id)
    const base = meta?.description ?? ''
    const conflict = conflictHintFor(id)
    return conflict ? `${base}（${conflict}）` : base
  }

  function toggleLayer(id: LayerId) {
    const meta = layerMeta(id)
    if (!meta || meta.sticky) return
    const turningOn = !layers[id]
    if (!turningOn) {
      layers[id] = false
      return
    }
    layers[id] = true
    const { notice } = resolveToggleOn(layers, id)
    flashConflictNotice(notice)
  }

  function setLayer(id: LayerId, on: boolean) {
    const meta = layerMeta(id)
    if (!meta || meta.sticky) return
    if (!on) {
      layers[id] = false
      return
    }
    layers[id] = true
    const { notice } = resolveToggleOn(layers, id)
    flashConflictNotice(notice)
  }

  function applyLayers(map: Record<LayerId, boolean>) {
    const next = { ...map }
    const { notice } = resolveLayerMapConflicts(next)
    Object.assign(layers, next)
    flashConflictNotice(notice)
  }

  /** 按教材教程 id 激活对应 Tag */
  function bindTutorial(tutorialId: string) {
    boundTutorialId.value = tutorialId
    const hit = findTutorial(curriculum, tutorialId)
    const map = resolveTutorialLayers(tutorialId, hit?.chapter.id)
    applyLayers(map)
  }

  function applyLayerPreset(preset: 'atmosphere' | 'basemap' | 'clear') {
    const next = defaultLayerMap()
    for (const id of Object.keys(next) as LayerId[]) {
      if (id !== 'earth') next[id] = false
    }
    if (preset === 'atmosphere') {
      next.pressure = true
      next.circulation = true
      next.sun = true
    } else if (preset === 'basemap') {
      next.countries = true
      next.cities = true
      next.latlon = true
    }
    applyLayers(next)
  }

  async function pickCity(city: GlobePickCity) {
    cityWeather.value = {
      city,
      loading: true,
      error: null,
      tempC: null,
      weatherCode: null,
      windKmh: null,
      humidity: null,
      summary: '查询中…',
    }
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lng}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        current?: {
          temperature_2m?: number
          relative_humidity_2m?: number
          weather_code?: number
          wind_speed_10m?: number
        }
      }
      const cur = data.current ?? {}
      cityWeather.value = {
        city,
        loading: false,
        error: null,
        tempC: cur.temperature_2m ?? null,
        weatherCode: cur.weather_code ?? null,
        windKmh: cur.wind_speed_10m ?? null,
        humidity: cur.relative_humidity_2m ?? null,
        summary: weatherCodeLabel(cur.weather_code),
      }
    } catch (err) {
      cityWeather.value = {
        city,
        loading: false,
        error: err instanceof Error ? err.message : '查询失败',
        tempC: null,
        weatherCode: null,
        windKmh: null,
        humidity: null,
        summary: '无法获取（需联网）',
      }
    }
  }

  function clearCityWeather() {
    cityWeather.value = null
  }

  function applyStepState() {
    const s = step.value.state
    if (s.month != null) month.value = s.month
    if (s.axialTilt != null) axialTilt.value = s.axialTilt
    if (s.coriolis != null) coriolis.value = s.coriolis
    if (s.landSea != null) landSea.value = s.landSea
    if (s.sectioned != null) sectioned.value = s.sectioned
    highlightId.value = s.highlightId ?? null
    quizChoice.value = null
    quizRevealed.value = false
  }

  function go(index: number) {
    stepIndex.value = Math.max(0, Math.min(lesson.steps.length - 1, index))
    applyStepState()
  }

  function next() {
    if (stepIndex.value < lesson.steps.length - 1) go(stepIndex.value + 1)
    else stop()
  }

  function prev() {
    if (stepIndex.value > 0) go(stepIndex.value - 1)
  }

  function play() {
    playing.value = true
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      if (stepIndex.value >= lesson.steps.length - 1) {
        stop()
        return
      }
      next()
    }, Math.max(8, step.value.durationSec) * 1000)
  }

  function stop() {
    playing.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function setHighlight(id: HotspotId | null) {
    if (id && !can('hotspot')) return
    highlightId.value = highlightId.value === id ? null : id
  }

  function setMonth(v: number) {
    if (!can('month')) return
    month.value = v
  }

  function setMode(m: RoleMode) {
    mode.value = m
    go(0)
  }

  return {
    pack,
    step,
    month,
    axialTilt,
    coriolis,
    landSea,
    sectioned,
    countriesDisclaimer,
    highlightId,
    hoverId,
    mode,
    stepIndex,
    playing,
    quizChoice,
    quizRevealed,
    subsolar,
    layers,
    layerTags,
    layerConflictNotice,
    catalog: LAYER_CATALOG,
    cityWeather,
    boundTutorialId,
    can,
    isLayerOn,
    tagTitle,
    toggleLayer,
    setLayer,
    applyLayers,
    bindTutorial,
    applyLayerPreset,
    pickCity,
    clearCityWeather,
    go,
    next,
    prev,
    play,
    stop,
    setHighlight,
    setMonth,
    setMode,
    applyStepState,
  }
})

function weatherCodeLabel(code?: number): string {
  if (code == null) return '—'
  if (code === 0) return '晴'
  if (code <= 3) return '多云'
  if (code <= 48) return '雾'
  if (code <= 57) return '毛毛雨'
  if (code <= 67) return '雨'
  if (code <= 77) return '雪'
  if (code <= 82) return '阵雨'
  if (code <= 86) return '阵雪'
  if (code <= 99) return '雷暴'
  return `天气码 ${code}`
}
