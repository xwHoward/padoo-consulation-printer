// composables/useEnvironment.js - 从宿主页面读取环境配置
// 插件通过 window.__CLOUDBASE_XXX 注入配置，
// 实际使用时由宿主 webview 或 content script 在注入前设置

export function useEnvironment() {
  return {
    envId: window.__CLOUDBASE_ENV_ID__ || 'your-env-id',
    region: window.__CLOUDBASE_REGION__ || 'ap-shanghai'
  }
}

// 由 content-loader 或 init 脚本在挂载前调用
export function injectEnvironment(envId, region) {
  window.__CLOUDBASE_ENV_ID__ = envId
  window.__CLOUDBASE_REGION__ = region
}
