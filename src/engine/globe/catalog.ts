import type { LayerId, LayerMeta } from './types'

/**
 * 图层目录：UI tag 与默认开关的唯一来源。
 * 新增课程能力时只改这里 + layers/* 实现 +（可选）layerBindings。
 */
export const LAYER_CATALOG: LayerMeta[] = [
  {
    id: 'earth',
    label: '地球底图',
    description: 'Blue Marble 卫星底图（基准，不可关闭）',
    category: 'base',
    sticky: true,
    defaultOn: true,
  },
  {
    id: 'countries',
    label: '国家政区',
    description: '教学示意国界与中文国名',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'cities',
    label: '主要城市',
    description: '全球主要城市注记；点击可查实时天气',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'latlon',
    label: '经纬网',
    description: '经线 / 纬线格网（青色加粗）',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'compass',
    label: '东南西北',
    description: '地理方位标注（北南两极，东西在赤道）',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'degrees',
    label: '经纬度读数',
    description: '主要经线 / 纬线度数注记',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'timezones',
    label: '时区',
    description: '理论时区边界（橙色加粗经线，每 15°；教学示意）',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'rivers',
    label: '主要河流',
    description: '世界主要河流示意中心线',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'oceanCurrents',
    label: '世界洋流',
    description: '主要洋流路径示意（暖流暖色、寒流冷色，沿流向动画）',
    category: 'climate',
    defaultOn: false,
  },
  {
    id: 'plates',
    label: '板块边界',
    description: '六大板块边界示意（消亡/生长/转换）',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'earthquakes',
    label: '近期地震',
    description: 'USGS 一周 M4.5+ 震中（需联网）',
    category: 'geo',
    defaultOn: false,
  },
  {
    id: 'pressure',
    label: '气压带',
    description: '全球气压带柔边色带',
    category: 'atmosphere',
    defaultOn: true,
  },
  {
    id: 'circulation',
    label: '大气环流',
    description: '三圈环流粒子轨迹',
    category: 'atmosphere',
    defaultOn: true,
  },
  {
    id: 'windfield',
    label: '实况风场',
    description: 'Open-Meteo 稀疏格点风向（需联网；与示意环流互斥）',
    category: 'atmosphere',
    defaultOn: false,
  },
  {
    id: 'sun',
    label: '太阳直射',
    description: 'NASA SDO/AIA 171 金黄日面 + 直射点；主光随直射方向（本地贴图）',
    category: 'atmosphere',
    defaultOn: true,
  },
  {
    id: 'insolation',
    label: '太阳辐射',
    description: 'NASA CERES 大气顶入射太阳辐射（需联网；随月份切换）',
    category: 'climate',
    defaultOn: false,
  },
  {
    id: 'terminator',
    label: '晨昏线',
    description: '昼夜分界示意（随月份移动）',
    category: 'atmosphere',
    defaultOn: false,
  },
  {
    id: 'nightlights',
    label: '夜间灯光',
    description: '地球夜景灯光贴图（本地资源，可离线）',
    category: 'climate',
    defaultOn: false,
  },
  {
    id: 'sst',
    label: '海表温度',
    description: 'NASA GHRSST 海表温度（需联网）',
    category: 'climate',
    defaultOn: false,
  },
  {
    id: 'chlorophyll',
    label: '叶绿素',
    description: 'PACE 叶绿素 a（渔场/初级生产力示意，需联网）',
    category: 'climate',
    defaultOn: false,
  },
  {
    id: 'snowice',
    label: '积雪海冰',
    description: 'MODIS 积雪 + 海冰（需联网）',
    category: 'climate',
    defaultOn: false,
  },
  {
    id: 'precip',
    label: '降水估测',
    description: 'GPM IMERG 降水率（需联网）',
    category: 'climate',
    defaultOn: false,
  },
  {
    id: 'popdensity',
    label: '人口密度',
    description: 'GPW 2020 人口密度栅格（需联网）',
    category: 'climate',
    defaultOn: false,
  },
]

export function defaultLayerMap(): Record<LayerId, boolean> {
  const out = {} as Record<LayerId, boolean>
  for (const m of LAYER_CATALOG) {
    out[m.id] = Boolean(m.defaultOn)
  }
  return out
}

export function layerMeta(id: LayerId): LayerMeta | undefined {
  return LAYER_CATALOG.find((m) => m.id === id)
}

export function toggleableLayers(): LayerMeta[] {
  return LAYER_CATALOG.filter((m) => !m.sticky)
}
