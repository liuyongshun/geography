<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type Student = { id: string; name: string; score: number; color: string }

const STORAGE_KEY = 'dili-everest-leaderboard-v1'
const colors = ['#5dd7ff', '#ffc95d', '#ff8e97', '#b394ff', '#73e0ac', '#ff9ed5']
const sampleNames = ['林星辰', '陈知远', '周语桐', '王子墨', '李沐阳', '赵安然', '孙晓彤', '刘子航', '黄诗涵', '吴乐言']

function makeSample(): Student[] {
  return sampleNames.map((name, index) => ({
    id: `sample-${index}`,
    name,
    score: [28, 24, 20, 17, 15, 13, 11, 9, 7, 5][index],
    color: colors[index % colors.length],
  }))
}

function loadStudents(): Student[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved) as Student[]
  } catch {
    // 忽略损坏的本地缓存，回退到示例班级。
  }
  return makeSample()
}

const students = ref<Student[]>(loadStudents())
const selectedId = ref(students.value[0]?.id ?? '')
const newName = ref('')
const importMessage = ref('')
const frame = ref(0)
const boostedId = ref('')
let frameTimer = 0
let boostTimer = 0

const ranked = computed(() => [...students.value].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN')))
const selected = computed(() => students.value.find((student) => student.id === selectedId.value) ?? ranked.value[0])
const maxScore = computed(() => Math.max(30, ...students.value.map((student) => student.score)))
const classTotal = computed(() => students.value.reduce((sum, student) => sum + student.score, 0))

watch(students, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), { deep: true })

onMounted(() => {
  frameTimer = window.setInterval(() => { frame.value = (frame.value + 1) % 8 }, 330)
})
onBeforeUnmount(() => {
  window.clearInterval(frameTimer)
  window.clearTimeout(boostTimer)
})

function addStudent(name = newName.value) {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = students.value.find((student) => student.name === trimmed)
  if (existing) {
    selectedId.value = existing.id
    importMessage.value = `“${trimmed}”已在榜单中`
    return
  }
  const student = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: trimmed,
    score: 0,
    color: colors[students.value.length % colors.length],
  }
  students.value.push(student)
  selectedId.value = student.id
  newName.value = ''
  importMessage.value = `已加入 ${trimmed}`
}

function addPoint(student: Student | undefined) {
  if (!student) return
  student.score += 1
  selectedId.value = student.id
  boostedId.value = student.id
  window.clearTimeout(boostTimer)
  boostTimer = window.setTimeout(() => { boostedId.value = '' }, 1000)
}

function parseRows(text: string) {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((row) => row.trim()).filter(Boolean)
  const names: string[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index].split(/[，,\t]/).map((cell) => cell.trim())
    const first = cells[0]
    if (!first || (index === 0 && /^(姓名|name|学生姓名)$/i.test(first))) continue
    names.push(first.replace(/^"|"$/g, ''))
  }
  return [...new Set(names)]
}

async function importStudents(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!/\.(csv|txt)$/i.test(file.name)) {
    importMessage.value = '请将 Excel 另存为 CSV 后导入（首列为“姓名”）。'
    input.value = ''
    return
  }
  const names = parseRows(await file.text())
  const before = students.value.length
  names.forEach((name) => addStudent(name))
  importMessage.value = names.length ? `已读取 ${names.length} 个姓名，新增 ${students.value.length - before} 位同学` : '未识别到姓名，请检查第一列。'
  input.value = ''
}

function resetClass() {
  if (!window.confirm('将恢复为示例班级，当前本地数据会被覆盖。')) return
  students.value = makeSample()
  selectedId.value = students.value[0].id
  importMessage.value = '已恢复示例班级'
}

function positionFor(student: Student, index: number) {
  const progress = student.score / maxScore.value
  const lane = index % 5
  return {
    bottom: `${8 + progress * 73}%`,
    left: `${42 + (lane - 2) * (7 + (1 - progress) * 4)}%`,
    zIndex: Math.round(progress * 100),
  }
}

function spriteStyle(offset = 0) {
  const current = (frame.value + offset) % 8
  const x = current % 4
  const y = Math.floor(current / 4)
  return { backgroundPosition: `${x * 33.333}% ${y * 100}%` }
}
</script>

