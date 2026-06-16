// ============================================
// 开发模式 Content Script (HMR 热更新 + CloudBase 代理桥)
// 不经过 Vite 打包，直接注入 <script type="module">
// 从 Vite dev server 加载 Vue 应用，实现热更新
// ============================================
(function () {
  'use strict'

  const DEV_HOST = 'http://localhost:5173'

  // 防止重复注入
  if (document.getElementById('cp-extension-sidebar')) {
    console.log('[HMR Loader] Sidebar already exists, skipping')
    return
  }

  console.log('[HMR Loader] Initializing from', DEV_HOST)

  // 1. 创建侧边栏挂载点
  const root = document.createElement('div')
  root.id = 'cp-extension-sidebar'
  document.body.appendChild(root)

  // 2. === CloudBase 代理桥 ===
  // Vue 应用运行在页面上下文，没有 chrome.runtime。
  // 通过 window.postMessage 将 cp:proxy:* 请求转发到 content script 上下文，
  // 再由 chrome.runtime.sendMessage 发送到 background。
  const pendingRequests = new Map()
  let reqCounter = 0

  window.addEventListener('message', function (event) {
    // 只处理 cp:proxy:req 消息（页面上下文通过 postMessage 发来的代理请求）
    if (!event.data || event.data.type !== 'cp:proxy:req') return

    const { id, messageType, payload } = event.data

    chrome.runtime.sendMessage({ type: messageType, payload }, function (response) {
      window.postMessage(
        {
          type: 'cp:proxy:res',
          id: id,
          ok: !(response && response.error),
          data: response
        },
        '*'
      )
    })
  })

  // 3. 注入 Vite HMR 客户端 (负责 WebSocket 热更新通道)
  function injectScript(src, isModule) {
    const script = document.createElement('script')
    if (isModule) script.type = 'module'
    script.src = src
    script.onerror = function () {
      console.error(
        '[HMR Loader] Failed to load:',
        src,
        '\nMake sure Vite dev server is running: npm run dev'
      )
    }
    document.head.appendChild(script)
    return script
  }

  injectScript(DEV_HOST + '/@vite/client', true)

  // 4. 注入应用入口 (Vite 会实时编译 .vue 文件并注入 CSS)
  injectScript(DEV_HOST + '/src/sidebar/main.js', true)
})()
