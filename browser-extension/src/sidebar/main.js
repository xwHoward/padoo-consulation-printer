// ============================================
// 侧边栏 Vue 应用入口
// 兼容两种场景：
//   - 插件模式：挂载到 #cp-extension-sidebar (content script 创建)
//   - 开发模式：挂载到 #app (index.html 开发预览)
// ============================================
import { createApp } from 'vue'
import App from './App.vue'

const mountTarget =
  document.getElementById('cp-extension-sidebar') ||
  document.getElementById('app') ||
  (() => {
    // 开发模式兜底：创建挂载点
    const el = document.createElement('div')
    el.id = 'cp-extension-sidebar'
    document.body.appendChild(el)
    return el
  })()

const app = createApp(App)
app.mount(mountTarget)