<template>
  <main class="leaderboard-page">
    <header class="hero">
      <div>
        <p class="eyebrow">CLASSROOM QUEST · 2026</p>
        <h1>珠峰攀登榜</h1>
        <p class="subtitle">每一次认真作答，都让小队离峰顶更近一点。</p>
      </div>
      <div class="hero-stats" aria-label="班级数据">
        <div><strong>{{ students.length }}</strong><span>攀登队员</span></div>
        <div><strong>{{ classTotal }}</strong><span>累计星光</span></div>
        <div><strong>{{ ranked[0]?.score ?? 0 }}</strong><span>当前最高分</span></div>
      </div>
    </header>

    <section class="game-grid">
      <section class="mountain-panel" aria-label="珠峰攀登进度">
        <div class="sky"><span class="moon" /><span class="star s1">✦</span><span class="star s2">✧</span><span class="star s3">✦</span></div>
        <div class="peak peak-back" />
        <div class="peak peak-main"><div class="snow-cap" /></div>
        <div class="summit"><span>8848 m</span><b>✦</b></div>
        <div class="route"><i v-for="point in 5" :key="point" :style="{ bottom: `${point * 17 + 5}%` }" /></div>
        <div class="basecamp"><span>BASE CAMP</span><small>0 m</small></div>

        <button
          v-for="(student, index) in ranked"
          :key="student.id"
          type="button"
          class="climber"
          :class="{ selected: selected?.id === student.id, boosted: boostedId === student.id }"
          :style="positionFor(student, index)"
          :title="`${student.name}，${student.score} 分`"
          @click="selectedId = student.id"
        >
          <span class="avatar" :style="spriteStyle(index)" />
          <span class="climber-name">{{ student.name }}</span>
          <span class="climber-score">{{ student.score }}</span>
        </button>
      </section>

      <aside class="control-panel">
        <div class="panel-title"><span>队员操作</span><small>点击山上的角色也可切换</small></div>
        <div v-if="selected" class="selected-card">
          <span class="large-avatar" :style="spriteStyle(0)" />
          <div><strong>{{ selected.name }}</strong><p>当前位于 {{ Math.round((selected.score / maxScore) * 100) }}% 海拔</p></div>
          <b>{{ selected.score }}<small>分</small></b>
        </div>
        <button class="point-button" type="button" :disabled="!selected" @click="addPoint(selected)">
          <span>＋1</span> 表现真棒，向上攀登
        </button>

        <div class="divider" />
        <label class="section-label" for="student-name">手动加入队员</label>
        <div class="add-row">
          <input id="student-name" v-model="newName" placeholder="输入学生姓名" @keydown.enter="addStudent()" />
          <button type="button" @click="addStudent()">加入</button>
        </div>
        <label class="import-card">
          <input type="file" accept=".csv,.txt,text/csv" @change="importStudents" />
          <span class="import-icon">↥</span><span><b>导入学生名单</b><small>Excel 另存为 CSV，首列为姓名</small></span>
        </label>
        <p v-if="importMessage" class="import-message">{{ importMessage }}</p>
        <button class="reset" type="button" @click="resetClass">恢复示例班级</button>
      </aside>
    </section>

    <section class="ranking-panel">
      <div class="ranking-head"><div><p class="eyebrow">LIVE RANKING</p><h2>今日攀登排行</h2></div><span>同分按姓名排序</span></div>
      <div class="ranking-list">
        <button v-for="(student, index) in ranked" :key="student.id" type="button" class="rank-row" :class="{ active: selected?.id === student.id }" @click="selectedId = student.id">
          <span class="rank-no" :class="{ podium: index < 3 }">{{ index + 1 }}</span>
          <span class="mini-avatar" :style="spriteStyle(index + 2)" />
          <strong>{{ student.name }}</strong>
          <span class="progress"><i :style="{ width: `${Math.min(100, (student.score / maxScore) * 100)}%`, background: student.color }" /></span>
          <b>{{ student.score }} <small>分</small></b>
          <span class="rank-add" @click.stop="addPoint(student)">＋1</span>
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.leaderboard-page { min-height: 100%; padding: clamp(20px, 3vw, 46px); background: radial-gradient(circle at 50% -20%, #224985 0, #0c1b39 38%, #071126 75%); color: #f8fbff; }
.hero { max-width: 1420px; margin: 0 auto 22px; display:flex; justify-content:space-between; gap:28px; align-items:end; }
.eyebrow { color:#8ed4ff; letter-spacing:.15em; font-size:11px; font-weight:800; }
h1 { font-size:clamp(34px,5vw,62px); letter-spacing:.04em; margin:6px 0; line-height:1; text-shadow:0 5px 20px rgba(84,183,255,.36); }
.subtitle { color:#b7d0ed; font-size:15px; }
.hero-stats { display:flex; gap:10px; }
.hero-stats div { min-width:112px; padding:12px 15px; border:1px solid rgba(181,224,255,.17); border-radius:16px; background:rgba(4,15,38,.42); backdrop-filter: blur(8px); }
.hero-stats strong { display:block; color:#fff0ad; font-size:22px; }.hero-stats span { color:#a8c7e2; font-size:11px; }
.game-grid { max-width:1420px; margin:auto; display:grid; grid-template-columns:minmax(0,1.65fr) minmax(300px,.7fr); gap:18px; }
.mountain-panel { position:relative; min-height:600px; overflow:hidden; border:1px solid rgba(184,227,255,.2); border-radius:26px; background:linear-gradient(#132e60 0%,#4876a9 47%,#9ac0db 72%,#d9ecf2 100%); box-shadow:0 20px 50px rgba(0,0,0,.26); isolation:isolate; }
.sky { position:absolute; inset:0 0 40% 0; background:linear-gradient(#10234d,#4e82b7); }.moon{position:absolute;top:9%;right:12%;width:52px;height:52px;border-radius:50%;background:#f8efb9;box-shadow:0 0 30px #fff5b5}.star{position:absolute;color:#fff5bd;font-size:22px}.s1{top:19%;left:15%}.s2{top:10%;left:36%}.s3{top:30%;right:28%}
.peak { position:absolute; bottom:7%; clip-path:polygon(50% 0,100% 100%,0 100%); }.peak-back{width:86%;height:73%;left:-18%;background:#496d91;opacity:.78}.peak-main{width:80%;height:87%;left:10%;background:linear-gradient(110deg,#587a96 0 46%,#284b70 46% 100%);filter:drop-shadow(0 10px 6px rgba(0,0,0,.2));}.snow-cap{position:absolute;inset:0;background:linear-gradient(135deg,transparent 42%,#f3fbff 42% 55%,transparent 55%),linear-gradient(225deg,transparent 46%,#dceaf1 46% 57%,transparent 57%);clip-path:polygon(50% 0,82% 42%,65% 34%,54% 44%,42% 31%,25% 42%);}
.summit { position:absolute; top:5.5%; left:48%; display:grid; place-items:center; color:#143965; text-align:center; font-size:10px; font-weight:900; z-index:2; }.summit b{font-size:26px;color:#fff1a7;filter:drop-shadow(0 0 8px #fff1a7)}
.route { position:absolute; inset:14% 0 8% 0; z-index:1; }.route::after{content:'';position:absolute;left:50%;bottom:0;width:3px;height:100%;background:repeating-linear-gradient(to top,#ffe394 0 8px,transparent 8px 17px);transform:skewX(-18deg);opacity:.8}.route i{position:absolute;left:48.2%;width:11px;height:11px;border-radius:50%;background:#ffe394;box-shadow:0 0 0 5px rgba(255,227,148,.18)}
.basecamp{position:absolute;bottom:0;left:0;right:0;height:10%;z-index:2;padding:15px 24px;background:linear-gradient(90deg,#24514c,#426747);color:#e6f3de;font-weight:900;letter-spacing:.12em;font-size:11px}.basecamp small{display:block;opacity:.75;margin-top:3px;letter-spacing:.04em}
.climber { position:absolute; transform:translate(-50%, 0); width:78px; border:0; background:transparent; cursor:pointer; display:grid; justify-items:center; transition:bottom .75s cubic-bezier(.17,.9,.32,1), filter .2s, transform .2s; padding:0; z-index:4; }.climber:hover,.climber.selected{transform:translate(-50%,-5px);filter:drop-shadow(0 0 12px rgba(255,255,255,.9))}.climber.boosted{animation:boost .6s ease-in-out 2}.avatar,.large-avatar,.mini-avatar{display:block;background-image:url('/images/leaderboard/chibi-climber-8frames.png');background-size:400% 200%;background-repeat:no-repeat}.avatar{width:62px;height:76px}.climber-name{max-width:92px;padding:2px 6px;border-radius:99px;background:rgba(6,19,41,.82);color:white;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.climber-score{position:absolute;right:0;top:56px;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#ffdc6d;color:#283247;font-size:10px;font-weight:900}
@keyframes boost{50%{transform:translate(-50%,-22px) scale(1.16)}}
.control-panel,.ranking-panel{border:1px solid rgba(184,227,255,.16);border-radius:22px;background:rgba(10,25,53,.78);box-shadow:0 18px 42px rgba(0,0,0,.18);}.control-panel{padding:22px}.panel-title{display:flex;justify-content:space-between;align-items:baseline;font-weight:800}.panel-title small{font-size:11px;color:#88a8c4;font-weight:400}.selected-card{display:flex;align-items:center;gap:10px;margin:18px 0 12px;padding:12px;border-radius:16px;background:rgba(98,177,233,.12);border:1px solid rgba(142,212,255,.18)}.large-avatar{width:64px;height:70px;flex:0 0 64px}.selected-card strong{font-size:17px}.selected-card p{color:#92b2cf;font-size:11px;margin-top:3px}.selected-card>b{margin-left:auto;color:#ffe18a;font-size:22px}.selected-card b small{font-size:11px;margin-left:2px}.point-button{width:100%;padding:14px;border:0;border-radius:14px;background:linear-gradient(135deg,#ffd86b,#f2a946);color:#483214;font-weight:900;font-size:14px;cursor:pointer;box-shadow:0 8px 22px rgba(238,171,57,.25)}.point-button span{font-size:21px;margin-right:6px}.point-button:active{transform:translateY(1px)}.divider{height:1px;background:rgba(184,227,255,.13);margin:22px 0}.section-label{display:block;color:#b9d4e8;font-size:12px;margin-bottom:8px}.add-row{display:flex;gap:8px}.add-row input{min-width:0;flex:1;border:1px solid #365271;border-radius:10px;background:#08162e;color:#eef7ff;padding:10px}.add-row button{border:0;border-radius:10px;background:#4b9bd0;color:#fff;padding:0 13px;font-weight:800;cursor:pointer}.import-card{display:flex;gap:10px;align-items:center;margin-top:13px;padding:11px;border:1px dashed #4b749b;border-radius:12px;color:#cde4f4;cursor:pointer}.import-card input{display:none}.import-card b,.import-card small{display:block}.import-card b{font-size:12px}.import-card small{font-size:10px;color:#789bb9;margin-top:3px}.import-icon{font-size:24px;color:#81cfff}.import-message{margin-top:8px;color:#a7d7a9;font-size:11px;line-height:1.4}.reset{margin-top:16px;border:0;background:transparent;color:#8fb0cb;font-size:11px;text-decoration:underline;cursor:pointer}
.ranking-panel{max-width:1420px;margin:18px auto 0;padding:20px}.ranking-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:15px}.ranking-head h2{font-size:22px;margin-top:3px}.ranking-head>span{color:#819fba;font-size:11px}.ranking-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.rank-row{display:grid;grid-template-columns:26px 40px minmax(60px,1fr) minmax(70px,1fr) 42px 34px;gap:8px;align-items:center;width:100%;padding:7px 9px;border:1px solid transparent;border-radius:13px;background:rgba(255,255,255,.035);color:#e8f4ff;text-align:left;cursor:pointer}.rank-row:hover,.rank-row.active{border-color:rgba(143,216,255,.34);background:rgba(77,160,214,.12)}.rank-no{color:#8ca9c3;text-align:center;font-weight:900}.rank-no.podium{color:#ffe28b}.mini-avatar{width:36px;height:40px}.rank-row strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.progress{height:6px;border-radius:6px;background:#203957;overflow:hidden}.progress i{display:block;height:100%;border-radius:inherit}.rank-row>b{color:#ffe18a;font-size:13px}.rank-row b small{font-size:10px;color:#a6c2d9}.rank-add{justify-self:end;padding:4px 7px;border-radius:7px;background:#295d8b;color:#dbf3ff;font-size:11px;font-weight:900}.rank-add:hover{background:#3878ae}
@media (max-width:900px){.hero{align-items:start;flex-direction:column}.game-grid{grid-template-columns:1fr}.hero-stats{width:100%}.hero-stats div{flex:1}.mountain-panel{min-height:520px}.ranking-list{grid-template-columns:1fr}}@media (max-width:560px){.leaderboard-page{padding:16px}.hero-stats div{min-width:0;padding:10px}.mountain-panel{min-height:460px}.climber{width:58px}.avatar{transform:scale(.8);transform-origin:bottom}.climber-name{font-size:9px}.rank-row{grid-template-columns:22px 34px minmax(45px,1fr) 44px 32px;gap:5px}.progress,.rank-add{display:none}}
</style>
