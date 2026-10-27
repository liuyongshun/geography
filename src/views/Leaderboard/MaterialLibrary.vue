<script setup lang="ts">
import { computed, ref } from 'vue'
import { normalizeAvatar } from './leaderboardExcel'
import { saveCustomMaterials, type Material } from './materialLibrary'
import { makeId, studentLabel, type Student } from './leaderboardData'

const props = defineProps<{ materials: Material[]; students: Student[]; selected?: Student; ready: boolean }>()
const emit = defineEmits<{ close: []; add: [items: Material[]]; bind: [src: string]; random: []; randomAll: [] }>()
const gender = ref<Material['gender'] | '全部'>('全部')
const uploadGender = ref<Material['gender']>('通用')
const notice = ref(''), busy = ref(false)
const visible = computed(() => props.materials.filter(item => gender.value === '全部' || item.gender === gender.value))
const owner = (src: string) => props.students.find(student => student.avatar === src && student.id !== props.selected?.id)
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  if (!files.length) return
  busy.value = true
  const category = uploadGender.value, additions: Material[] = [], errors: string[] = []
  let duplicates = 0
  try {
    for (const file of files) {
      try {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择PNG、JPG或WebP')
        const src = await normalizeAvatar(file)
        if ([...props.materials, ...additions].some(item => item.src === src)) { duplicates++; continue }
        additions.push({ id: makeId(), name: file.name.replace(/\.[^.]+$/, ''), gender: category, src, custom: true })
      } catch (error) { errors.push(`${file.name}：${error instanceof Error ? error.message : '处理失败'}`) }
    }
    if (additions.length) { await saveCustomMaterials(additions); emit('add', additions) }
    notice.value = `已添加 ${additions.length} 张${duplicates ? `，跳过 ${duplicates} 张重复图片` : ''}${errors.length ? `。${errors.join('；')}` : ''}`
  } catch (error) { notice.value = `未能保存素材，请重试：${error instanceof Error ? error.message : '存储空间不足'}` }
  finally { busy.value = false; input.value = '' }
}
</script>

<template>
  <section class="material-library" role="dialog" aria-label="角色素材库">
    <header><strong>素材库 <small>{{ materials.length }} 张</small></strong><button type="button" aria-label="关闭素材库" @click="emit('close')">×</button></header>
    <div class="library-toolbar">
      <select v-model="gender" aria-label="筛选素材性别"><option>全部</option><option>女</option><option>男</option><option>通用</option></select>
      <button type="button" :disabled="!selected || !ready" @click="emit('random')">当前队员随机</button>
      <button type="button" :disabled="!students.length || !ready" @click="emit('randomAll')">全班随机</button>
    </div>
    <p>{{ selected ? `点击图片绑定给 ${studentLabel(selected)}` : '先加入队员，即可绑定角色' }} · 同班不重复，素材用尽后使用兜底图。</p>
    <div class="upload-tools">
      <select v-model="uploadGender" aria-label="上传素材适用性别"><option>通用</option><option>女</option><option>男</option></select>
      <label :class="{ disabled: busy || !ready }">{{ busy ? '正在保存…' : '＋ 添加图片' }}<input type="file" multiple accept="image/png,image/jpeg,image/webp" :disabled="busy || !ready" @change="upload" /></label>
      <small>支持多选，可随完整数据备份迁移</small>
    </div>
    <p v-if="notice" class="library-notice" role="status">{{ notice }}</p>
    <div class="material-grid">
      <button v-for="item in visible" :key="item.id" type="button" :disabled="!selected || !!owner(item.src)" :class="{ selected: selected?.avatar === item.src, occupied: !!owner(item.src) }" :title="owner(item.src) ? `已分配给 ${studentLabel(owner(item.src)!)}` : item.name" @click="emit('bind', item.src)">
        <img :src="item.src" :alt="item.name" loading="lazy" /><span>{{ item.name }}</span><small>{{ owner(item.src) ? '已占用' : item.custom ? `${item.gender} · 自定义` : item.gender }}</small>
      </button>
    </div>
    <p v-if="!visible.length">暂无此类素材，可以添加图片。</p>
  </section>
</template>

<style scoped>
.material-library{position:absolute;right:0;bottom:calc(100% + 10px);width:440px;max-width:calc(100vw - 44px);max-height:min(620px,70vh);box-sizing:border-box;overflow:auto;padding:14px;border:1px solid #8ed4ff33;border-radius:12px;background:#0b192dfa;color:#deedf8;box-shadow:0 12px 40px #020a2066;font-size:12px}
header,.library-toolbar,.upload-tools{display:flex;align-items:center;gap:7px}header{justify-content:space-between;margin-bottom:12px}header small{font-weight:400;color:#8eabc1;margin-left:6px}button,select,.upload-tools label{padding:6px 8px;border:1px solid #aacde433;border-radius:7px;background:#182e44;color:#deedf8;font:inherit;cursor:pointer}header button{font-size:18px;padding:0 7px}.material-library p{color:#8eabc1;font-size:11px;line-height:1.6;margin:10px 0}.upload-tools{padding:10px 0;border-top:1px solid #aacde41c}.upload-tools input{display:none}.upload-tools small{font-size:10px;color:#8eabc1}.material-library button:disabled,.disabled{opacity:.45;cursor:default}.material-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.material-grid button{display:grid;min-width:0;padding:5px;background:#b4d4f008}.material-grid img{width:100%;height:90px;object-fit:contain}.material-grid span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;margin-top:5px}.material-grid small{font-size:9px;color:#8eabc1;margin-top:4px}.material-grid .selected{border-color:#87d4fb;background:#87d4fb22}.material-grid .occupied{opacity:.35}.material-library .library-notice{color:#bde3bc}@media(max-width:460px){.material-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.library-toolbar{flex-wrap:wrap}.upload-tools{flex-wrap:wrap}}
</style>
