/**
 * Windows 便携版：不生成 NSIS/MSI 安装包，只打可解压运行的 zip。
 *
 * 用法：
 * - Windows（推荐）：已加载 MSVC 的终端执行 `npm run build:portable`
 * - macOS / Linux 交叉编译：需已安装 `cargo-xwin` 与
 *   `rustup target add x86_64-pc-windows-msvc`，再执行同一命令
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const conf = JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
const productName = conf.productName || 'dili'
const version = conf.version || '0.1.0'

const winTarget = 'x86_64-pc-windows-msvc'
const cross = process.platform !== 'win32'
const releaseDir = cross
  ? path.join(root, 'src-tauri/target', winTarget, 'release')
  : path.join(root, 'src-tauri/target/release')
const staging = path.join(root, 'dist-portable', `${productName}-windows-portable`)
const outZip = path.join(root, 'dist-portable', `${productName}-${version}-windows-portable.zip`)

// 构建清理不能删除运行便携版时产生的用户数据，也不能把它打进分发包。
if (existsSync(path.join(staging, 'data'))) {
  throw new Error('便携目录中已有用户数据，请先将整个 data 文件夹移到安全位置，再重新打包。')
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: root, ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function hasBin(name) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    encoding: 'utf8',
    shell: true,
  })
  return r.status === 0
}

if (cross) {
  if (!hasBin('cargo-xwin')) {
    console.error('当前非 Windows：交叉编译需要 cargo-xwin。请先执行：')
    console.error('  cargo install cargo-xwin')
    console.error('  rustup target add x86_64-pc-windows-msvc')
    process.exit(1)
  }
  // macOS Homebrew llvm 为 keg-only，tauri-winres 需要 llvm-rc
  const llvmBins = ['/opt/homebrew/opt/llvm/bin', '/usr/local/opt/llvm/bin']
  for (const bin of llvmBins) {
    if (existsSync(path.join(bin, 'llvm-rc'))) {
      process.env.PATH = `${bin}${path.delimiter}${process.env.PATH || ''}`
      break
    }
  }
  if (!hasBin('llvm-rc')) {
    console.error('交叉编译还需要 llvm-rc（tauri-winres）。请先执行：')
    console.error('  brew install llvm')
    console.error('  export PATH="/opt/homebrew/opt/llvm/bin:$PATH"')
    process.exit(1)
  }
  console.log(`→ 交叉编译 Windows（cargo-xwin / ${winTarget}，--no-bundle）`)
  run('npm', [
    'run',
    'tauri',
    '--',
    'build',
    '--runner',
    'cargo-xwin',
    '--target',
    winTarget,
    '--no-bundle',
  ])
} else {
  console.log('→ tauri build --no-bundle（仅 exe，不写注册表）')
  run('npm', ['run', 'tauri', '--', 'build', '--no-bundle'])
}

const exeName = `${productName}.exe`
const exePath = path.join(releaseDir, exeName)
const exeFallback = path.join(releaseDir, 'dili.exe')
const exe = existsSync(exePath) ? exePath : existsSync(exeFallback) ? exeFallback : null
if (!exe) {
  console.error(`未找到可执行文件：${exePath} 或 ${exeFallback}`)
  process.exit(1)
}

rmSync(path.join(root, 'dist-portable'), { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

const finalExe = path.join(staging, path.basename(exe))
copyFileSync(exe, finalExe)

for (const name of readdirSync(releaseDir)) {
  if (/\.dll$/i.test(name)) {
    copyFileSync(path.join(releaseDir, name), path.join(staging, name))
  }
}

const resources = path.join(releaseDir, 'resources')
if (existsSync(resources)) {
  cpSync(resources, path.join(staging, 'resources'), { recursive: true })
}

writeFileSync(
  path.join(staging, '使用说明.txt'),
  [
    `${productName} ${version} · Windows 便携版`,
    '',
    '用法：解压到任意文件夹，双击运行「' + path.basename(exe) + '」。',
    '无需安装、不写开始菜单/注册表；可放 U 盘随身带。',
    '班级、分数、设置及自定义素材自动保存在 exe 同级 data/leaderboard.json。',
    '迁移时请携带 exe 和整个 data 文件夹；只复制 exe 不会携带数据。',
    '首次在原电脑运行新版，会自动迁移该电脑上旧版本的攀登榜缓存。',
    '攀登榜 → 数据备份：导出/导入完整 JSON 数据，导入前会另行下载当前数据备份。',
    'data/leaderboard.json.bak 保存上一次成功写入前的数据；恢复时先保留现有文件。',
    '等待保存完成后关闭程序再拔出 U 盘；程序所在文件夹必须可写。',
    '',
    '系统要求：',
    '- Windows 10/11 x64',
    '- 已安装 Microsoft Edge WebView2 Runtime（Win10/11 多数已自带）',
    '  若窗口打不开，请安装：',
    '  https://developer.microsoft.com/microsoft-edge/webview2/',
    '',
    '说明：未代码签名时，首次运行可能被 SmartScreen 拦截，',
    '点「更多信息」→「仍要运行」即可。',
    '',
  ].join('\n'),
  'utf8',
)

mkdirSync(path.dirname(outZip), { recursive: true })
if (existsSync(outZip)) rmSync(outZip)

function zipStaging() {
  // Windows: PowerShell（中文路径友好）
  if (process.platform === 'win32') {
    const ps = `
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath '${outZip.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${outZip.replace(/'/g, "''")}' -Force }
Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force
`
    const zip = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })
    if (zip.status === 0) return true
    console.error('Compress-Archive 失败，尝试 tar…')
  }

  // macOS: ditto 生成可被资源管理器打开的 zip
  if (process.platform === 'darwin') {
    const ditto = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', staging, outZip], {
      stdio: 'inherit',
    })
    if (ditto.status === 0) return true
  }

  // 通用兜底：bsdtar / GNU tar 的 zip 后端
  const tar = spawnSync('tar', ['-a', '-cf', outZip, '-C', path.dirname(staging), path.basename(staging)], {
    stdio: 'inherit',
  })
  return tar.status === 0
}

if (!zipStaging()) {
  console.error('打包 zip 失败')
  process.exit(1)
}

console.log('')
console.log('便携包已生成：')
console.log(' ', outZip)
console.log('解压目录预览：')
console.log(' ', staging)
