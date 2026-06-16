import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          content: resolve(__dirname, 'src/content.js'),
          background: resolve(__dirname, 'src/background-main.js'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].[hash].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      },
      hmr: {
        port: 5173,
        host: 'localhost',
        protocol: 'ws',
      },
    },
    define: {
      __DEV__: isDev,
    },
  }
})
