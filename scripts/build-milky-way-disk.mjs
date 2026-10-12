/**
 * 可选：下载 NASA/JPL 公有领域「银河系俯视示意」到
 *   public/textures/space/milky-way-disk.jpg
 *
 * 来源备选（公有领域 / 可教学使用）：
 * - NASA/JPL-Caltech/R. Hurt Artist's impression（Wikimedia）
 * - NASA/CXC/M.Weiss Face-on schematic（Chandra）
 *
 * 若下载失败，Demo 会在浏览器内程序烘焙棒旋盘面（同观感示意）。
 *
 * 用法：node scripts/build-milky-way-disk.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(__dirname, '../public/textures/space/milky-way-disk.jpg')

const URLS = [
  // NASA/JPL PIA10748：银河系俯视棒旋艺术家示意（正确全盘；勿用 PIA03653 银心红外）
  'https://images-assets.nasa.gov/image/PIA10748/PIA10748~large.jpg',
  'https://images-assets.nasa.gov/image/PIA10748/PIA10748~medium.jpg',
  'https://images-assets.nasa.gov/image/PIA10748/PIA10748~orig.jpg',
  // Wikimedia 镜像（部分网络不可达）
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Artist%27s_impression_of_the_Milky_Way.jpg/2048px-Artist%27s_impression_of_the_Milky_Way.jpg',
]

async function tryFetch(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'dili-edu/1.0 (geography teaching; asset mirror)',
      Accept: 'image/jpeg,image/png,*/*',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 20_000) throw new Error(`too small: ${buf.length}`)
  // JPEG/PNG magic
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8
  const isPng = buf[0] === 0x89 && buf[1] === 0x50
  if (!isJpeg && !isPng) throw new Error('not an image')
  return buf
}

let lastErr = null
for (const url of URLS) {
  try {
    console.log('fetch', url)
    const buf = await tryFetch(url)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, buf)
    console.log('wrote', outPath, buf.length, 'bytes')
    process.exit(0)
  } catch (e) {
    lastErr = e
    console.warn('fail:', e.message || e)
  }
}
console.error('全部下载失败。Demo 将使用运行时程序烘焙盘面。', lastErr?.message || '')
process.exit(1)
