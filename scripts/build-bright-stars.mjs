/**
 * Yale Bright Star Catalogue (bsc5.dat.gz) → bright-stars.json
 * 含单位方向、星等、Bayer/Flamsteed 名；亮星附中文常用名。
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const gzPath = path.join(root, 'public/astro/bsc5.dat.gz')
const outPath = path.join(root, 'public/astro/bright-stars.json')

/** Bayer / 专名 → 中文常用名（教学） */
const NAME_ZH = {
  'α CMa': '天狼',
  'α Car': '老人',
  'α Cen': '南门二',
  'α Boo': '大角',
  'α Lyr': '织女',
  'α Aur': '五车二',
  'β Ori': '参宿七',
  'α CMi': '南河三',
  'α Ori': '参宿四',
  'α Aql': '河鼓二',
  'α Tau': '毕宿五',
  'α Vir': '角宿一',
  'α Sco': '心宿二',
  'β Gem': '北河三',
  'α PsA': '北落师门',
  'α Cyg': '天津四',
  'α Leo': '轩辕十四',
  'α CMa A': '天狼',
  'α Cru': '十字架二',
  'α Gem': '北河二',
  'β Cru': '十字架三',
  'α Eri': '水委一',
  'α Hya': '星宿一',
  'α Ari': '娄宿三',
  'α Peg': '室宿一',
  'β Peg': '室宿二',
  'α UMa': '天枢',
  'α UMi': '北极星',
  'β UMi': '帝星',
  'α Cas': '王良四',
  'β Cas': '王良一',
  'α And': '壁宿二',
  'α Per': '天船三',
  'α Oph': '候',
  'α Ser': '天市右垣七',
  'α CrB': '贯索四',
  'α Lib': '氐宿一',
  'β Lib': '氐宿四',
  'α Cap': '牛宿二',
  'δ Cap': '垒壁阵四',
  'α Aqr': '危宿一',
  'β Aqr': '虚宿一',
  'α Cet': '刍藁增二',
  'β Cet': '土司空',
  'α Phe': '水委增一',
  'α Gru': '鹤一',
  'α Pav': '孔雀十一',
  'α Tuc': '鸟喙二',
  'α TrA': '三角形三',
  'α Cir': '圆规一',
  'α Mus': '苍蝇一',
  'α Dor': '剑鱼一',
  'α Pic': '绘架一',
  'α Vol': '飞鱼一',
  'α Ind': '印第安一',
  'α Scl': '玉夫一',
  'α For': '天炉一',
  'α Ret': '网罟一',
  'α Men': '山案一',
  'α Cha': '蝘蜓一',
  'α Hyi': '水蛇一',
  'α Oct': '南极一',
  'α Aps': '天燕一',
  'β Cen': '马腹一',
  'α Lup': '骑官四',
  'ε CMa': '弧矢七',
  'δ CMa': '弧矢一',
  'η UMa': '瑶光',
  'ζ UMa': '开阳',
  'ε UMa': '玉衡',
  'δ UMa': '天权',
  'γ UMa': '天玑',
  'β UMa': '天璇',
  'α Crv': '轸宿四',
  'γ Cru': '十字架一',
  'λ Sco': '尾宿八',
  'θ Sco': '尾宿五',
  'δ Sco': '房宿三',
  'σ Sgr': '斗宿四',
  'ε Sgr': '箕宿三',
  'α Sgr': '斗宿六',
  'β Sgr': '斗宿八',
  'γ Dra': '天棓四',
  'β Dra': '天棓三',
  'α Dra': '右枢',
  'α Her': '帝座',
  'β Her': '天市右垣九',
  'α Lyr': '织女',
  'ε Lyr': '织女增一',
  'α CVn': '常陈一',
  'α Com': '太微左垣五',
  'β Leo': '五帝座一',
  'γ Leo': '轩辕十二',
  'δ Leo': '轩辕十一',
  'ε Leo': '轩辕十五',
  'α Cnc': '柳宿增三',
  'β Cnc': '柳宿增十',
  'δ Cnc': '鬼宿四',
  'γ Gem': '井宿三',
  'ε Gem': '井宿五',
  'η Gem': '井宿二',
  'μ Gem': '井宿一',
  'α CMi': '南河三',
  'β CMi': '南河二',
  'α Mon': '天狼增四',
  'α Lep': '厕一',
  'β Lep': '厕二',
  'α Col': '丈人一',
  'α Pup': '弧矢二',
  'ζ Pup': '弧矢九',
  'α Pyx': '天庙一',
  'α Ant': '天线一',
  'α Sex': '天相一',
  'α Crt': '翼宿一',
  'δ Vir': '东上相',
  'ε Vir': '太微左垣二',
  'β Vir': '太微右垣一',
  'γ Vir': '太微右垣二',
  'η Boo': '梗河一',
  'ε Boo': '梗河二',
  'β Boo': '七公七',
  'γ Boo': '招摇',
  'α CrB': '贯索四',
  'α Ser': '天市右垣七',
  'η Oph': '宋',
  'ζ Oph': '宋增一',
  'δ Oph': '天市右垣二',
  'β Oph': '天市右垣十',
  'α Sct': '天弁一',
  'α Vul': '齐增五',
  'α Sge': '左旗一',
  'γ Aql': '河鼓一',
  'β Aql': '河鼓三',
  'α Del': '瓠瓜一',
  'β Del': '瓠瓜四',
  'α Equ': '虚宿二',
  'ε Peg': '危宿三',
  'γ Peg': '壁宿一',
  'α Lac': '螣蛇一',
  'α Cep': '天钩五',
  'β Cep': '天钩八',
  'γ Cep': '少卫增八',
  'δ Cep': '造父一',
  'α Cam': '紫微左垣一',
  'β Cam': '紫微左垣二',
  'α Lyn': '玄戈',
  'α LMi': '势四',
  'β Tri': '天大将军九',
  'α Tri': '天大将军一',
  'β Ari': '娄宿一',
  'γ Ari': '娄宿二',
  'α Psc': '外屏七',
  'η Psc': '外屏一',
  'β And': '奎宿九',
  'γ And': '天大将军一',
  'α Lac': '螣蛇一',
}

