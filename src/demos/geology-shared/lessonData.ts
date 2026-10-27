export const ROCK_PHASES = [
  { title: '岩浆上升', note: '地下岩浆沿裂隙向上运移，部分侵入地壳，部分喷出地表。', label: '地下熔融物质', x: 42, y: 76 },
  { title: '冷却凝固', note: '岩浆在地下冷却可形成花岗岩；喷出地表冷却可形成玄武岩。', label: '岩浆岩形成', x: 62, y: 32 },
  { title: '外力作用', note: '各类岩石经风化、侵蚀、搬运，形成沉积物并堆积。', label: '风化 · 侵蚀 · 搬运 · 堆积', x: 79, y: 41 },
  { title: '固结成岩', note: '沉积物经过压实、胶结等固结成岩作用，形成沉积岩。', label: '沉积岩形成', x: 76, y: 62 },
  { title: '变质作用', note: '原有岩石在一定温度、压力等条件下改变矿物成分或结构，形成变质岩。', label: '高温、高压等条件', x: 61, y: 71 },
  { title: '重熔再生', note: '岩石进入地壳深部或地幔适宜环境，可重新熔融，成为岩浆。', label: '重新熔融为岩浆', x: 40, y: 82 },
]

export const ROCK_TYPES = [
  { id: 'igneous', name: '岩浆岩', en: 'IGNEOUS', texture: 'igneous-color.jpg', color: '#f1a16b', how: '岩浆冷却凝固', detail: '地下侵入：花岗岩；喷出地表：玄武岩。部分喷出岩具有气孔构造。', examples: '花岗岩 · 玄武岩', clue: '判断成因：来自岩浆的冷却结晶' },
  { id: 'sedimentary', name: '沉积岩', en: 'SEDIMENTARY', texture: 'strata-color.jpg', color: '#e2c185', how: '沉积物固结成岩', detail: '常见层理构造；有些含化石，是研究地质历史的重要依据。', examples: '砂岩 · 页岩 · 石灰岩', clue: '判断特征：层理构造、化石' },
  { id: 'metamorphic', name: '变质岩', en: 'METAMORPHIC', texture: 'gneiss-color.jpg', color: '#bea4e6', how: '原有岩石发生变质作用', detail: '石灰岩变质形成大理岩；石英砂岩变质形成石英岩。变质过程通常保持固态。', examples: '大理岩 · 石英岩 · 片麻岩', clue: '判断过程：高温、高压等，区别于重熔' },
] as const

export const CYCLE_NODES = [
  { id: 'magma', name: '岩浆', x: 500, y: 80, color: '#ffad63', texture: 'lava-color.jpg' },
  { id: 'igneous', name: '岩浆岩', x: 810, y: 295, color: '#f1a16b', texture: 'igneous-color.jpg' },
  { id: 'sedimentary', name: '沉积岩', x: 500, y: 505, color: '#e2c185', texture: 'strata-color.jpg' },
  { id: 'metamorphic', name: '变质岩', x: 190, y: 295, color: '#bea4e6', texture: 'gneiss-color.jpg' },
]

export const CYCLE_ACTIONS = [
  { id: 'all', name: '完整循环', color: '#a7c8e4', note: '点击一种作用，单独观察它连接的岩石类型。三类岩石在适宜条件下可以相互转化。' },
  { id: 'cool', name: '冷却凝固', color: '#86d3f4', note: '岩浆冷却凝固形成岩浆岩。岩浆不能直接形成沉积岩或变质岩。' },
  { id: 'external', name: '外力作用', color: '#e7c280', note: '各类岩石可经风化、侵蚀、搬运、堆积，再经过固结成岩作用形成沉积岩。' },
  { id: 'meta', name: '变质作用', color: '#c0abe8', note: '岩浆岩、沉积岩等原有岩石在适宜温度、压力等条件下发生变质；通常保持固态。' },
  { id: 'melt', name: '重熔再生', color: '#f2937c', note: '三类岩石在适宜条件下都可重新熔融成为岩浆。重熔再生与变质作用不同。' },
] as const

export const CYCLE_EDGES = [
  { id: 'cool', path: 'M 574 98 Q 788 110 805 248', label: '冷却凝固', x: 752, y: 144 },
  { id: 'external', path: 'M 808 341 Q 795 484 577 503', label: '外力作用 · 固结成岩', x: 760, y: 438 },
  { id: 'external', path: 'M 194 341 Q 208 484 423 503', label: '外力作用 · 固结成岩', x: 240, y: 438 },
  { id: 'meta', path: 'M 735 279 Q 500 214 265 279', label: '变质作用', x: 500, y: 246 },
  { id: 'meta', path: 'M 427 483 Q 306 421 238 339', label: '变质作用', x: 345, y: 400 },
  { id: 'melt', path: 'M 193 248 Q 211 112 425 98', label: '重熔再生', x: 248, y: 144 },
  { id: 'melt', path: 'M 755 252 Q 663 134 568 118', label: '重熔再生', x: 641, y: 189 },
  { id: 'melt', path: 'M 500 460 L 500 125', label: '重熔再生', x: 535, y: 354 },
]
