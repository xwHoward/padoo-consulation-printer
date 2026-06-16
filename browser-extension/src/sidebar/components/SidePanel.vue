<template>
  <div class="cp-sidebar-root">
    <!-- 折叠状态下的展开按钮 -->
    <div
      v-if="collapsed"
      class="cp-toggle-btn"
      @click="collapsed = false"
      title="展开侧边栏"
    >
      <span class="cp-toggle-icon">&lsaquo;</span>
    </div>

    <!-- 侧边栏主体 -->
    <div
      v-show="!collapsed"
      class="cp-sidebar-panel"
      :style="{ width: panelWidth + 'px' }"
    >
      <!-- 左侧拖拽手柄 -->
      <div
        class="cp-resize-handle"
        @mousedown.prevent="startResize"
      ></div>

      <!-- 头部 -->
      <div class="cp-header">
        <span class="cp-header-title">辅助面板</span>
        <button
          class="cp-collapse-btn"
          @click="collapsed = true"
          title="收起侧边栏"
        >
          &rsaquo;
        </button>
      </div>

      <!-- Tab 切换 -->
      <div class="cp-tabs">
        <div
          class="cp-tab"
          :class="{ 'cp-tab--active': activeTab === 'grabber' }"
          @click="activeTab = 'grabber'"
        >
          抓取
        </div>
        <div
          class="cp-tab"
          :class="{ 'cp-tab--active': activeTab === 'cashier' }"
          @click="activeTab = 'cashier'"
        >
          收银
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="cp-content">
        <ElementGrabber v-show="activeTab === 'grabber'" />
        <CashierPage v-show="activeTab === 'cashier'" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import ElementGrabber from './ElementGrabber.vue'
import CashierPage from './CashierPage.vue'

// ---- Tab ----
const activeTab = ref('cashier')

// ---- 折叠状态 ----
const collapsed = ref(false)

// ---- 面板宽度 ----
const panelWidth = ref(420)
const MIN_WIDTH = 320
const MAX_WIDTH = 900

// ---- 拖拽调整宽度 ----
let isResizing = false

function startResize(e) {
  isResizing = true
  e.preventDefault()
}

function onMouseMove(e) {
  if (!isResizing) return
  const newWidth = window.innerWidth - e.clientX
  panelWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth))
}

function onMouseUp() {
  if (isResizing) {
    isResizing = false
  }
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})
</script>

<style lang="less" scoped>
.cp-sidebar-root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  z-index: 2147483647;
  direction: ltr;

  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
}

.cp-toggle-btn {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 60px;
  background: #4a6cf7;
  color: #fff;
  border: none;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  transition: background 0.2s;
  z-index: 2147483647;

  &:hover { background: #3b5de7; }

  .cp-toggle-icon {
    font-size: 18px;
    font-weight: bold;
    line-height: 1;
    user-select: none;
  }
}

.cp-sidebar-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  z-index: 2147483646;
}

.cp-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  background: transparent;
  z-index: 10;
  transition: background 0.2s;

  &:hover { background: rgba(74, 108, 247, 0.3); }
}

.cp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #ebeef5;
  background: #fafbfc;
  flex-shrink: 0;

  .cp-header-title {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
    user-select: none;
  }

  .cp-collapse-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: #666;
    font-size: 22px;
    font-weight: bold;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    transition: background 0.2s, color 0.2s;

    &:hover { background: #e8ecf1; color: #333; }
  }
}

.cp-tabs {
  display: flex;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;

  .cp-tab {
    flex: 1;
    text-align: center;
    padding: 8px 0;
    font-size: 13px;
    color: #888;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    user-select: none;

    &:hover { color: #4a6cf7; }

    &--active {
      color: #4a6cf7;
      font-weight: 600;
      border-bottom-color: #4a6cf7;
    }
  }
}

.cp-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 14px;

  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-thumb { background: #d0d5dd; border-radius: 3px; }
}
</style>
