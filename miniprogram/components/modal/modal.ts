Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ''
    },
    size: {
      type: String,
      value: ''
    },
    showClose: {
      type: Boolean,
      value: true
    },
    showCancel: {
      type: Boolean,
      value: true
    },
    showFooter: {
      type: Boolean,
      value: true
    },
    cancelText: {
      type: String,
      value: '取消'
    },
    confirmText: {
      type: String,
      value: '确定'
    },
    loading: {
      type: Boolean,
      value: false
    },
    loadingText: {
      type: String,
      value: '加载中...'
    },
    maskClosable: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    handleMaskTap() {
      if (this.properties.maskClosable) {
        this.triggerEvent('cancel');
      }
    },

    handleClose() {
      this.triggerEvent('cancel');
    },

    handleCancel() {
      this.triggerEvent('cancel');
    },

    handleConfirm() {
      if (this.properties.loading) {
        return;
      }
      this.triggerEvent('confirm');
    },

    stopPropagation() {
      // 阻止事件冒泡
    }
  }
});
