<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="landing">
    <section class="hero">
      <p class="eyebrow">地理过程动画 · 第一专题</p>
      <h1>把气压带风带做成可播放、可拖参数、可点击的双视图</h1>
      <p class="lead">
        不是地图产品。同一套场景状态同时驱动 3D 环流与课本式扁平图：直射点滑动、地转偏向开关、剖开地球，授课与学生探究共用一课内容包。
      </p>
      <div class="cta">
        <el-button type="primary" size="large" @click="router.push('/courses')">进入湘教版课程</el-button>
        <el-button size="large" class="ghost" @click="router.push('/lab/atmosphere-belts-winds')">直达气压带风带实验</el-button>
      </div>
    </section>

    <section class="grid">
      <article>
        <h2>3D 动画</h2>
        <p>空气质点沿三圈环流运动，色带表示气压带，直射光线随月份移动。可剖开球体，对照剖面。</p>
      </article>
      <article>
        <h2>扁平交互</h2>
        <p>七带六风、考试图式箭头。点击名称与 3D 同步高亮，悬停显示课标用语。</p>
      </article>
      <article>
        <h2>内容包驱动</h2>
        <p>课步写在 <code>content/atmosphere/</code>：旁白、允许的交互、探究题。改课不必改 Three 场景。</p>
      </article>
    </section>

    <section class="install">
      <h2>网站与桌面分发</h2>
      <p>
        本仓库是独立产品：网页与桌面共用同一套 Vue 前端，桌面用 Tauri 打包，不含排课或地图。
      </p>
      <ul>
        <li>网页：<code>npm run dev</code> → <code>http://localhost:1430</code>（<code>#/</code> 产品页，<code>#/courses</code> 湘教版导航，<code>#/lab/...</code> 实验）。</li>
        <li>桌面：<code>npm run tauri build</code>，产出 dmg / nsis / msi。</li>
        <li>离线：不依赖瓦片地图与实时气象，教室弱网可上课。</li>
      </ul>
    </section>

    <section class="legal">
      <h2>科学与版权边界</h2>
      <p>教学示意模型，非实时天气、非真实地形图。几何与箭头为自绘，未复制教材插图。中学生使用无需账号。</p>
    </section>

    <p class="palette-note">
      界面配色：墨蓝观测台（天空蓝 · 沙金）
    </p>
  </div>
</template>

<style scoped>
.landing {
  max-width: 860px;
  margin: 0 auto;
  padding: 36px 28px 64px;
  min-height: 100%;
  background:
    radial-gradient(ellipse 80% 50% at 20% -10%, rgba(74, 163, 217, 0.2), transparent 55%),
    radial-gradient(ellipse 60% 40% at 90% 10%, rgba(232, 184, 74, 0.08), transparent 50%),
    var(--bg-app);
}
.hero {
  padding: 8px 0 12px;
}
.eyebrow {
  color: var(--primary-mid);
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
  letter-spacing: 0.04em;
}
h1 {
  margin: 0 0 12px;
  font-size: 28px;
  line-height: 1.3;
  color: var(--text-900);
}
.lead {
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-700);
}
.cta {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
.ghost {
  --el-button-bg-color: transparent;
  --el-button-border-color: var(--c-steel);
  --el-button-text-color: var(--text-700);
  --el-button-hover-bg-color: var(--bg-subtle);
  --el-button-hover-border-color: var(--primary);
  --el-button-hover-text-color: var(--primary-mid);
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin: 36px 0;
}
article {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
article h2 {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--primary-mid);
}
article p {
  margin: 0;
  font-size: 13px;
  color: var(--text-500);
  line-height: 1.6;
}
.install,
.legal {
  margin-top: 28px;
}
.install h2,
.legal h2 {
  font-size: 16px;
  color: var(--text-900);
}
.install p,
.legal p,
.install li {
  font-size: 14px;
  color: var(--text-700);
  line-height: 1.65;
}
code {
  font-size: 12px;
  background: var(--bg-subtle);
  color: var(--primary-mid);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
}
.palette-note {
  margin-top: 40px;
  font-size: 12px;
  color: var(--text-400);
}
.palette-note a {
  color: var(--primary);
}
@media (max-width: 800px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
