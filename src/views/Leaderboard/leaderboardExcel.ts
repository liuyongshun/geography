import type { CellValue, Worksheet } from 'exceljs'
import { classStatistics, isAvatar, recognizeRows, type Classroom, type ImportCandidate } from './leaderboardData'

const HEADERS = ['班级', '姓名', '图片', '分数', '主座右铭', '次要座右铭1', '次要座右铭2', '性别', '角色类型', '重名标识', '内置素材路径', '性格', '爱好']
/** ExcelJS expects unprefixed SpreadsheetML tags; OOXML permits equivalent named prefixes. */
export async function normalizeExcelArchive(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  let changed = false
  for (const [path, entry] of Object.entries(zip.files)) {
    if (path.endsWith('.rels')) {
      const original = await entry.async('string')
      const sourceDirectory = path.includes('/_rels/') ? path.slice(0, path.indexOf('/_rels/')).split('/') : []
      const normalized = original.replace(/<Relationship\b[^>]*>/g, tag => {
        if (/TargetMode=["']External["']/.test(tag)) return tag
        return tag.replace(/\bTarget="\/([^"]+)"/, (_, target: string) => {
          const parts = target.split('/')
          let common = 0
          while (common < sourceDirectory.length && sourceDirectory[common] === parts[common]) common++
          return `Target="${'../'.repeat(sourceDirectory.length - common)}${parts.slice(common).join('/')}"`
        })
      })
      if (normalized !== original) { zip.file(path, normalized); changed = true }
      continue
    }
    if (!/^xl\/(workbook|styles|sharedStrings|worksheets\/[^/]+|tables\/[^/]+)\.xml$/.test(path)) continue
    let xml = await entry.async('string')
    const prefixes = [...xml.matchAll(/xmlns:([\w]+)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/g)].map(match => match[1])
    if (!prefixes.length) continue
    for (const prefix of new Set(prefixes)) xml = xml.replace(new RegExp(`(<\\/?)${prefix}:`, 'g'), '$1')
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<\w+\b[^>]*\sxmlns=/.test(xml)) xml = xml.replace(/(<[A-Za-z_][\w.-]*)(?=[\s>])/, '$1 xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
    zip.file(path, xml); changed = true
  }
  return changed ? await zip.generateAsync({ type: 'arraybuffer' }) : buffer
}
function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  if ('error' in value) return String(value.error)
  if ('formula' in value && value.result === undefined) return `=${value.formula}`
  if ('result' in value) return cellText(value.result as CellValue)
  if ('richText' in value) return value.richText.map(part => part.text).join('')
  if ('text' in value) return value.text
  return ''
}
function bytesToDataUrl(bytes: Uint8Array, extension: string) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384))
  return `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${btoa(binary)}`
}
export async function normalizeAvatar(blob: Blob): Promise<string> {
  if (blob.size > 10 * 1024 * 1024) throw new Error('单张图片请小于10MB')
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 128; canvas.height = 128
    const context = canvas.getContext('2d')!
    const scale = Math.min(128 / image.naturalWidth, 128 / image.naturalHeight)
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale
    context.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}
