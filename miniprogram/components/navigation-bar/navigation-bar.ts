Component({
  options: {
    multipleSlots: true
  },
  properties: {
    extClass: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: ''
    },
    background: {
      type: String,
      value: ''
    },
    color: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: true
    },
    loading: {
      type: Boolean,
      value: false
    },
    homeButton: {
      type: Boolean,
      value: false,
    },
    animated: {
      type: Boolean,
      value: true
    },
    show: {
      type: Boolean,
      value: true,
      observer: '_showChange'
    },
    delta: {
      type: Number,
      value: 1
    },
    tabs: {
      type: Array,
      value: []
    },
    activeTab: {
      type: String,
      value: ''
    }
  },
  data: {
    displayStyle: '',
    ios: false,
    innerPaddingRight: '',
    safeAreaTop: ''
  },
  lifetimes: {
    attached() {
      const rect = wx.getMenuButtonBoundingClientRect()
      wx.getSystemInfo({
        success: (res) => {
          const isAndroid = res.platform === 'android'
          const statusBarHeight = res.statusBarHeight || 0
          this.setData({
            ios: !isAndroid,
            innerPaddingRight: `padding-right: ${res.windowWidth - rect.left}px`,
            safeAreaTop: `height: calc(var(--height) + ${statusBarHeight}px); padding-top: ${statusBarHeight}px`
          })
        }
      })
    },
  },
  methods: {
    _showChange(show: boolean) {
      const animated = this.data.animated
      let displayStyle = ''
      if (animated) {
        displayStyle = `opacity: ${
          show ? '1' : '0'
        };transition:opacity 0.5s;`
      } else {
        displayStyle = `display: ${show ? '' : 'none'}`
      }
      this.setData({
        displayStyle
      })
    },
    back() {
      const data = this.data
      if (data.delta) {
        wx.navigateBack({
          delta: data.delta
        })
      }
      this.triggerEvent('back', { delta: data.delta }, {})
    },
    home() {
      wx.reLaunch({
        url: '/pages/index/index'
      })
      this.triggerEvent('home', {}, {})
    },
    onTabChange(e: any) {
      const key = e.currentTarget.dataset.key
      this.triggerEvent('tabchange', { key }, {})
    }
  },
})
