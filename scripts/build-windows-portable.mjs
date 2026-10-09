/**
 * Windows 便携版：不生成 NSIS/MSI 安装包，只打可解压运行的 zip。
 * 用法：在已加载 MSVC 环境的终端执行 `npm run build:portable`
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

const releaseDir = path.join(root, 'src-tauri/target/release')
const staging = path.join(root, 'dist-portable', `${productName}-windows-portable`)
const outZip = path.join(root, 'dist-portable', `${productName}-${version}-windows-portable.zip`)

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: root, ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log('→ tauri build --no-bundle（仅 exe，不装注册）')
run('npm', ['run', 'tauri', '--', 'build', '--no-bundle'])

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

// Prefer PowerShell Compress-Archive (可用中文路径)
const ps = `
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath '${outZip.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${outZip.replace(/'/g, "''")}' -Force }
Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force
`
const zip = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })
if (zip.status !== 0) {
  // fallback: try bestzip / native via require('child_process') tar if available
  console.error('Compress-Archive 失败，尝试 tar…')
  run('tar', ['-a', '-cf', outZip, '-C', staging, '.'])
}

console.log('')
console.log('便携包已生成：')
console.log(' ', outZip)
console.log('解压目录预览：')
console.log(' ', staging)
