<template>
  <Modal
    :show="show"
    title="确认推送内容"
    :loading="loading"
    loading-text="推送中..."
    confirm-text="推送"
    cancel-text="不推送"
    @cancel="$emit('cancel')"
    @confirm="$emit('confirm')"
  >
    <div class="cp-push">
      <textarea
        class="cp-push-textarea"
        :value="message"
        @input="$emit('update:message', $event.target.value)"
        placeholder="请输入推送内容"
        maxlength="1000"
        rows="5"
      ></textarea>
      <span class="cp-push-count">{{ (message || '').length }}/1000</span>
    </div>
    <div class="cp-push-tip">
      <span>确认后将推送到企业微信群聊</span>
    </div>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

defineProps({
  show: { type: Boolean, default: false },
  message: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})

defineEmits(['cancel', 'confirm', 'update:message'])
</script>

<style lang="less" scoped>
.cp-push {
  .cp-push-textarea {
    width: 100%;
    border: 1px solid #d0d5dd;
    border-radius: 6px;
    padding: 10px;
    font-size: 13px;
    color: #333;
    outline: none;
    resize: vertical;
    min-height: 80px;
    box-sizing: border-box;
    font-family: inherit;

    &:focus { border-color: #4a6cf7; }

    &::placeholder { color: #b0b8c1; }
  }
  .cp-push-count {
    display: block;
    text-align: right;
    font-size: 11px;
    color: #999;
    margin-top: 4px;
  }
}

.cp-push-tip {
  margin-top: 10px;
  font-size: 12px;
  color: #888;
  text-align: center;
}
</style>
