import { formatDate } from '../../utils/util';

interface TechCard {
  _id: string;
  name: string;
  avatar?: string;
  gender: string;
  latestAppointment?: string;
  availableMinutes?: number;
  status: 'available' | 'busy' | 'off_duty';
}

Page({
  data: {
    loading: true,
    techList: [] as TechCard[],
  },

  onLoad() {
    this.loadAvailableTechnicians();
    this.startAutoRefresh();
  },

  onUnload() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.setKeepScreenOff();
  },

  onShow() {
    this.setKeepScreenOn();
  },

  onHide() {
    this.setKeepScreenOff();
  },

  refreshTimer: null as number | null,

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    });
  },


  async loadAvailableTechnicians() {
    this.setData({ loading: true });

    try {
      const now = new Date();
      const today = formatDate(now);

      const result = await wx.cloud.callFunction({
        name: 'getAvailableTechnicians',
        data: {
          date: today,
          mode: 'availability'
        }
      });

      if (!result.result || typeof result.result !== 'object') {
        throw new Error('获取技师信息失败');
      }
      if (result.result.code === 0) {
        this.setData({
          techList: result.result.data,
          loading: false
        });
      } else {
        this.setData({ loading: false });
      }
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  startAutoRefresh() {
    this.refreshTimer = setInterval(() => {
      this.loadAvailableTechnicians();
    }, 60000);
  },

  setKeepScreenOn() {
    wx.setKeepScreenOn({
      keepScreenOn: true
    });
  },

  setKeepScreenOff() {
    wx.setKeepScreenOn({
      keepScreenOn: false
    });
  },
});
