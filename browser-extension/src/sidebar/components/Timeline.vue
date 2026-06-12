<template>
  <div class="cp-timeline">
    <div class="cp-tl-empty" v-if="!rotationList || rotationList.length === 0">
      <p>暂无排钟数据</p>
    </div>

    <!-- 轮牌列表 -->
    <div class="cp-tl-section" v-if="rotationList.length > 0">
      <div class="cp-tl-section-title">
        轮牌顺序
        <span v-if="canAdjustRotation" class="cp-tl-hint">(可拖拽调整)</span>
      </div>
      <div class="cp-tl-staff-list">
        <div
          v-for="(staff, index) in rotationList"
          :key="staff._id"
          class="cp-tl-staff-item"
        >
          <span class="cp-tl-rank">{{ index + 1 }}</span>
          <span class="cp-tl-name">{{ staff.name }}</span>
          <span class="cp-tl-shift">{{ staff.shift === 'morning' ? '早班' : '晚班' }}</span>
          <div class="cp-tl-actions" v-if="canAdjustRotation">
            <button
              class="cp-tl-action-btn"
              @click="$emit('adjustRotation', { index, direction: 'up' })"
              :disabled="index === 0"
            >&#9650;</button>
            <button
              class="cp-tl-action-btn"
              @click="$emit('adjustRotation', { index, direction: 'down' })"
              :disabled="index === rotationList.length - 1"
            >&#9660;</button>
          </div>
        </div>
      </div>
      <div class="cp-tl-actions-row" v-if="canAdjustRotation && rotationList.length > 0">
        <button class="cp-btn-sm" @click="$emit('resetRotation')">重置轮牌</button>
        <button class="cp-btn-sm cp-btn-sm--primary" @click="$emit('pushRotation')">推送</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  rotationList: { type: Array, default: () => [] },
  canAdjustRotation: { type: Boolean, default: false },
  selectedDate: { type: String, default: '' }
})

defineEmits(['adjustRotation', 'resetRotation', 'pushRotation', 'copySlot', 'blockClick'])
</script>

<style lang="less" scoped>
.cp-timeline {
  .cp-tl-empty {
    text-align: center;
    padding: 20px;
    color: #999;
    font-size: 13px;
  }

  .cp-tl-section-title {
    font-size: 13px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;

    .cp-tl-hint {
      font-size: 11px;
      color: #999;
      font-weight: 400;
    }
  }

  .cp-tl-staff-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cp-tl-staff-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #f8f9fb;
    border-radius: 6px;
    border: 1px solid #ebeef5;
    font-size: 13px;
    transition: background 0.15s;

    &:hover { background: #eef1ff; }

    .cp-tl-rank {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #4a6cf7;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .cp-tl-name {
      flex: 1;
      font-weight: 500;
      color: #1f2937;
    }

    .cp-tl-shift {
      font-size: 11px;
      color: #888;
      background: #e8ecf1;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .cp-tl-actions {
      display: flex;
      gap: 2px;
    }

    .cp-tl-action-btn {
      width: 22px;
      height: 22px;
      border: 1px solid #d0d5dd;
      background: #fff;
      border-radius: 3px;
      font-size: 9px;
      color: #666;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;

      &:hover:not(:disabled) {
        background: #4a6cf7;
        color: #fff;
        border-color: #4a6cf7;
      }
      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
    }
  }

  .cp-tl-actions-row {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    justify-content: flex-end;
  }
}

.cp-btn-sm {
  padding: 5px 14px;
  border: 1px solid #d0d5dd;
  background: #fff;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;

  &:hover { border-color: #4a6cf7; color: #4a6cf7; }

  &--primary {
    background: #4a6cf7;
    color: #fff;
    border-color: #4a6cf7;

    &:hover { background: #3b5de7; }
  }
}
</style>
