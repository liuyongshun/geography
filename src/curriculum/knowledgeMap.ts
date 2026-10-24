import type { Book, Chapter, Grade, Section, Tutorial } from './types'

export type KnowledgeNodeKind = 'grade' | 'book' | 'chapter' | 'section' | 'tutorial' | 'point'

export interface KnowledgeNode {
  id: string
  name: string
  kind: KnowledgeNodeKind
  note?: string
  children?: KnowledgeNode[]
}

function tutorialNode(tutorial: Tutorial): KnowledgeNode {
  return {
    id: tutorial.id,
    name: tutorial.title,
    kind: 'tutorial',
    note: `${tutorial.minutes} 分钟 · ${tutorial.status === 'ready' ? '已上线' : '筹备中'}`,
    children: tutorial.objectives.map((objective, index) => ({
      id: `${tutorial.id}-point-${index}`,
      name: objective,
      kind: 'point',
    })),
  }
}

function sectionNode(section: Section): KnowledgeNode {
  return {
    id: section.id,
    name: section.title,
    kind: 'section',
    children: section.tutorials.map(tutorialNode),
  }
}

export function chapterKnowledgeTree(chapter: Chapter): KnowledgeNode {
  return {
    id: chapter.id,
    name: `${chapter.no} ${chapter.title}`,
    kind: 'chapter',
    children: chapter.sections.map(sectionNode),
  }
}

export function bookKnowledgeTree(book: Book): KnowledgeNode {
  return {
    id: book.id,
    name: `${book.code} · ${book.title}`,
    kind: 'book',
    note: book.focus,
    children: book.chapters.map(chapterKnowledgeTree),
  }
}

export function gradeKnowledgeTree(grade: Grade): KnowledgeNode {
  return {
    id: grade.id,
    name: `${grade.label}地理`,
    kind: 'grade',
    note: grade.summary,
    children: grade.books.map(bookKnowledgeTree),
  }
}

export function knowledgeStats(root: KnowledgeNode) {
  const result = { books: 0, chapters: 0, tutorials: 0, points: 0 }
  const visit = (node: KnowledgeNode) => {
    if (node.kind === 'book') result.books += 1
    if (node.kind === 'chapter') result.chapters += 1
    if (node.kind === 'tutorial') result.tutorials += 1
    if (node.kind === 'point') result.points += 1
    node.children?.forEach(visit)
  }
  visit(root)
  return result
}
