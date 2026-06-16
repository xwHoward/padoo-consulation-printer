// ============================================
// 开发模式初始化: 复制 dev manifest + content-loader + icons 到 dist
// 注意: background.js 由 Vite prod build 产出，不在 dev 模式下热更新
// ============================================
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

// 确保 dist 存在
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true })

// 复制 dev manifest
fs.copyFileSync(
  path.join(ROOT, 'manifest.dev.json'),
  path.join(DIST, 'manifest.json')
)
console.log('[dev-setup] Copied manifest.dev.json -> dist/manifest.json')

// 复制 content-loader
const loaderSrc = path.join(ROOT, 'public', 'content-loader.js')
const loaderDest = path.join(DIST, 'content-loader.js')
fs.copyFileSync(loaderSrc, loaderDest)
console.log('[dev-setup] Copied content-loader.js -> dist/content-loader.js')

// 复制 icons
const iconsSrc = path.join(ROOT, 'public', 'icons')
const iconsDest = path.join(DIST, 'icons')
if (fs.existsSync(iconsSrc)) {
  copyDirRecursive(iconsSrc, iconsDest)
  console.log('[dev-setup] Copied public/icons -> dist/icons')
}

console.log('')
console.log('========================================')
console.log('  Dev mode ready!')
console.log('  1. Start Vite:    npm run dev')
console.log('  2. Refresh extension in Edge')
console.log('  3. Edit .vue files -> instant HMR!')
console.log('========================================')

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  fs.readdirSync(src).forEach((child) => {
    const srcPath = path.join(src, child)
    const destPath = path.join(dest, child)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  })
}
