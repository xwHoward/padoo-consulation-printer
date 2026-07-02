<template>
  <div class="cp-section">
    <div class="cp-section-title">元素抓取</div>
    <div class="grabber-body">
      <!-- 选择器输入 -->
      <div class="grabber-input-row">
        <input
          ref="selectorInput"
          v-model="selector"
          type="text"
          class="grabber-input"
          placeholder="输入 CSS 选择器，如 .article-title"
          @keydown.enter="grabElements"
        />
        <button
          class="grabber-btn"
          @click="grabElements"
          :disabled="!selector.trim()"
        >
          抓取1
        </button>
      </div>

      <!-- 抓取结果 -->
      <div v-if="results.length > 0" class="grabber-results">
        <div class="grabber-results-header">
          <span>共抓取 {{ results.length }} 个元素</span>
          <button class="grabber-clear-btn" @click="clearResults">清空</button>
        </div>
        <ul class="grabber-list">
          <li
            v-for="(item, index) in results"
            :key="index"
            class="grabber-item"
            :title="item.fullText"
          >
            <span class="grabber-item-index">{{ index + 1 }}</span>
            <span class="grabber-item-text">{{ item.preview }}</span>
          </li>
        </ul>
      </div>

      <!-- 空结果提示 -->
      <div v-else-if="hasSearched" class="grabber-empty">
        未匹配到元素，请检查选择器是否正确
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const selector = ref('')
const results = ref([])
const hasSearched = ref(false)
const selectorInput = ref(null)

function grabElements() {
  const sel = selector.value.trim()
  if (!sel) return

  hasSearched.value = true
  results.value = []

  try {
    const elements = document.querySelectorAll(sel)
    const items = []
    elements.forEach((el) => {
      const fullText = el.textContent?.trim() || el.innerText?.trim() || ''
      const preview =
        fullText.length > 120 ? fullText.slice(0, 120) + '...' : fullText
      items.push({ fullText, preview })
    })
    results.value = items
  } catch (err) {
    console.warn('[ElementGrabber] Invalid selector:', sel, err)
    results.value = []
  }
}

function clearResults() {
  results.value = []
  hasSearched.value = false
}
</script>

<style lang="less" scoped>
.grabber-body {
  padding: 10px 12px;
}

.grabber-input-row {
  display: flex;
  gap: 6px;

  .grabber-input {
    flex: 1;
    padding: 7px 10px;
    border: 1px solid #d0d5dd;
    border-radius: 4px;
    font-size: 13px;
    color: #333;
    outline: none;
    transition: border-color 0.2s;
    min-width: 0;

    &::placeholder {
      color: #b0b8c1;
    }

    &:focus {
      border-color: #FF6B00;
      box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.1);
    }
  }

  .grabber-btn {
    padding: 7px 16px;
    border: none;
    background: #FF6B00;
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.2s;
    flex-shrink: 0;

    &:hover:not(:disabled) {
      background: #CC5C00;
    }

    &:disabled {
      background: rgba(255, 107, 0, 0.35);
      cursor: not-allowed;
    }
  }
}

.grabber-results {
  margin-top: 10px;

  .grabber-results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    font-size: 12px;
    color: #888;

    .grabber-clear-btn {
      border: none;
      background: transparent;
      color: #999;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 3px;

      &:hover {
        color: #e74c3c;
        background: #fef2f2;
      }
    }
  }

  .grabber-list {
    list-style: none;
    max-height: 280px;
    overflow-y: auto;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: #d0d5dd;
      border-radius: 2px;
    }
  }

  .grabber-item {
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid #f0f2f5;
    font-size: 13px;
    line-height: 1.4;
    transition: background 0.15s;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: #f8f9fb;
    }

    .grabber-item-index {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      background: rgba(255, 107, 0, 0.08);
      color: #FF6B00;
      font-size: 11px;
      font-weight: 600;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .grabber-item-text {
      color: #4b5563;
      word-break: break-all;
    }
  }
}

.grabber-empty {
  margin-top: 10px;
  padding: 16px;
  text-align: center;
  color: #999;
  font-size: 13px;
  background: #fafafa;
  border-radius: 4px;
  border: 1px dashed #e0e0e0;
}
</style>
