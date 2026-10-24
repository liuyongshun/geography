<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

withDefaults(defineProps<{ align?: 'left' | 'right' }>(), {
  align: 'right',
})

const route = useRoute()
const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)

const entries = [
  {
    name: 'home',
    title: '课程目录',
    note: '按教材与章节浏览',
    icon: 'catalog',
  },
  {
    name: 'knowledge-summary',
    title: '知识总结',
    note: '自动生成思维导图',
    icon: 'mindmap',
  },
  {
    name: 'lab',
    title: '地球预览',
    note: '进入交互式地球实验',
    icon: 'globe',
  },
  {
    name: 'resources',
    title: '开源资源',
    note: '查看项目与素材资源',
    icon: 'resource',
  },
] as const

const activeEntry = computed(() => {
  if (route.name === 'demo' || route.name === 'tutorial') return 'home'
  return route.name
})

function close() {
  open.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuRef.value?.contains(event.target as Node)) close()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="menuRef" class="utility-menu" :class="`align-${align}`">
    <button
      type="button"
      class="menu-trigger"
      :class="{ on: open }"
      aria-label="打开功能菜单"
      title="更多功能"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <span v-for="n in 9" :key="n" />
    </button>

    <Transition name="menu-pop">
      <div v-if="open" class="menu-panel" role="menu">
        <div class="menu-heading">
          <strong>功能导航</strong>
          <span>快速前往</span>
        </div>
        <nav class="menu-grid">
          <RouterLink
            v-for="entry in entries"
            :key="entry.name"
            class="menu-item"
            :class="{ active: activeEntry === entry.name }"
            :to="{ name: entry.name }"
            role="menuitem"
            @click="close"
          >
            <span class="entry-icon" aria-hidden="true">
              <svg v-if="entry.icon === 'catalog'" viewBox="0 0 24 24">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
              </svg>
              <svg v-else-if="entry.icon === 'mindmap'" viewBox="0 0 24 24">
                <rect x="9" y="3" width="6" height="5" rx="1.5" /><rect x="3" y="16" width="6" height="5" rx="1.5" /><rect x="15" y="16" width="6" height="5" rx="1.5" /><path d="M12 8v4m-6 4v-2h12v2" />
              </svg>
              <svg v-else-if="entry.icon === 'globe'" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3c2.4 2.5 3.5 5.5 3.5 9S14.4 18.5 12 21c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3Z" />
              </svg>
              <svg v-else viewBox="0 0 24 24">
                <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M9 9h6m-6 4h6m-6 4h4" />
              </svg>
            </span>
            <span class="entry-copy">
              <strong>{{ entry.title }}</strong>
              <small>{{ entry.note }}</small>
            </span>
            <span v-if="activeEntry === entry.name" class="active-dot" />
          </RouterLink>
        </nav>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.utility-menu {
  position: relative;
  margin-left: auto;
}
.menu-trigger {
  width: 32px;
  height: 32px;
  display: grid;
  grid-template-columns: repeat(3, 3px);
  grid-template-rows: repeat(3, 3px);
  place-content: center;
  gap: 3px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}
.menu-trigger span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--knowledge-muted);
}
.menu-trigger:hover,
.menu-trigger.on {
  border-color: var(--knowledge-active);
  background: rgb(99 184 255 / 11%);
}
.menu-trigger:hover {
  transform: translateY(-1px);
}
.menu-trigger.on span {
  background: var(--knowledge-active);
}
.menu-panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 9px);
  right: 0;
  width: 310px;
  padding: 12px;
  border: 1px solid rgba(99, 184, 255, 0.22);
  border-radius: 14px;
  background: rgba(10, 17, 31, 0.97);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.46), 0 0 22px rgba(74, 163, 217, 0.08);
  backdrop-filter: blur(18px);
}
.menu-panel::before {
  content: '';
  position: absolute;
  top: -5px;
  right: 11px;
  width: 9px;
  height: 9px;
  border-left: 1px solid rgba(99, 184, 255, 0.22);
  border-top: 1px solid rgba(99, 184, 255, 0.22);
  background: #0a111f;
  transform: rotate(45deg);
}
.align-left .menu-panel {
  right: auto;
  left: 0;
}
.align-left .menu-panel::before {
  right: auto;
  left: 11px;
}
.menu-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 2px 3px 10px;
}
.menu-heading strong {
  color: var(--knowledge-title);
  font-size: 13px;
}
.menu-heading span {
  color: var(--knowledge-faint);
  font-size: 10px;
}
.menu-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.menu-item {
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: 9px;
  align-items: center;
  padding: 10px 9px;
  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 10px;
  color: var(--knowledge-body);
  background: rgba(255, 255, 255, 0.025);
  text-decoration: none;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}
.menu-item:hover {
  transform: translateY(-1px);
  border-color: rgba(99, 184, 255, 0.38);
  background: rgba(99, 184, 255, 0.08);
}
.menu-item.active {
  border-color: rgba(99, 184, 255, 0.48);
  background: rgba(99, 184, 255, 0.1);
}
.entry-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--knowledge-active);
  background: rgba(99, 184, 255, 0.1);
}
.entry-icon svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.entry-icon svg rect,
.entry-icon svg:first-child path {
  fill: rgba(99, 184, 255, 0.08);
}
.entry-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.entry-copy strong {
  color: var(--knowledge-title);
  font-size: 12px;
  line-height: 1.2;
}
.entry-copy small {
  overflow: hidden;
  color: var(--knowledge-faint);
  font-size: 9px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.active-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--knowledge-active);
  box-shadow: 0 0 7px var(--knowledge-active);
}
.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
  transform-origin: top right;
}
.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.98);
}
@media (max-width: 620px) {
  .menu-panel {
    width: min(310px, calc(100vw - 24px));
    right: -4px;
  }
}
</style>
