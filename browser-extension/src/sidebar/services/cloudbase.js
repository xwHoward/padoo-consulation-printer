// ============================================
// CloudBase Proxy - 通过 background script 代理所有 CloudBase 调用
// Content script 运行在宿主页面 origin，跨域请求会被 CORS 拦截
// 通过 chrome.runtime.sendMessage 转发到 background script 执行
// ============================================

/**
 * 检测是否有 chrome.runtime（content script 隔离世界 vs 页面上下文）
 */
const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage

let _reqId = 0

/**
 * 发送代理消息到 background script
 * - 有 chrome.runtime → 直接 sendMessage（prod 构建的 content.js）
 * - 无 chrome.runtime → window.postMessage（HMR 模式，Vue 在页面上下文运行）
 */
function sendProxyMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (hasChromeRuntime) {
      // PROD: 在 content script 隔离世界，可直接调用 chrome.runtime.sendMessage
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (response && response.error) {
          reject(new Error(response.message || 'CloudBase proxy error'))
          return
        }
        resolve(response || {})
      })
    } else {
      // DEV/HMR: 在页面上下文，通过 window.postMessage 经 content-loader 桥接到 background
      const id = ++_reqId
      const handler = (event) => {
        if (!event.data || event.data.type !== 'cp:proxy:res') return
        if (event.data.id !== id) return
        window.removeEventListener('message', handler)
        clearTimeout(timer)

        if (!event.data.ok) {
          reject(new Error(event.data.data?.message || 'CloudBase proxy error'))
        } else {
          resolve(event.data.data || {})
        }
      }
      window.addEventListener('message', handler)

      const timer = setTimeout(() => {
        window.removeEventListener('message', handler)
        reject(new Error('CloudBase proxy timeout'))
      }, 15000)

      window.postMessage({ type: 'cp:proxy:req', id, messageType: type, payload }, '*')
    }
  })
}

// ========== 数据库代理 API ==========

/**
 * 获取 CloudBase 实例包装
 */
export function getCloudBase() {
  // 返回代理对象，兼容原有 API 接口
  return {
    app: {
      callFunction: async ({ name, data }) => {
        const result = await sendProxyMessage('cp:cf:call', { name, data: data || {} })
        return { result }
      }
    },
    db: {
      collection: (name) => createCollectionProxy(name),
      command: {
        eq: (val) => ({ $eq: val }),
        neq: (val) => ({ $ne: val }),
        lt: (val) => ({ $lt: val }),
        lte: (val) => ({ $lte: val }),
        gt: (val) => ({ $gt: val }),
        gte: (val) => ({ $gte: val }),
        in: (val) => ({ $in: val }),
        nin: (val) => ({ $nin: val })
      }
    }
  }
}

/**
 * 创建集合代理对象 - 兼容 CloudBase SDK 的 collection API
 * 集合本身也是一个 query proxy，可以直接 .get() / .where() / .orderBy() / .limit()
 * 另外增加 .doc() 和 .add() 方法
 */
function createCollectionProxy(name) {
  // 基于空 where 创建 query proxy，使其支持链式查询
  const queryProxy = createQueryProxy(name, {})

  // 扩展 doc 和 add 方法
  return Object.assign(queryProxy, {
    doc(id) {
      return {
        get: async () => {
          const res = await sendProxyMessage('cp:db:doc:get', { collection: name, docId: id })
          return { data: res.data ? [res.data] : [] }
        },
        update: async (data) => {
          return sendProxyMessage('cp:db:update', { collection: name, docId: id, data })
        }
      }
    },
    add: async (data) => {
      return sendProxyMessage('cp:db:add', { collection: name, data })
    }
  })
}

/**
 * 创建查询代理对象 - 支持链式调用
 */
function createQueryProxy(name, filters) {
  const queryState = {
    collection: name,
    where: filters || {},
    orderBy: [],
    limit: null,
    skip: null
  }

  return {
    where(newFilters) {
      queryState.where = Object.assign({}, queryState.where, newFilters)
      return this
    },
    orderBy(field, direction) {
      queryState.orderBy.push({ field, direction: direction || 'asc' })
      return this
    },
    limit(val) {
      queryState.limit = val
      return this
    },
    skip(val) {
      queryState.skip = val
      return this
    },
    get: async () => {
      const res = await sendProxyMessage('cp:db:query', { ...queryState })
      return { data: res.data || [] }
    },
    count: async () => {
      const res = await sendProxyMessage('cp:db:query', { ...queryState })
      return { total: res.count || 0 }
    }
  }
}

/**
 * 调用云函数
 */
export async function callFunction(name, data = {}) {
  const result = await sendProxyMessage('cp:cf:call', { name, data })
  return result
}

/**
 * 获取数据库引用（兼容旧 API）
 */
export function getDatabase() {
  return getCloudBase().db
}

/**
 * 获取数据库集合（兼容旧 API）
 */
export function collection(name) {
  return createCollectionProxy(name)
}

// ========== 集合常量 ==========
export const Collections = {
  CONSULTATION: 'consultation',
  RESERVATIONS: 'reservations',
  CUSTOMERS: 'customers',
  PROJECTS: 'projects',
  STAFF: 'staffs',
  ROOMS: 'rooms',
  ROTATION: 'rotation'
}
