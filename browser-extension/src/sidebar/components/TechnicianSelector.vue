<template>
  <div class="cp-tech-selector">
    <label
      v-for="item in technicianList"
      :key="item._id"
      class="cp-ts-item"
      :class="{
        'cp-ts-item--selected': isSelected(item),
        'cp-ts-item--unavailable': item.isAvailable === false
      }"
    >
      <input
        :type="multi ? 'checkbox' : 'radio'"
        :checked="isSelected(item)"
        :disabled="item.isAvailable === false"
        @change="toggle(item)"
        class="cp-ts-check"
      />
      <span class="cp-ts-name">{{ item.name }}</span>
      <span v-if="item.isAvailable === false" class="cp-ts-badge">忙</span>
      <span v-if="item.isClockIn" class="cp-ts-badge cp-ts-badge--clock">点钟</span>
    </label>
  </div>
</template>

<script setup>
const props = defineProps({
  selectedTechnicians: { type: Array, default: () => [] },
  technicianList: { type: Array, default: () => [] },
  multi: { type: Boolean, default: false }
})

const emit = defineEmits(['change'])

function isSelected(item) {
  return props.selectedTechnicians.some(t => t._id === item._id)
}

function toggle(item) {
  let updated
  if (props.multi) {
    if (isSelected(item)) {
      updated = props.selectedTechnicians.filter(t => t._id !== item._id)
    } else {
      updated = [...props.selectedTechnicians, {
        _id: item._id,
        name: item.name,
        phone: item.phone || '',
        isClockIn: item.isClockIn || false
      }]
    }
  } else {
    updated = isSelected(item) ? [] : [{
      _id: item._id,
      name: item.name,
      phone: item.phone || '',
      isClockIn: item.isClockIn || false
    }]
  }
  emit('change', updated)
}
</script>

<style lang="less" scoped>
.cp-tech-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .cp-ts-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border: 1px solid #d0d5dd;
    border-radius: 4px;
    font-size: 13px;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
    position: relative;

    &:hover { border-color: #4a6cf7; }

    &--selected {
      background: #eef1ff;
      border-color: #4a6cf7;
      color: #4a6cf7;
      font-weight: 500;
    }

    &--unavailable {
      opacity: 0.5;
      cursor: not-allowed;

      .cp-ts-badge { background: #f44336; color: #fff; }
    }

    .cp-ts-check { accent-color: #4a6cf7; cursor: pointer; }
    .cp-ts-name { cursor: pointer; }

    .cp-ts-badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: #e8ecf1;
      color: #666;

      &--clock {
        background: #fff3e0;
        color: #e65100;
      }
    }
  }
}
</style>
