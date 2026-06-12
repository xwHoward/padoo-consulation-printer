<template>
  <Modal
    :show="show"
    title="加钟"
    confirm-text="确认加钟"
    @cancel="$emit('close')"
    @confirm="$emit('confirm')"
  >
    <div class="cp-extra">
      <div class="cp-extra-section">
        <div class="cp-extra-label">选择项目</div>
        <div class="cp-extra-projects">
          <div
            v-for="item in projects"
            :key="item._id"
            class="cp-extra-project"
            :class="{ 'cp-extra-project--selected': selectedProject === item._id }"
            @click="$emit('update:selectedProject', item._id); $emit('update:selectedProjectName', item.name)"
          >
            <span class="cp-extra-check" :class="{ checked: selectedProject === item._id }"></span>
            <span>{{ item.name }}</span>
          </div>
          <div v-if="projects.length === 0" class="cp-extra-empty">暂无可加钟项目</div>
        </div>
      </div>

      <div class="cp-extra-section">
        <div class="cp-extra-label">加钟数量</div>
        <div class="cp-extra-qty">
          <button class="cp-extra-qty-btn" @click="changeQty(-1)" :disabled="quantity <= 1">-</button>
          <span class="cp-extra-qty-val">{{ quantity }}</span>
          <button class="cp-extra-qty-btn" @click="changeQty(1)">+</button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  projects: { type: Array, default: () => [] },
  selectedProject: { type: String, default: '' },
  quantity: { type: Number, default: 1 }
})

const emit = defineEmits(['close', 'confirm', 'update:selectedProject', 'update:selectedProjectName', 'update:quantity'])

function changeQty(delta) {
  const newVal = props.quantity + delta
  if (newVal >= 1) emit('update:quantity', newVal)
}
</script>

<style lang="less" scoped>
.cp-extra {
  .cp-extra-section {
    margin-bottom: 16px;

    .cp-extra-label {
      font-size: 12px;
      color: #888;
      font-weight: 500;
      margin-bottom: 8px;
    }
  }

  .cp-extra-projects {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
  }

  .cp-extra-project {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    font-size: 13px;
    color: #555;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { border-color: #4a6cf7; background: #f8f9fb; }

    &--selected {
      border-color: #4a6cf7;
      background: #eef1ff;
      color: #4a6cf7;
      font-weight: 500;
    }

    .cp-extra-check {
      width: 16px;
      height: 16px;
      border: 2px solid #d0d5dd;
      border-radius: 50%;
      flex-shrink: 0;

      &.checked {
        border-color: #4a6cf7;
        background: #4a6cf7;
        box-shadow: inset 0 0 0 3px #fff;
      }
    }
  }

  .cp-extra-empty {
    padding: 16px;
    text-align: center;
    color: #999;
    font-size: 13px;
  }

  .cp-extra-qty {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: center;

    .cp-extra-qty-btn {
      width: 34px;
      height: 34px;
      border: 1px solid #d0d5dd;
      background: #fff;
      border-radius: 6px;
      font-size: 18px;
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
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .cp-extra-qty-val {
      font-size: 22px;
      font-weight: 700;
      color: #4a6cf7;
      min-width: 30px;
      text-align: center;
    }
  }
}
</style>
