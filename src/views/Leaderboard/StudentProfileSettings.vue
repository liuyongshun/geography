<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { normalizeProfileText, PROFILE_TEXT_LIMIT, type Student } from './leaderboardData'

const props = defineProps<{ student: Student }>()
const emit = defineEmits<{ save: [details: { personality: string; hobbies: string }] }>()
const personality = ref(props.student.personality ?? '')
const hobbies = ref(props.student.hobbies ?? '')
const notice = ref('')
watch(() => [props.student.personality, props.student.hobbies], () => {
  personality.value = props.student.personality ?? ''
  hobbies.value = props.student.hobbies ?? ''
})
const changed = computed(() => personality.value !== (props.student.personality ?? '') || hobbies.value !== (props.student.hobbies ?? ''))
function save() {
  personality.value = normalizeProfileText(personality.value)
  hobbies.value = normalizeProfileText(hobbies.value)
  emit('save', { personality: personality.value, hobbies: hobbies.value })
  notice.value = '资料已更新'
}
function cancel() {
  personality.value = props.student.personality ?? ''
  hobbies.value = props.student.hobbies ?? ''
  notice.value = ''
}
</script>

<template>
  <form class="profile-settings" aria-label="性格与爱好设置" @submit.prevent="save">
    <label>性格<input v-model="personality" :maxlength="PROFILE_TEXT_LIMIT" placeholder="例如：开朗、细心、乐于助人" aria-label="队员性格" @input="notice = ''" /></label>
    <label>爱好<textarea v-model="hobbies" :maxlength="PROFILE_TEXT_LIMIT" rows="2" placeholder="例如：阅读、篮球、旅行" aria-label="队员爱好" @input="notice = ''" /></label>
    <div class="settings-actions"><small>选填，各最多{{ PROFILE_TEXT_LIMIT }}字</small><button v-if="changed" type="button" @click="cancel">取消</button><button type="submit" :disabled="!changed">保存资料</button></div>
    <p v-if="notice && !changed" role="status">{{ notice }}</p>
  </form>
</template>

<style scoped>
.profile-settings{display:grid;gap:10px;padding:14px 0;border-bottom:1px solid #8ed4ff22}.profile-settings label{display:grid;gap:6px;color:#b8d7eb;font-size:12px;text-align:left}.profile-settings input,.profile-settings textarea{box-sizing:border-box;min-width:0;width:100%;padding:8px 9px;border:1px solid #8ed4ff33;border-radius:8px;background:#07162c;color:#e8f5ff;font:inherit;line-height:1.5}.profile-settings textarea{resize:vertical}.profile-settings input:focus,.profile-settings textarea:focus{outline:1px solid #8ed4ff}.settings-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.settings-actions small{margin-right:auto;color:#88a8c4;font-size:10px}.settings-actions button{border:1px solid #8ed4ff33;border-radius:7px;padding:5px 8px;background:#254764;color:#e8f5ff;font-size:11px;cursor:pointer}.settings-actions button:disabled{opacity:.4;cursor:default}.profile-settings p{margin:0;color:#a7d7a9;font-size:11px}
</style>
