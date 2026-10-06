<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

withDefaults(
  defineProps<{
    block?: boolean
  }>(),
  { block: false },
)

const route = useRoute()
const router = useRouter()
const on = computed(() => route.name === 'resources')

function go() {
  router.push({ name: 'resources' })
}
</script>

<template>
  <button
    type="button"
    class="res-btn"
    :class="{ on, block }"
    @click="go"
  >
    开源资源
  </button>
</template>

<style scoped>
.res-btn {
  border: 1px solid var(--primary);
  background: var(--primary-light);
  color: var(--primary-mid);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  line-height: 1.3;
  white-space: nowrap;
}
.res-btn:hover {
  background: rgba(74, 163, 217, 0.28);
}
.res-btn.on {
  background: var(--primary);
  color: #071018;
  border-color: var(--primary);
}
.res-btn.block {
  display: block;
  width: calc(100% - 24px);
  margin: 10px 12px 0;
  text-align: center;
}
</style>
