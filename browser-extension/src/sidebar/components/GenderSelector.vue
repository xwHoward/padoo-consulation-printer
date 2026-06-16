<template>
  <div class="cp-gender-selector">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="cp-gs-btn"
      :class="{ 'cp-gs-btn--active': modelValue === opt.value }"
      @click="$emit('update:modelValue', opt.value); $emit('change', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: 'male' },
  options: {
    type: Array,
    default: () => [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' }
    ]
  }
})

defineEmits(['update:modelValue', 'change'])
</script>

<style lang="less" scoped>
.cp-gender-selector {
  display: flex;
  gap: 6px;

  .cp-gs-btn {
    padding: 5px 14px;
    border: 1px solid #d0d5dd;
    background: #fff;
    border-radius: 4px;
    font-size: 13px;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;

    &:hover { border-color: #4a6cf7; color: #4a6cf7; }

    &--active {
      background: #4a6cf7;
      color: #fff;
      border-color: #4a6cf7;
    }
  }
}
</style>
