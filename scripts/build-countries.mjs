/**
 * Build a teaching-safe country pack from world-atlas 110m.
 * Dispute handling (规避争议):
 * - ISO 158 (中国台湾) geometry merges under CN, no separate country label
 * - Skip labels for selected sensitive / incomplete entities
 * - Output is schematic teaching basemap, not an official boundary product
 *
 * Geometry keeps MultiPolygon structure: polygons[] = rings[] (outer first, then holes).
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { feature } from 'topojson-client'
import iso from 'i18n-iso-countries'
import zh from 'i18n-iso-countries/langs/zh.json' with { type: 'json' }

iso.registerLocale(zh)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const topo = JSON.parse(
  await import('node:fs').then((fs) =>
    fs.readFileSync(join(root, 'public/geo/countries-110m-topo.json'), 'utf8'),
  ),
)

const SKIP_IDS = new Set([
  '732', // Western Sahara
])

const MERGE_INTO = {
  158: '156', // 中国台湾 → 中国
}

const FORCE_LABEL = new Set([
  'CN', 'US', 'RU', 'CA', 'BR', 'AU', 'IN', 'AR', 'KZ', 'MX', 'ID', 'SA', 'IR',
  'MN', 'ZA', 'EG', 'TR', 'FR', 'DE', 'JP', 'GB', 'IT', 'ES', 'UA', 'NZ', 'CL',
  'NG', 'PK', 'TH', 'VN', 'PH', 'KR', 'IQ', 'MA', 'CD', 'PE', 'CO', 'ET',
])

/** Max vertices per ring after simplification (110m China mainland ≈ 230). */
const MAX_RING_PTS = 160

const fc = feature(topo, topo.objects.countries)

/** @type {Map<string, { id: string, nameZh: string, polygons: number[][][][], area: number }>} */
const byHost = new Map()

function ringArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return Math.abs(a) * 0.5
}

/** @returns {number[][][][]} polygons → rings → [lon,lat] */
function featurePolygons(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates]
  if (geom.type === 'MultiPolygon') return geom.coordinates
  return []
}

function simplifyRing(ring) {
  if (ring.length <= MAX_RING_PTS) {
    return ring.map(([lon, lat]) => [round(lon), round(lat)])
  }
  const step = Math.ceil(ring.length / MAX_RING_PTS)
  const out = []
  for (let i = 0; i < ring.length; i += step) {
    out.push([round(ring[i][0]), round(ring[i][1])])
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([...first])
  return out
}

for (const f of fc.features) {
  const numId = String(f.id).padStart(3, '0')
  if (SKIP_IDS.has(numId)) continue

  const hostNum = MERGE_INTO[numId] || numId
  const a2 = iso.numericToAlpha2(hostNum)
  if (!a2) continue

  const nameZh = a2 === 'CN' ? '中国' : iso.getName(a2, 'zh') || a2
  const polys = featurePolygons(f.geometry)
  const keepTiny = Boolean(MERGE_INTO[numId])

  let area = 0
  const cleaned = []
  for (const rings of polys) {
    const simp = rings
      .filter((r) => r.length >= 4)
      .map(simplifyRing)
      .filter((r) => r.length >= 4)
    if (!simp.length) continue
    const a = ringArea(simp[0])
    if (!keepTiny && a2 !== 'CN' && a < 0.08) continue
    area += a
    cleaned.push(simp)
  }
  if (!cleaned.length) continue

  const prev = byHost.get(a2)
  if (prev) {
    prev.polygons.push(...cleaned)
    prev.area += area
  } else {
    byHost.set(a2, { id: a2, nameZh, polygons: cleaned, area })
  }
}

const countries = [...byHost.values()]
  .map((c) => ({
    id: c.id,
    nameZh: c.nameZh,
    label: FORCE_LABEL.has(c.id),
    polygons: c.polygons,
  }))
  .filter((c) => c.polygons.length > 0)
  .sort((a, b) => a.id.localeCompare(b.id))

function round(n) {
  return Math.round(n * 1000) / 1000
}

const pack = {
  version: 2,
  source: 'world-atlas countries-110m (Natural Earth derived)',
  disclaimer:
    '教学示意底图：国界与政区仅为课堂示意，已对中国台湾与大陆做合并显示，并省略部分易争议独立标注；不作为任何领土主权或划界依据。',
  countries,
}

const out = join(root, 'public/geo/countries-teach.json')
writeFileSync(out, JSON.stringify(pack))
const cn = countries.find((c) => c.id === 'CN')
console.log(
  'wrote',
  out,
  'countries',
  countries.length,
  'labels',
  countries.filter((c) => c.label).length,
)
console.log(
  'CN polys',
  cn?.polygons.length,
  'outerPts',
  cn?.polygons.map((p) => p[0].length),
)