function normalizeBayer(raw) {
  let s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  const map = {
    Alp: 'α',
    Bet: 'β',
    Gam: 'γ',
    Del: 'δ',
    Eps: 'ε',
    Zet: 'ζ',
    Eta: 'η',
    The: 'θ',
    Iot: 'ι',
    Kap: 'κ',
    Lam: 'λ',
    Mu: 'μ',
    Nu: 'ν',
    Xi: 'ξ',
    Omi: 'ο',
    Pi: 'π',
    Rho: 'ρ',
    Sig: 'σ',
    Tau: 'τ',
    Ups: 'υ',
    Phi: 'φ',
    Chi: 'χ',
    Psi: 'ψ',
    Ome: 'ω',
  }
  // BSC："9Alp CMa" / "Alp Eri" / "10 Cet"
  const m = s.match(/^(?:\d+)?\s*(Alp|Bet|Gam|Del|Eps|Zet|Eta|The|Iot|Kap|Lam|Mu|Nu|Xi|Omi|Pi|Rho|Sig|Tau|Ups|Phi|Chi|Psi|Ome)\s*([A-Za-z]{3})\s*(.*)$/i)
  if (m) {
    const key = Object.keys(map).find((k) => k.toLowerCase() === m[1].toLowerCase())
    const letter = key ? map[key] : m[1]
    const cons = m[2][0].toUpperCase() + m[2].slice(1, 3).toLowerCase()
    return `${letter} ${cons}${m[3] ? m[3].trim() : ''}`.trim()
  }
  return s
}

function parseAsciiCatalog(text) {
  const stars = []
  for (const line of text.split(/\r?\n/)) {
    if (line.length < 107) continue
    try {
      const nameRaw = line.slice(4, 14).trim()
      const rah = Number(line.slice(75, 77))
      const ram = Number(line.slice(77, 79))
      const ras = Number(line.slice(79, 83))
      const sign = line[83] === '-' ? -1 : 1
      const ded = Number(line.slice(84, 86))
      const dem = Number(line.slice(86, 88))
      const des = Number(line.slice(88, 90))
      const mag = Number(line.slice(102, 107))
      if (![rah, ram, ras, ded, dem, des, mag].every((v) => Number.isFinite(v))) continue
      if (mag > 6.5) continue
      const ra = ((rah + ram / 60 + ras / 3600) * 15 * Math.PI) / 180
      const dec = (sign * (ded + dem / 60 + des / 3600) * Math.PI) / 180
      const name = normalizeBayer(nameRaw)
      const zh = NAME_ZH[name] || NAME_ZH[name.replace(/\s+/g, ' ')] || ''
      stars.push({ ra, dec, mag, name, zh, nameRaw })
    } catch {
      /* skip */
    }
  }
  return stars
}

const buf = zlib.gunzipSync(fs.readFileSync(gzPath))
const stars = parseAsciiCatalog(buf.toString('latin1'))
console.log('stars', stars.length, 'named', stars.filter((s) => s.name).length, 'zh', stars.filter((s) => s.zh).length)

const out = {
  source: 'Yale Bright Star Catalogue (bsc5)',
  sourceUrl: 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz',
  license: 'Public domain catalog data',
  magLimit: 6.5,
  count: stars.length,
  coords: stars.flatMap((s) => {
    const cosD = Math.cos(s.dec)
    return [Math.cos(s.ra) * cosD, Math.sin(s.ra) * cosD, Math.sin(s.dec), s.mag]
  }),
  /** 与 coords 一一对应；无正式名则为 "" */
  names: stars.map((s) => s.name),
  /** 中文常用名（仅部分亮星） */
  namesZh: stars.map((s) => s.zh),
}

fs.writeFileSync(outPath, JSON.stringify(out))
console.log('wrote', outPath, fs.statSync(outPath).size)
// sample
const samples = stars.filter((s) => s.zh).slice(0, 8)
console.log('zh samples', samples.map((s) => `${s.zh}(${s.name} ${s.mag})`).join(', '))
