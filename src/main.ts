import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import '@/styles/global.css'
import App from './App.vue'
import { router } from './router'
import { initializePortableStorage } from './views/Leaderboard/portableStorage'
import { loadBrowserCustomMaterials } from './views/Leaderboard/materialLibrary'

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
initializePortableStorage(loadBrowserCustomMaterials).then(() => app.mount('#app')).catch(error => {
  const root = document.getElementById('app')!
  const message = document.createElement('p')
  message.style.cssText = 'padding:40px;color:#ffd7b0;white-space:pre-wrap;line-height:1.8'
  message.textContent = `无法读取攀登榜数据，为保护已有数据，程序已停止加载。\n${String(error)}\n请保留 data 文件夹，检查U盘连接及读取权限；数据损坏时可将 leaderboard.json.bak 复制为 leaderboard.json 后重启。`
  root.replaceChildren(message)
})
