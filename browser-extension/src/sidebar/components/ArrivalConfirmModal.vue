<template>
  <Modal
    :show="show"
    title="确认到店"
    :show-footer="false"
    @cancel="$emit('close')"
  >
    <div class="cp-arrival">
      <div class="cp-arrival-info">
        <div class="cp-arrival-row">
          <span class="cp-arrival-label">顾客</span>
          <span class="cp-arrival-value">{{ customerName }}</span>
        </div>
        <div class="cp-arrival-row">
          <span class="cp-arrival-label">项目</span>
          <span class="cp-arrival-value">{{ project }}</span>
        </div>
        <div class="cp-arrival-row">
          <span class="cp-arrival-label">技师</span>
          <span class="cp-arrival-value">{{ technicianName }}</span>
        </div>
      </div>
      <div class="cp-arrival-actions">
        <button class="cp-arrival-btn cp-arrival-btn--skip" @click="$emit('skip')">
          不推送通知
        </button>
        <button class="cp-arrival-btn cp-arrival-btn--push" @click="$emit('push')">
          推送到店通知
        </button>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

defineProps({
  show: { type: Boolean, default: false },
  customerName: { type: String, default: '' },
  project: { type: String, default: '' },
  technicianName: { type: String, default: '' }
})

defineEmits(['close', 'push', 'skip'])
</script>

<style lang="less" scoped>
.cp-arrival {
  .cp-arrival-info {
    margin-bottom: 16px;
  }

  .cp-arrival-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 14px;

    .cp-arrival-label { color: #888; }
    .cp-arrival-value { font-weight: 500; color: #333; }
  }

  .cp-arrival-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  .cp-arrival-btn {
    padding: 10px 24px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;

    &--skip {
      background: #f0f2f5;
      color: #666;

      &:hover { background: #e4e7ec; }
    }

    &--push {
      background: #4a6cf7;
      color: #fff;

      &:hover { background: #3b5de7; }
    }
  }
}
</style>
