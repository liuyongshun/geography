<script setup lang="ts">
import { computed, ref } from 'vue'
import catalogJson from '@content/resources/open-geo.json'

type GeoResource = {
  name: string
  url: string
  desc: string
  kind: string
  license: string
  foreign: boolean
}

type Category = {
  id: string
  title: string
  blurb: string
  items: GeoResource[]
}

const catalog = catalogJson as {
  title: string
  lead: string
  disclaimer: string
  categories: Category[]
}

const region = ref<'all' | 'cn' | 'foreign'>('all')
const catId = ref('all')

const categories = computed(() => catalog.categories)

function matchRegion(item: GeoResource) {
  if (region.value === 'cn') return !item.foreign
  if (region.value === 'foreign') return item.foreign
  return true
}

const visible = computed(() => {
  return categories.value
    .filter((c) => catId.value === 'all' || c.id === catId.value)
    .map((c) => ({
      ...c,
      items: c.items.filter(matchRegion),
    }))
    .filter((c) => c.items.length > 0)
})

const counts = computed(() => {
  const items = categories.value.flatMap((c) => c.items)
  return {
    all: items.length,
    cn: items.filter((i) => !i.foreign).length,
    foreign: items.filter((i) => i.foreign).length,
  }
})

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="page">
    <header class="hero">
      <p class="eyebrow">学习导航 · 开源与公开数据</p>
      <h1>{{ catalog.title }}</h1>
      <p class="lead">{{ catalog.lead }}</p>
      <p class="note">{{ catalog.disclaimer }}</p>
    </header>

    <div class="filters">
      <div class="row">
        <span class="lab">范围</span>
        <button type="button" class="chip" :class="{ on: region === 'all' }" @click="region = 'all'">
          全部 {{ counts.all }}
        </button>
        <button type="button" class="chip" :class="{ on: region === 'cn' }" @click="region = 'cn'">
          国内 {{ counts.cn }}
        </button>
        <button type="button" class="chip foreign-chip" :class="{ on: region === 'foreign' }" @click="region = 'foreign'">
          国外 {{ counts.foreign }}
        </button>
      </div>
      <div class="row">
        <span class="lab">分类</span>
        <button type="button" class="chip" :class="{ on: catId === 'all' }" @click="catId = 'all'">全部分类</button>
        <button
          v-for="c in categories"
          :key="c.id"
          type="button"
          class="chip"
          :class="{ on: catId === c.id }"
          @click="catId = c.id"
        >
          {{ c.title }}
        </button>
      </div>
    </div>

    <section v-for="c in visible" :key="c.id" class="cat">
      <h2>{{ c.title }}</h2>
      <p class="blurb">{{ c.blurb }}</p>
      <div class="cards">
        <article v-for="item in c.items" :key="item.url" class="card" :class="{ abroad: item.foreign }">
          <div class="hd">
            <h3>{{ item.name }}</h3>
            <span v-if="item.foreign" class="badge-out">国外</span>
            <span v-else class="badge-in">国内</span>
          </div>
          <p class="kind">{{ item.kind }} · {{ item.license }}</p>
          <p class="desc">{{ item.desc }}</p>
          <button type="button" class="go" @click="openUrl(item.url)">打开站点 →</button>
        </article>
      </div>
    </section>

    <p v-if="!visible.length" class="empty">当前筛选没有条目，可改回「全部」。</p>
  </div>
</template>

<style scoped>
.page {
  padding: 22px 28px 48px;
  max-width: 1080px;
}
.eyebrow {
  margin: 0;
  font-size: 11px;
  color: var(--primary-mid);
  letter-spacing: 0.04em;
}
.hero h1 {
  margin: 6px 0 8px;
  font-size: 22px;
  color: var(--text-900);
}
.lead {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-700);
  max-width: 46em;
}
.note {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-400);
  max-width: 52em;
}
.filters {
  margin: 18px 0 8px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-surface);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.row + .row {
  margin-top: 10px;
}
.lab {
  font-size: 11px;
  color: var(--text-400);
  width: 36px;
  flex-shrink: 0;
}
.chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-500);
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 12px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--primary);
  color: var(--primary-mid);
  background: var(--primary-light);
  font-weight: 600;
}
.foreign-chip.on {
  border-color: #d4a017;
  color: #e8c35a;
  background: rgba(212, 160, 23, 0.12);
}
.cat {
  margin-top: 22px;
}
.cat h2 {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--text-900);
}
.blurb {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--text-400);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px 10px;
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card.abroad {
  border-color: rgba(212, 160, 23, 0.35);
  background: linear-gradient(180deg, rgba(212, 160, 23, 0.06), var(--bg-subtle) 42%);
}
.hd {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.hd h3 {
  margin: 0;
  flex: 1;
  font-size: 14px;
  font-weight: 650;
  color: var(--text-900);
  line-height: 1.35;
}
.badge-out,
.badge-in {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border-radius: 999px;
  padding: 2px 7px;
  line-height: 1.4;
}
.badge-out {
  color: #1a1408;
  background: #e8c35a;
}
.badge-in {
  color: var(--primary-mid);
  background: var(--primary-light);
  border: 1px solid var(--primary);
}
.kind {
  margin: 0;
  font-size: 11px;
  color: var(--text-400);
}
.desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-700);
  flex: 1;
}
.go {
  align-self: flex-start;
  margin-top: 4px;
  border: 0;
  background: transparent;
  color: var(--primary-mid);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.go:hover {
  text-decoration: underline;
}
.empty {
  margin-top: 28px;
  font-size: 13px;
  color: var(--text-400);
}
</style>
