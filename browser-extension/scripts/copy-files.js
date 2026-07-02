// ============================================
// 开发辅助脚本：构建后自动复制 manifest 和资源到 dist
// ============================================
const fs = require('fs')
const path = require('path')

const SRC_DIR = path.resolve(__dirname, '..')
const DIST_DIR = path.resolve(__dirname, '../dist')

// 需要复制到 dist 的文件
const copyFiles = ['manifest.json']

// 需要复制到 dist 的目录
const copyDirs = ['public/icons']

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return

  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }
    fs.readdirSync(src).forEach((child) => {
      copyRecursive(path.join(src, child), path.join(dest, child))
    })
  } else {
    const destDir = path.dirname(dest)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
    fs.copyFileSync(src, dest)
    console.log(`  Copied: ${path.relative(SRC_DIR, src)} -> ${path.relative(SRC_DIR, dest)}`)
  }
}

console.log('Copying extension files to dist/...')

// Clean up Vite ES module export from background.js (MV2 doesn't support ES modules)
const bgPath = path.resolve(DIST_DIR, 'background.js')
if (fs.existsSync(bgPath)) {
  let content = fs.readFileSync(bgPath, 'utf-8')
  // Remove trailing export statement (e.g., "export{I as _};")
  content = content.replace(/export\{[^}]+\};?\s*$/g, '')
  fs.writeFileSync(bgPath, content, 'utf-8')
  console.log('  Cleaned: removed ES module export from background.js')
}

for (const file of copyFiles) {
  const src = path.resolve(SRC_DIR, file)
  const dest = path.resolve(DIST_DIR, path.basename(file))
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
    console.log(`  Copied: ${file} -> dist/${path.basename(file)}`)
  }
}

for (const dir of copyDirs) {
  const src = path.resolve(SRC_DIR, dir)
  const dest = path.resolve(DIST_DIR, path.basename(dir))
  copyRecursive(src, dest)
}

console.log('Done! Load the dist/ folder as an unpacked extension.')
