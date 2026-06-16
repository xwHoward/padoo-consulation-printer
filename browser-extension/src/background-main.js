// ============================================
// Background Script - CloudBase 代理 + 浏览器 API 监听
// 运行于 chrome-extension:// origin，不受宿主页面 CORS 限制
// ============================================

// --- 先注册消息监听（确保在任何时候都能接收消息） ---
// --- CloudBase SDK 延迟初始化，避免阻塞启动 ---
let _dbReady = false
let _app = null
let _db = null
let _initError = null

// 异步初始化 CloudBase
;(async function initCloudBase() {
  try {
    const cloudbase = await import('https://unpkg.com/@cloudbase/js-sdk@2.20.0/dist/index.esm.js')
      .catch(() => import('@cloudbase/js-sdk'))

    const config = {
      env: 'cloud1-0gkbm1dic147ccec',
      timeout: 15000,
      accessKey: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL2Nsb3VkMS0wZ2tibTFkaWMxNDdjY2VjLmFwLXNoYW5naGFpLnRjYi1hcGktYXBpLnRlbmNlbnRjbG91ZGFwaS5jb20iLCJzdWIiOiJhbm9uIiwiYXVkIjoiY2xvdWQxLTBna2JtMWRpYzE0N2NjZWMiLCJleHAiOjQwODQwNzgxOTAsImlhdCI6MTc4MDM5NDk5MCwibm9uY2UiOiJEUGlmRk5EaVRoV3hzczMyNEpoSERBIiwiYXRfaGFzaCI6IkRQaWZGTkRpVGhXeHNzMzI0SmhIREEiLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoiY2xvdWQxLTBna2JtMWRpYzE0N2NjZWMiLCJtZXRhIjp7InBsYXRmb3JtIjoiUHVibGlzaGFibGVLZXkifSwidXNlcl90eXBlIjoiIiwiY2xpZW50X3R5cGUiOiJjbGllbnRfdXNlciIsImlzX3N5c3RlbV9hZG1pbiI6ZmFsc2V9.bUgjs3IQF2eZdJBEWY584yainO4EM9id1tBOMYtVx-erClx9KHwmCvXzJsQ76Rr1yl9GQA98fYO4CX0nuTsXLYbY0Qk4365OzF0w8LnctQCfsrx0vMc-umMnd801EAJD5cDRtlmVsv3prrn4Cdu-rWFslDD947K8ZMCQdVLbwoYwScmwlELjw0IOyKG7a1beGQ_dHP6IKcBwtjyGN5RiV48HUuErYGuEw8pIJ5SLsIZuuL27bzd3tIgeYO0TqWhyX7lkGd4zSPbN_6KUyShO-puzsfXaXCB6McRdYpgmpSsa-gfrl03Y4lLes2cMtefNA-PD9ShINb_uz61D51d3oA',
      region: 'ap-shanghai'
    }

    _app = cloudbase.default ? cloudbase.default.init(config) : cloudbase.init(config)
    _app.auth({ persistence: 'local' })
    _db = _app.database()
    _dbReady = true
    console.log('[CP/BG] CloudBase initialized, env:', config.env)
  } catch (e) {
    _initError = e.message || String(e)
    console.error('[CP/BG] CloudBase init failed:', _initError)
  }
})()

// --- 生命周期 ---
chrome.runtime.onInstalled.addListener(() => {
  console.log('[CP/BG] Extension installed/updated')
})

// --- 消息路由（必须在模块顶层注册，任何时候都能响应） ---
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type || !message.type.startsWith('cp:')) {
    return false // 不是我们的消息，不处理
  }

  handleProxyMessage(message)
    .then(function (result) { sendResponse(result) })
    .catch(function (err) { sendResponse({ error: true, message: err.message || String(err) }) })

  return true // keep channel open for async
})

// --- 代理处理器 ---
async function handleProxyMessage(msg) {
  if (!_dbReady) {
    throw new Error('CloudBase not ready' + (_initError ? ': ' + _initError : ', retrying...'))
  }

  const { type, payload } = msg

  switch (type) {
    case 'cp:db:query': {
      const { collection: collName, where, orderBy, skip, limit } = payload
      let query = _db.collection(collName)
      if (where) query = query.where(where)
      if (orderBy) {
        const by = Array.isArray(orderBy) ? orderBy : [orderBy]
        by.forEach(function (o) { query = query.orderBy(o.field, o.direction || 'asc') })
      }
      if (skip) query = query.skip(skip)
      query = query.limit(limit || 100)

      const res = await query.get()
      return { data: res.data || [], count: (res.data || []).length }
    }

    case 'cp:db:doc:get': {
      const { collection: collName, docId } = payload
      const res = await _db.collection(collName).doc(docId).get()
      return { data: Array.isArray(res.data) ? res.data[0] : res.data }
    }

    case 'cp:db:add': {
      const { collection: collName, data } = payload
      const res = await _db.collection(collName).add(data)
      return { id: res.id }
    }

    case 'cp:db:update': {
      const { collection: collName, docId, data } = payload
      await _db.collection(collName).doc(docId).update(data)
      return { success: true }
    }

    case 'cp:cf:call': {
      const { name, data } = payload
      const res = await _app.callFunction({ name, data })
      return res.result || res
    }

    default:
      return { error: true, message: 'Unknown message type: ' + type }
  }
}
