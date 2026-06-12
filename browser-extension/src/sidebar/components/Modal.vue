<template>
  <div v-if="show" class="cp-modal-mask" @click.self="onCancel">
    <div class="cp-modal-container" :class="sizeClass">
      <div class="cp-modal-header">
        <span class="cp-modal-title">{{ title }}</span>
        <button class="cp-modal-close" @click="onCancel">&times;</button>
      </div>
      <div class="cp-modal-body">
        <slot></slot>
      </div>
      <div class="cp-modal-footer" v-if="showFooter !== false">
        <button class="cp-btn cp-btn--cancel" @click="onCancel" :disabled="loading">
          {{ cancelText }}
        </button>
        <button class="cp-btn cp-btn--confirm" @click="onConfirm" :disabled="loading">
          {{ loading ? (loadingText || '处理中...') : confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  size: { type: String, default: 'medium' },
  confirmText: { type: String, default: '确认' },
  cancelText: { type: String, default: '取消' },
  loading: { type: Boolean, default: false },
  loadingText: { type: String, default: '处理中...' },
  showFooter: { type: Boolean, default: true }
})

const emit = defineEmits(['cancel', 'confirm'])

const sizeClass = computed(() => `cp-modal--${props.size}`)

function onCancel() { if (props.show) emit('cancel') }
function onConfirm() { if (props.show && !props.loading) emit('confirm') }
</script>

<style lang="less" scoped>
.cp-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483650;
}

.cp-modal-container {
  background: #fff;
  border-radius: 10px;
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  animation: cp-modal-in 0.2s ease;

  &.cp-modal--large {
    max-width: 520px;
  }
  &.cp-modal--small {
    max-width: 300px;
  }
}

@keyframes cp-modal-in {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}

.cp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #ebeef5;

  .cp-modal-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .cp-modal-close {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    font-size: 22px;
    color: #999;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover { background: #f0f2f5; color: #333; }
  }
}

.cp-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: #d0d5dd; border-radius: 2px; }
}

.cp-modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid #ebeef5;
}

.cp-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;

  &--cancel {
    background: #f0f2f5;
    color: #666;

    &:hover:not(:disabled) { background: #e4e7ec; }
  }

  &--confirm {
    background: #4a6cf7;
    color: #fff;

    &:hover:not(:disabled) { background: #3b5de7; }
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>
