import { spawn } from 'node:child_process'
import net from 'node:net'

const port = Number(process.env.PORT || 1430)

function isListening(host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
  })
}

const busy = (await isListening('127.0.0.1')) || (await isListening('::1'))
if (busy) {
  console.log(`[dev] 检测到 localhost:${port} 已在运行，复用现有 Vite，跳过重复启动`)
  process.exit(0)
}

const child = spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
