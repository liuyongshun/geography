/**
 * Rive 模型契约。美术在 Rive 编辑器中应按这个名称导出状态机和触发器，
 * 这样教学流程无需了解模型的具体分层或骨骼结构。
 */
export const frostExplorerRive = {
  src: '/pets/frost-explorer/frost-explorer.riv',
  stateMachine: 'PetBrain',
  triggers: {
    greeting: 'greeting',
    success: 'success',
    lessonComplete: 'lessonComplete',
    reminder: 'reminder',
    sleep: 'sleep',
    wake: 'wake',
  },
} as const

export type FrostExplorerTrigger = keyof typeof frostExplorerRive.triggers