export async function readExcelCandidates(file: File, defaultClass: string): Promise<ImportCandidate[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Excel文件请小于20MB')
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await normalizeExcelArchive(await file.arrayBuffer()))
  const candidates: ImportCandidate[] = []
  for (const sheet of workbook.worksheets) {
    const rows: string[][] = []
    sheet.eachRow({ includeEmpty: true }, row => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => { cells[columnNumber - 1] = cellText(cell.value) })
      rows.push(cells)
    })
    const parsed = recognizeRows(rows, defaultClass, workbook.worksheets.length > 1)
    const rowsWithNames = rows.map((row, i) => ({ row, i })).filter(({ row }) => row.some(cell => /^(姓名|学生姓名|用户名称|用户名|name)$/i.test(cell ?? '')))
    const nameHeader = rowsWithNames[0]
    if (nameHeader) {
      const header = nameHeader.row
      const nameCol = header.findIndex(cell => /^(姓名|学生姓名|用户名称|用户名|name)$/i.test(cell ?? ''))
      const roleTypeCol = header.findIndex(cell => cell === '角色类型')
      const materialCol = header.findIndex(cell => cell === '内置素材路径')
      const imageRows = new Map<number, string>()
      for (const drawing of sheet.getImages()) {
        const image = workbook.getImage(Number(drawing.imageId))
        if (!image || !['png', 'jpeg', 'jpg'].includes(image.extension)) continue
        const rowIndex = Math.floor(drawing.range.tl.nativeRow ?? drawing.range.tl.row)
        const material = rows[rowIndex]?.[materialCol]
        if (material?.startsWith('/images/leaderboard/materials/') && isAvatar(material)) continue
        if (image.buffer) {
          const raw = new Uint8Array(image.buffer as unknown as ArrayBuffer)
          const dataUrl = bytesToDataUrl(raw, image.extension)
          const normalized = await normalizeAvatar(await (await fetch(dataUrl)).blob())
          imageRows.set(rowIndex, normalized)
        } else if (image.base64) {
          const dataUrl = image.base64.startsWith('data:') ? image.base64 : `data:image/${image.extension};base64,${image.base64}`
          imageRows.set(rowIndex, await normalizeAvatar(await (await fetch(dataUrl)).blob()))
        }
      }
      // Match by row order, preserving same-name students in different classes.
      let candidateIndex = 0
      for (let rowIndex = nameHeader.i + 1; rowIndex < rows.length; rowIndex++) {
        if (!(rows[rowIndex][nameCol] ?? '').trim()) continue
        const candidate = parsed[candidateIndex++]
        if (candidate && imageRows.has(rowIndex) && rows[rowIndex][roleTypeCol] !== '默认角色') candidate.avatar = imageRows.get(rowIndex)
        const material = rows[rowIndex][materialCol]
        if (candidate && material?.startsWith('/images/leaderboard/materials/') && isAvatar(material)) candidate.avatar = material
      }
    }
    candidates.push(...parsed)
  }
  return candidates
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
export async function createImportTemplate(): Promise<Blob> {
  const response = await fetch('/templates/leaderboard-import-template.xlsx')
  if (!response.ok) throw new Error('导入模板加载失败')
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await normalizeExcelArchive(await response.arrayBuffer()))
  const sheet = workbook.worksheets[0]
  for (const [column, title] of [[10, '性格'], [11, '爱好']] as const) {
    sheet.getCell(1, column).value = title
    sheet.getCell(1, column).style = { ...sheet.getCell('I1').style }
    sheet.getColumn(column).width = 32
  }
  sheet.getCell('J2').value = '开朗、乐于助人'
  sheet.getCell('K2').value = '阅读、篮球'
  sheet.getCell('J3').value = '细心、有耐心'
  sheet.getCell('K3').value = '绘画、旅行'
  sheet.autoFilter = { from: 'A1', to: 'K1' }
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
function formatSheet(sheet: Worksheet) {
  sheet.columns = HEADERS.map((header, i) => ({ header, width: [18, 18, 15, 12, 32, 32, 32, 12, 16, 14, 24, 32, 32][i] }))
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: 'A1', to: 'M1' }
  sheet.getColumn(11).hidden = true
  sheet.getRow(1).height = 26
  sheet.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18354D' } }
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
}
export async function exportClassrooms(classes: Classroom[], defaultAvatar?: string, defaultGirlAvatar?: string) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '地理过程'
  workbook.created = new Date()
  const used = new Set<string>(['班级汇总'])
  if (classes.length > 1) {
    const summary = workbook.addWorksheet('班级汇总')
    summary.addRow(['班级', '人数', '总分', '平均分', '已登顶人数', '线路段数'])
    summary.columns.forEach(column => { column.width = 19 })
    for (const group of classes) {
      const stats = classStatistics(group)
      summary.addRow([group.name, stats.count, stats.total, stats.average, stats.finished, group.segments])
    }
    summary.getColumn(4).numFmt = '0.00'
    summary.views = [{ state: 'frozen', ySplit: 1 }]
    summary.getRow(1).font = { bold: true }
  }
  for (const group of classes) {
    const base = group.name.replace(/[\\/*?:[\]]/g, '_').slice(0, 27) || '班级'
    let name = base, suffix = 2
    while (used.has(name.toLowerCase())) name = `${base}-${suffix++}`
    used.add(name.toLowerCase())
    const sheet = workbook.addWorksheet(name)
    formatSheet(sheet)
    sheet.getColumn(10).numFmt = '@'
    const students = [...group.students].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN'))
    for (const student of students) {
      const row = sheet.addRow([group.name, student.name, '', student.score, ...student.mottos, student.gender, student.avatar ? '独立角色' : '默认角色', student.nameTag ?? '', student.avatar?.startsWith('/images/leaderboard/materials/') ? student.avatar : '', student.personality ?? '', student.hobbies ?? ''])
      row.height = 62
      row.alignment = { vertical: 'middle', wrapText: true }
      row.font = { name: 'Arial', size: 11 }
      row.getCell(4).numFmt = '0'
      let avatar = student.avatar || (student.gender === '女' ? defaultGirlAvatar : defaultAvatar)
      if (avatar?.startsWith('/images/leaderboard/materials/')) {
        const response = await fetch(avatar)
        if (!response.ok) throw new Error(`角色图片加载失败：${student.name}`)
        avatar = bytesToDataUrl(new Uint8Array(await response.arrayBuffer()), 'png')
      }
      if (avatar) {
        const id = workbook.addImage({ base64: avatar, extension: avatar.startsWith('data:image/jpeg') ? 'jpeg' : 'png' })
        sheet.addImage(id, { tl: { col: 2.1, row: row.number - .9 }, ext: { width: 66, height: 66 }, editAs: 'oneCell' })
      }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
