/** NASA GIBS WMS：等距整图拉取（纠正 MIME）+ 可选与底图合成。 */

export function gibsSafeDate(daysAgo = 4): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

export function gibsMonthStart(monthsAgo = 1): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - monthsAgo)
  return d.toISOString().slice(0, 10)
}

export type GibsProduct =
  | 'sst'
  | 'chlorophyll'
  | 'snow'
  | 'seaice'
  | 'precip'
  | 'popdensity'
  | 'insolation'

interface GibsSpec {
  layer: string
  /** 静态产品可不传 TIME */
  time?: string
  format?: 'image/png' | 'image/jpeg'
}

/** CERES EBAF 时间轴止于 2018-10；按课月份映射到有数据的年月 */
export function ceresInsolationTime(month: number): string {
  const m = Math.min(12, Math.max(1, Math.round(month)))
  const year = m >= 11 ? 2017 : 2018
  return `${year}-${String(m).padStart(2, '0')}-01`
}

function productSpec(product: GibsProduct, month = 6): GibsSpec {
  switch (product) {
    case 'sst':
      return {
        layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
        time: gibsSafeDate(4),
        format: 'image/png',
      }
    case 'chlorophyll':
      return {
        layer: 'OCI_PACE_Chlorophyll_a',
        time: gibsMonthStart(1),
        format: 'image/png',
      }
    case 'snow':
      return {
        layer: 'MODIS_Terra_NDSI_Snow_Cover',
        time: gibsSafeDate(4),
        format: 'image/png',
      }
    case 'seaice':
      return {
        layer: 'MODIS_Terra_Sea_Ice',
        time: gibsSafeDate(4),
        format: 'image/png',
      }
    case 'precip':
      return {
        layer: 'IMERG_Precipitation_Rate',
        time: gibsSafeDate(2),
        format: 'image/png',
      }
    case 'popdensity':
      return {
        layer: 'GPW_Population_Density_2020',
        // GPW 为静态年份产品，可不带 TIME；带上更稳
        time: '2020-01-01',
        format: 'image/png',
      }
    case 'insolation':
      return {
        layer: 'CERES_EBAF_TOA_Incoming_Solar_Flux_Monthly',
        time: ceresInsolationTime(month),
        format: 'image/png',
      }
  }
}

export function gibsEquirectUrl(
  product: GibsProduct,
  width = 2048,
  height = 1024,
  month = 6,
): string {
  const spec = productSpec(product, month)
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: spec.layer,
    STYLES: '',
    FORMAT: spec.format ?? 'image/png',
    WIDTH: String(width),
    HEIGHT: String(height),
    CRS: 'EPSG:4326',
    BBOX: '-90,-180,90,180',
  })
  if (spec.time) params.set('TIME', spec.time)
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`图片加载失败: ${src.slice(0, 80)}`))
    img.src = src
  })
}

async function fetchGibsBitmap(
  product: GibsProduct,
  width: number,
  height: number,
  month = 6,
): Promise<ImageBitmap> {
  const res = await fetch(gibsEquirectUrl(product, width, height, month), { mode: 'cors' })
  if (!res.ok) throw new Error(`GIBS ${product} HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  if (buf.byteLength < 800) throw new Error(`GIBS ${product} 响应过小`)
  const mime = productSpec(product, month).format ?? 'image/png'
  return createImageBitmap(new Blob([buf], { type: mime }))
}

/**
 * 拉取 GIBS 图层并叠到本地底图上（透明/近黑像素透出底图）。
 * 返回 blob: URL，调用方负责 revoke。
 */
export async function fetchGibsSurfaceObjectUrl(
  product: GibsProduct | 'snowice',
  basemapUrl: string,
  width = 2048,
  height = 1024,
  month = 6,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法创建 canvas')

  const base = await loadImage(basemapUrl)
  ctx.drawImage(base, 0, 0, width, height)
  const out = ctx.getImageData(0, 0, width, height)
  const o = out.data

  const products: GibsProduct[] =
    product === 'snowice' ? ['snow', 'seaice'] : [product]

  const scratch = document.createElement('canvas')
  scratch.width = width
  scratch.height = height
  const sctx = scratch.getContext('2d', { willReadFrequently: true })
  if (!sctx) throw new Error('无法创建 scratch')

  let got = false
  for (const p of products) {
    try {
      const bmp = await fetchGibsBitmap(p, width, height, month)
      sctx.clearRect(0, 0, width, height)
      sctx.drawImage(bmp, 0, 0, width, height)
      bmp.close()
      const sat = sctx.getImageData(0, 0, width, height)
      const s = sat.data
      for (let i = 0; i < s.length; i += 4) {
        const a = s[i + 3]!
        const r = s[i]!
        const g = s[i + 1]!
        const b = s[i + 2]!
        // 透明或近黑 → 保留底图；有色数据盖上
        const useful = a > 24 && (r > 12 || g > 12 || b > 12)
        if (!useful) continue
        o[i] = r
        o[i + 1] = g
        o[i + 2] = b
        o[i + 3] = 255
      }
      got = true
    } catch (err) {
      console.warn(`[gibs] ${p} 拉取失败`, err)
    }
  }
  if (!got) throw new Error(`GIBS ${product} 全部失败`)

  ctx.putImageData(out, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob 失败'))),
      'image/jpeg',
      0.9,
    )
  })
  return URL.createObjectURL(blob)
}
