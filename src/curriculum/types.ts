export type TutorialStatus = 'ready' | 'planned'
export type TutorialKind = 'lab' | 'process' | 'concept' | 'diagram' | 'compare' | 'case' | 'map' | 'timeline' | 'review'

export interface Tutorial {
  id: string
  title: string
  status: TutorialStatus
  kind: TutorialKind
  minutes: number
  objectives: string[]
  labPath?: string
}

export interface Section {
  id: string
  title: string
  tutorials: Tutorial[]
}

export interface Chapter {
  id: string
  no: string
  title: string
  sections: Section[]
}

export interface Book {
  id: string
  code: string
  title: string
  focus: string
  chapters: Chapter[]
}

export interface Grade {
  id: string
  label: string
  summary: string
  books: Book[]
}

export interface Curriculum {
  edition: string
  publisher: string
  standard: string
  grades: Grade[]
}

export interface TutorialRef {
  tutorial: Tutorial
  grade: Grade
  book: Book
  chapter: Chapter
  section: Section
}

export function findTutorial(curriculum: Curriculum, tutorialId: string): TutorialRef | null {
  for (const grade of curriculum.grades) {
    for (const book of grade.books) {
      for (const chapter of book.chapters) {
        for (const section of chapter.sections) {
          const tutorial = section.tutorials.find((t) => t.id === tutorialId)
          if (tutorial) return { tutorial, grade, book, chapter, section }
        }
      }
    }
  }
  return null
}

export function countTutorials(book: Book): { ready: number; total: number } {
  let ready = 0
  let total = 0
  for (const chapter of book.chapters) {
    for (const section of chapter.sections) {
      for (const t of section.tutorials) {
        total += 1
        if (t.status === 'ready') ready += 1
      }
    }
  }
  return { ready, total }
}

export const KIND_LABEL: Record<TutorialKind, string> = {
  lab: '交互实验',
  process: '过程动画',
  concept: '概念精讲',
  diagram: '示意构图',
  compare: '对比辨析',
  case: '案例分析',
  map: '读图训练',
  timeline: '时间轴',
  review: '复习专题',
}
