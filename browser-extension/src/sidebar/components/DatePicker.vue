<template>
  <div class="cp-date-picker">
    <div class="cp-dp-row">
      <button class="cp-dp-arrow" @click="goPrev" :disabled="!props.enablePrev">&#10094;</button>
      <span class="cp-dp-value">{{ props.modelValue }}</span>
      <button class="cp-dp-arrow" @click="goNext" :disabled="!props.enableNext">&#10095;</button>
    </div>
    <div class="cp-dp-actions" v-if="props.showToday && !isToday">
      <button class="cp-dp-today" @click="goToday">今天</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  enablePrev: { type: Boolean, default: true },
  enableNext: { type: Boolean, default: true },
  showToday: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue', 'change'])

const isToday = computed(() => {
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return today === props.modelValue
})

function shiftDate(offset) {
  const d = new Date(props.modelValue)
  if (isNaN(d.getTime())) return
  d.setDate(d.getDate() + offset)
  const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  emit('update:modelValue', newDate)
  emit('change', newDate)
}

function goPrev() { shiftDate(-1) }
function goNext() { shiftDate(1) }
function goToday() {
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  emit('update:modelValue', today)
  emit('change', today)
}
</script>

<style lang="less" scoped>
.cp-date-picker {
  .cp-dp-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cp-dp-arrow {
    width: 28px;
    height: 28px;
    border: 1px solid #d0d5dd;
    background: #fff;
    border-radius: 4px;
    font-size: 13px;
    color: #4a6cf7;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;

    &:hover:not(:disabled) { background: #eef1ff; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }
  .cp-dp-value {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    min-width: 100px;
    text-align: center;
  }
  .cp-dp-actions {
    margin-top: 4px;
    text-align: center;
  }
  .cp-dp-today {
    font-size: 12px;
    color: #4a6cf7;
    background: transparent;
    border: 1px solid #4a6cf7;
    border-radius: 3px;
    padding: 2px 10px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: #4a6cf7;
      color: #fff;
    }
  }
}
</style>
