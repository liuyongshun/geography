import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/** 画布全屏根节点标记（Fullscreen 作用在此元素上） */
export const DILI_CANVAS_ATTR = 'data-dili-canvas'

/** 全屏时隐藏的 UI（工具条 / HUD / 角标等） */
export const DILI_CHROME_ATTR = 'data-dili-chrome'

export function findCanvasStage(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${DILI_CANVAS_ATTR}]`)
}

function fsElement(): Element | null {
  return (
    document.fullscreenElement ??
    (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ??
    null
  )
}

/** 通知 Three / SVG 宿主按新尺寸重绘 */
export function bumpViewportResize() {
  window.dispatchEvent(new Event('resize'))
  // 部分宿主只听自身 ResizeObserver；再补一帧
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
}

export async function enterCanvasFullscreen(el?: HTMLElement | null) {
  const target = el ?? findCanvasStage()
  if (!target) return false
  const any = target as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  if (target.requestFullscreen) await target.requestFullscreen()
  else if (any.webkitRequestFullscreen) await any.webkitRequestFullscreen()
  else return false
  bumpViewportResize()
  return true
}

export async function exitCanvasFullscreen() {
  if (!fsElement()) return
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
  if (document.exitFullscreen) await document.exitFullscreen()
  else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
  bumpViewportResize()
}

export async function toggleCanvasFullscreen(el?: HTMLElement | null) {
  if (fsElement()) {
    await exitCanvasFullscreen()
    return false
  }
  return enterCanvasFullscreen(el)
}

export function isCanvasFullscreenActive() {
  const fs = fsElement()
  if (!fs) return false
  return fs instanceof HTMLElement && fs.hasAttribute(DILI_CANVAS_ATTR)
}

/** 响应式：当前是否处于画布全屏 */
export function useCanvasFullscreen(): {
  active: Ref<boolean>
  available: Ref<boolean>
  refreshAvailable: () => void
  toggle: () => Promise<void>
  enter: () => Promise<void>
  exit: () => Promise<void>
} {
  const active = ref(false)
  const available = ref(false)

  function refreshAvailable() {
    available.value = !!findCanvasStage()
    active.value = isCanvasFullscreenActive()
  }

  function onFsChange() {
    active.value = isCanvasFullscreenActive()
    bumpViewportResize()
  }

  async function toggle() {
    await toggleCanvasFullscreen()
    refreshAvailable()
  }

  async function enter() {
    await enterCanvasFullscreen()
    refreshAvailable()
  }

  async function exit() {
    await exitCanvasFullscreen()
    refreshAvailable()
  }

  onMounted(() => {
    refreshAvailable()
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange as EventListener)
  })

  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', onFsChange)
    document.removeEventListener('webkitfullscreenchange', onFsChange as EventListener)
  })

  return { active, available, refreshAvailable, toggle, enter, exit }
}
