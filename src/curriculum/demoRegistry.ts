import type { Component } from 'vue'

/** 演示主引擎：决定默认工具栈提示 */
export type DemoEngine = 'three' | 'd3' | 'maplibre' | 'echarts' | 'mixed'

export type DemoStatus = 'ready' | 'deferred'

export interface DemoStep {
  id: string
  title: string
}

export interface DemoEntry {
  tutorialId: string
  /** 短标题（导航用，可与教材略简） */
  title: string
  status: DemoStatus
  engine: DemoEngine
  /** 课内步骤；右侧用图形响应，不要长文 */
  steps: DemoStep[]
  /** ready 时动态加载的画布组件 */
  load?: () => Promise<{ default: Component }>
}

/**
 * 高二演示注册表（选必1 + 选必2）。
 * 未列出的课不进 DemoLab；planned 地球预览仍走 /lab。
 */
export const DEMO_REGISTRY: DemoEntry[] = [
  // —— 选必1 第一章 ——
  {
    tutorialId: 'earth-rotation',
    title: '地球自转',
    status: 'ready',
    engine: 'mixed',
    steps: [
      { id: 'basics', title: '方向·周期·速度' },
      { id: 'day-night', title: '昼夜与晨昏线' },
      { id: 'coriolis', title: '地转偏向' },
      { id: 'timezones', title: '时区与区时' },
    ],
    load: () => import('@/demos/earth-rotation/index.vue'),
  },
  {
    tutorialId: 'earth-revolution',
    title: '地球公转',
    status: 'ready',
    engine: 'mixed',
    steps: [
      { id: 'tilt', title: '黄赤交角' },
      { id: 'subsolar', title: '直射点移动' },
      { id: 'seasons', title: '四季与五带' },
    ],
    load: () => import('@/demos/earth-revolution/index.vue'),
  },
  // —— 选必1 第二章 ——
  {
    tutorialId: 'rock-cycle',
    title: '岩石圈物质循环',
    status: 'ready',
    engine: 'mixed',
    steps: [
      { id: 'process', title: '形成过程' },
      { id: 'types', title: '三大类岩石' },
      { id: 'cycle', title: '循环路径' },
    ],
    load: () => import('@/demos/rock-cycle/index.vue'),
  },
  {
    tutorialId: 'landform-change',
    title: '地表形态变化',
    status: 'ready',
    engine: 'mixed',
    steps: [
      { id: 'fold', title: '褶皱' },
      { id: 'fault', title: '断层' },
      { id: 'external', title: '外力作用' },
    ],
    load: () => import('@/demos/landform-change/index.vue'),
  },
  {
    tutorialId: 'landform-human',
    title: '地貌与人类活动',
    status: 'ready',
    engine: 'd3',
    steps: [
      { id: 'settlement', title: '聚落分布' },
      { id: 'transport', title: '交通走向' },
    ],
    load: () => import('@/demos/landform-human/index.vue'),
  },
  // —— 选必1 第三章 ——
  {
    tutorialId: 'atmosphere-belts-winds',
    title: '气压带风带',
    status: 'ready',
    engine: 'three',
    steps: [{ id: 'lab', title: '打开地球实验室' }],
    // 已有完整 GeoLab，Demo 壳只做跳转入口
    load: () => import('@/demos/atmosphere-belts-winds/index.vue'),
  },
  {
    tutorialId: 'belts-and-climate',
    title: '气压带风带与气候',
    status: 'ready',
    engine: 'mixed',
    steps: [
      { id: 'control', title: '带状控制' },
      { id: 'climate', title: '气候统计' },
    ],
    load: () => import('@/demos/belts-and-climate/index.vue'),
  },
  {
    tutorialId: 'weather-systems',
    title: '天气系统',
    status: 'ready',
    engine: 'three',
    steps: [
      { id: 'cold-front', title: '冷锋' },
      { id: 'warm-front', title: '暖锋' },
      { id: 'cyclone', title: '气旋反气旋' },
    ],
    load: () => import('@/demos/weather-systems/index.vue'),
  },
  // —— 选必1 第四章 ——
  {
    tutorialId: 'inland-water',
    title: '陆地水体',
    status: 'ready',
    engine: 'mixed',
    steps: [
      { id: 'supply', title: '补给方式' },
      { id: 'hydrograph', title: '流量过程' },
    ],
    load: () => import('@/demos/inland-water/index.vue'),
  },
  {
    tutorialId: 'ocean-currents',
    title: '洋流',
    status: 'ready',
    engine: 'three',
    steps: [
      { id: 'pattern', title: '全球模式' },
      { id: 'impact', title: '影响' },
    ],
    load: () => import('@/demos/ocean-currents/index.vue'),
  },
  {
    tutorialId: 'air-sea',
    title: '海气相互作用',
    status: 'ready',
    engine: 'mixed',
    steps: [
      { id: 'normal', title: '正常年' },
      { id: 'elnino', title: '厄尔尼诺' },
      { id: 'lanina', title: '拉尼娜' },
    ],
    load: () => import('@/demos/air-sea/index.vue'),
  },
  // —— 选必1 第五章 ——
  {
    tutorialId: 'env-integrity',
    title: '自然环境整体性',
    status: 'ready',
    engine: 'd3',
    steps: [
      { id: 'elements', title: '五大要素' },
      { id: 'chain', title: '牵一发而动全身' },
    ],
    load: () => import('@/demos/env-integrity/index.vue'),
  },
  {
    tutorialId: 'env-differentiation',
    title: '地域差异性',
    status: 'ready',
    engine: 'd3',
    steps: [
      { id: 'latitudinal', title: '纬度地带性' },
      { id: 'longitudinal', title: '经度地带性' },
      { id: 'vertical', title: '垂直地带性' },
    ],
    load: () => import('@/demos/env-differentiation/index.vue'),
  },
  // —— 选必2 ——
  {
    tutorialId: 'region-types',
    title: '区域及其类型',
    status: 'deferred',
    engine: 'maplibre',
    steps: [{ id: 'overview', title: '示意预览' }],
  },
  {
    tutorialId: 'region-difference',
    title: '区域发展差异',
    status: 'deferred',
    engine: 'echarts',
    steps: [
      { id: 'radar', title: '指标对照' },
      { id: 'map', title: '空间差异' },
    ],
  },
  {
    tutorialId: 'region-linkage',
    title: '区域联系',
    status: 'deferred',
    engine: 'maplibre',
    steps: [{ id: 'flows', title: '联系示意' }],
  },
  {
    tutorialId: 'metro-radiation',
    title: '大都市辐射',
    status: 'deferred',
    engine: 'maplibre',
    steps: [{ id: 'rings', title: '辐射圈层' }],
  },
  {
    tutorialId: 'houston-transition',
    title: '休斯敦转型',
    status: 'deferred',
    engine: 'echarts',
    steps: [{ id: 'structure', title: '产业结构' }],
  },
  {
    tutorialId: 'ruhr-renewal',
    title: '鲁尔区复兴',
    status: 'deferred',
    engine: 'echarts',
    steps: [{ id: 'timeline', title: '整治阶段' }],
  },
  {
    tutorialId: 'desertification',
    title: '荒漠化治理',
    status: 'deferred',
    engine: 'mixed',
    steps: [
      { id: 'causes', title: '成因' },
      { id: 'actions', title: '治理' },
    ],
  },
  {
    tutorialId: 'industry-transfer',
    title: '产业转移',
    status: 'deferred',
    engine: 'maplibre',
    steps: [{ id: 'flows', title: '转移路径' }],
  },
  {
    tutorialId: 'resource-allocation',
    title: '资源跨区域调配',
    status: 'deferred',
    engine: 'maplibre',
    steps: [{ id: 'routes', title: '调配线路' }],
  },
  {
    tutorialId: 'yangtze-coop',
    title: '长江流域协作',
    status: 'deferred',
    engine: 'maplibre',
    steps: [{ id: 'basin', title: '流域分段' }],
  },
  {
    tutorialId: 'belt-road',
    title: '一带一路',
    status: 'deferred',
    engine: 'maplibre',
    steps: [{ id: 'corridors', title: '廊道网络' }],
  },
]

const byId = new Map(DEMO_REGISTRY.map((d) => [d.tutorialId, d]))

export function getDemo(tutorialId: string): DemoEntry | undefined {
  return byId.get(tutorialId)
}

export function hasDemo(tutorialId: string): boolean {
  return byId.has(tutorialId)
}

export const ENGINE_LABEL: Record<DemoEngine, string> = {
  three: '3D 地球',
  d3: '矢量示意',
  maplibre: '交互地图',
  echarts: '统计图表',
  mixed: '多图组合',
}
