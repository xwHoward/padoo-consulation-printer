<template>
  <div class="cp-project-selector">
    <label
      v-for="item in projects"
      :key="item._id || item.label"
      class="cp-ps-item"
      :class="{ 'cp-ps-item--selected': isSelected(item) }"
    >
      <input
        :type="multi ? 'checkbox' : 'radio'"
        :value="item._id || item.label"
        :checked="isSelected(item)"
        :name="'project-' + (item._id || item.label)"
        @change="toggle(item)"
        class="cp-ps-check"
      />
      <span class="cp-ps-label">{{ item.name || item.label }}</span>
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  selectedProjects: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [] },
  multi: { type: Boolean, default: false }
})

const emit = defineEmits(['change'])

function isSelected(item) {
  return props.selectedProjects.includes(item.name || item.label)
}

function toggle(item) {
  const name = item.name || item.label
  let updated

  if (props.multi) {
    if (isSelected(item)) {
      updated = props.selectedProjects.filter(p => p !== name)
    } else {
      updated = [...props.selectedProjects, name]
    }
  } else {
    updated = isSelected(item) ? [] : [name]
  }

  emit('change', updated)
}
</script>

<style lang="less" scoped>
.cp-project-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .cp-ps-item {
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

    &:hover { border-color: #4a6cf7; }

    &--selected {
      background: #eef1ff;
      border-color: #4a6cf7;
      color: #4a6cf7;
      font-weight: 500;
    }

    .cp-ps-check { accent-color: #4a6cf7; cursor: pointer; }
    .cp-ps-label { cursor: pointer; }
  }
}
</style>
