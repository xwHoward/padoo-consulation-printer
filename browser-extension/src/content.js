// ============================================
// Content Script - 注入侧边栏到宿主页面
// ============================================
import { createApp } from 'vue'
import App from './sidebar/App.vue'

// 防止重复注入
if (document.getElementById('cp-extension-sidebar')) {
  // 已存在则不做任何事
} else {
  initSidebar()
}

function initSidebar() {
  // 创建根容器
  const root = document.createElement('div')
  root.id = 'cp-extension-sidebar'
  document.body.appendChild(root)

  // 挂载 Vue 应用
  const app = createApp(App)
  app.mount(root)
}
