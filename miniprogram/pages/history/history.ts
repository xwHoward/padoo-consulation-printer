import { Collections, cloudDb } from '../../utils/cloud-db';
import { COUPON_PLATFORMS, GENDERS, MASSAGE_STRENGTHS } from "../../utils/constants";
import { calculateProjectEndTime, formatTime } from "../../utils/util";

// 扩展记录类型，添加折叠状态
interface DisplayRecord extends ConsultationRecord {
  collapsed: boolean;
  dailyCount?: number;
}

// 定义每日咨询单集合
interface DailyGroup {
  date: string;
  records: DisplayRecord[];
}

const BODY_PART_MAP = {
  'head': '头部',
  'neck': '颈部',
  'shoulder': '肩部',
  'back': '后背',
  'arm': '手臂',
  'abdomen': '腹部',
  'waist': '腰部',
  'thigh': '大腿',
  'calf': '小腿'
};
const app = getApp<IAppOption>();


Page({
  data: {
    historyData: [] as DailyGroup[], // 按天分组的历史记录
    platforms: COUPON_PLATFORMS.reduce((acc, p) => ({ ...acc, [p._id]: p.name }), {}),
    genders: GENDERS.reduce((acc, g) => ({ ...acc, [g._id]: g.name }), {}),
    paymentPlatformLabels: {
      meituan: '美团',
      dianping: '大众点评',
      douyin: '抖音',
      wechat: '微信',
      alipay: '支付宝',
      cash: '现金',
      gaode: '高德',
      free: '免单',
      membership: '划卡'
    },
    customerPhone: '', // 顾客手机号
    customerId: '', // 顾客ID
    loading: false, // 全局loading状态
    loadingText: '加载中...', // loading提示文字
    // 数字输入弹窗状态
    numberInputModal: {
      show: false,
      title: '',
      type: '' as 'extraTime' | 'overtime',
      currentValue: 0,
      inputValue: 1,
      record: null as DisplayRecord | null,
      date: ''
    },
    // 日期选择器状态
    dateSelector: {
      show: false,
      selectedDate: '',
      availableDates: [] as string[]
    },
    // 每日总结推送弹窗状态
    summaryModal: {
      show: false,
      content: '',
      loading: false
    }
  },

  onLoad(options) {
    // 检查是否为顾客只读模式
    if (options.readonly === 'true' && options.customerPhone && options.customerId) {
      this.loadCustomerHistory(options.customerPhone, options.customerId);
    } else {
      // 页面加载时获取历史数据，默认只获取当日的记录
      this.loadHistoryData();
    }
  },

  onShow() {
    // 顾客只读模式下不重新加载数据
    if (this.data.customerPhone) {
      return;
    }
    // 页面显示时重新加载数据，确保数据最新
    this.loadHistoryData();
  },

  // 显示日期选择器
  showDateSelector() {
    this.setData({
      'dateSelector.show': true
    });
  },

  // 关闭日期选择器
  hideDateSelector() {
    this.setData({
      'dateSelector.show': false
    });
  },

  // 选择日期
  onDateSelect(e: WechatMiniprogram.CustomEvent) {
    const selectedDate = e.currentTarget.dataset.date;
    this.setData({
      'dateSelector.selectedDate': selectedDate,
      'dateSelector.show': false
    });
    // 加载选中日期的记录
    this.loadHistoryData(selectedDate);
  },

  // 加载顾客历史记录
  async loadCustomerHistory(customerPhone: string, customerId: string) {
    this.setData({ loading: true, loadingText: '加载中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getHistoryData',
        data: {
          action: 'loadCustomerHistory',
          customerPhone: customerPhone,
          customerId: customerId,
          updateOvertime: true
        }
      });
      if (!res.result || typeof res.result !== 'object') {
        throw new Error('加载顾客历史失败: 无返回数据');
      }

      if (res.result.code === 0) {
        const { historyData } = res.result.data;

        this.setData({
          historyData,
          customerPhone,
          customerId
        });
      } else {
        wx.showToast({
          title: res.result.message || '加载失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('加载顾客历史失败:', error);
      wx.showToast({ title: '加载失败', icon: 'error' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载历史数据
  async loadHistoryData(targetDate?: string) {
    this.setData({ loading: true, loadingText: '加载中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getHistoryData',
        data: {
          action: 'loadAllDates',
          targetDate: targetDate,
          updateOvertime: true
        }
      });
      if (!res.result || typeof res.result !== 'object') {
        throw new Error('加载历史数据失败: 无返回数据');
      }

      if (res.result.code === 0) {
        const { allDates, selectedDate, historyData } = res.result.data;

        this.setData({
          dateSelector: {
            show: false,
            selectedDate: selectedDate,
            availableDates: allDates
          },
          historyData
        });
      } else {
        wx.showToast({
          title: res.result.message || '加载失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('加载历史数据失败:', error);
      wx.showToast({ title: '加载失败', icon: 'error' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 显示咨询单详情
  showConsultationDetail(e: WechatMiniprogram.TouchEvent) {
    const { record } = e.currentTarget.dataset;

    // 格式化咨询单详情文本
    const genderObj = GENDERS.find(g => g._id === record.gender);
    const genderText = genderObj ? genderObj.name : '';
    let detailText = `客户姓名: ${record.surname} ${genderText}\n`;
    detailText += `项目: ${record.project}\n`;
    detailText += `技师: ${record.technician}${record.dailyCount && !record.isVoided ? `(${record.dailyCount})` : ''}\n`;
    detailText += `房间: ${record.room}\n`;
    detailText += `按摩力度: ${this.getMassageStrengthText(record.massageStrength)}\n`;
    detailText += `精油选择: ${this.getEssentialOilText(record.essentialOil) || '无'}\n`;

    // 处理升级选项
    if (record.upgradeHimalayanSaltStone) {
      detailText += `升级选项: 冬季喜马拉雅热油盐石\n`;
    }

    // 处理加强部位
    const selectedParts = Object.keys(record.selectedParts).filter(part => record.selectedParts[part]);
    detailText += `加强部位: ${selectedParts.length > 0 ? selectedParts.map(part => this.getPartName(part)).join(', ') : '无'}\n\n`;

    detailText += `创建时间: ${formatTime(new Date(record.createdAt))}\n`;
    detailText += `更新时间: ${formatTime(new Date(record.updatedAt))}\n`;
    detailText += `状态: ${record.isVoided ? '已作废' : '正常'}`;

    // 显示详情
    wx.showModal({
      title: '咨询单详情',
      content: detailText,
      showCancel: false,
      confirmText: '确定'
    });
  },

  // 修改咨询单
  editConsultation(e: WechatMiniprogram.TouchEvent) {
    const { record } = e.currentTarget.dataset;

    // 跳转到主页面，并传递要编辑的记录ID
    wx.navigateTo({
      url: `/pages/index/index?editId=${record._id}`
    });
  },

  // 作废咨询单
  voidConsultation(e: WechatMiniprogram.TouchEvent) {
    const { record } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认作废',
      content: '确定要作废该咨询单吗？',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ loading: true, loadingText: '作废中...' });
          try {


            const updated = await cloudDb.updateById(
              Collections.CONSULTATION,
              record._id,
              { isVoided: true }
            );

            if (updated) {
              wx.showToast({
                title: '作废成功',
                icon: 'success'
              });
              await this.loadHistoryData();
            } else {
              console.error('未找到要作废的记录:', record._id);
              wx.showToast({
                title: '记录不存在',
                icon: 'error'
              });
            }

          } catch (error) {
            console.error('作废咨询单失败:', error);
            wx.showToast({
              title: '操作失败',
              icon: 'error'
            });
          } finally {
            this.setData({ loading: false });
          }
        }
      }
    });
  },

  // 获取按摩力度文本
  getMassageStrengthText(strength: string): string {
    const found = MASSAGE_STRENGTHS.find(s => s._id === strength);
    return found ? found.name.split(' ')[0] : ''; // 只取中文部分
  },

  // 获取精油选择文本
  getEssentialOilText(oil: string): string {
    const found = app.globalData.essentialOils.find(o => o._id === oil);
    return found ? found.name : '';
  },

  // 获取加强部位名称
  getPartName(part: string): string {
    return BODY_PART_MAP[part as keyof typeof BODY_PART_MAP] || '';
  },

  // 生成当日总结
  async onGenerateSummary(e: WechatMiniprogram.TouchEvent) {
    const { date } = e.currentTarget.dataset;

    this.setData({ loading: true, loadingText: '生成统计中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getHistoryData',
        data: {
          action: 'getDailySummary',
          targetDate: date
        }
      });

      if (!res.result || typeof res.result !== 'object') {
        throw new Error('获取数据失败: 无返回数据');
      }

      if (res.result.code !== 0) {
        wx.showToast({
          title: res.result.message || '获取数据失败',
          icon: 'error'
        });
        return;
      }

      const { technicianStats } = res.result.data;

      if (Object.keys(technicianStats).length === 0) {
        wx.showToast({
          title: '当日无记录',
          icon: 'error'
        });
        return;
      }

      let summaryText = `# ${date} 每日总结\n\n`;

      Object.keys(technicianStats).forEach(technician => {
        const stats = technicianStats[technician];
        summaryText += `技师: **${technician}**\n`;
        summaryText += `总单数: ${stats.totalCount}\n`;
        summaryText += `点钟数: ${stats.clockInCount}\n`;

        if (stats.extraTimeTotal > 0) {
          summaryText += `加钟: ${stats.extraTimeCount}\n`;
        }

        if (stats.overtimeTotal > 0) {
          const overtimeHours = (stats.overtimeTotal * 0.5).toFixed(1);
          summaryText += `加班: ${stats.overtimeCount} (${overtimeHours}小时)\n`;
        }

        summaryText += `项目统计:\n`;

        Object.keys(stats.projects).forEach(project => {
          summaryText += `-  ${project}: ${stats.projects[project]}\n`;
        });

        summaryText += `\n`;
      });

      const totalRecords = Object.values(technicianStats).reduce((sum: number, stats: any) => sum + stats.totalCount, 0);
      const totalClockIn = Object.values(technicianStats).reduce((sum: number, stats: any) => sum + stats.clockInCount, 0);
      const totalExtraTime = Object.values(technicianStats).reduce((sum: number, stats: any) => sum + stats.extraTimeTotal, 0);
      const totalOvertime = Object.values(technicianStats).reduce((sum: number, stats: any) => sum + stats.overtimeTotal, 0);

      summaryText += `# 总计\n`;
      summaryText += `总单数: **${totalRecords}**\n`;
      summaryText += `总点钟数: **${totalClockIn}**\n`;

      if (totalExtraTime > 0) {
        summaryText += `总加钟: **${(totalExtraTime)}\n`;
      }
      if (totalOvertime > 0) {
        summaryText += `总加班: **${(totalOvertime)}\n`;
      }

      this.setData({
        'summaryModal.show': true,
        'summaryModal.content': summaryText
      });

    } catch (error) {
      console.error('生成总结失败:', error);
      wx.showToast({
        title: '生成失败',
        icon: 'error'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 切换记录的折叠状态
  toggleCollapse(e: WechatMiniprogram.TouchEvent) {
    const { groupIndex, recordIndex } = e.currentTarget.dataset;
    const key = `historyData[${groupIndex}].records[${recordIndex}].collapsed`;
    const currentValue = this.data.historyData[groupIndex].records[recordIndex].collapsed;

    this.setData({
      [key]: !currentValue
    });
  },

  // 返回主页面
  goBack() {
    wx.navigateBack();
  },

  // 加钟操作 - 显示弹窗
  onExtraTime(e: WechatMiniprogram.TouchEvent) {
    const { record, date } = e.currentTarget.dataset;
    const currentValue = record.extraTime || 0;

    this.setData({
      numberInputModal: {
        show: true,
        title: '加钟',
        type: 'extraTime',
        currentValue: currentValue,
        inputValue: currentValue, // 默认显示当前值
        record: record,
        date: date
      }
    });
  },

  // 步进按钮 - 减少
  onStepMinus() {
    const currentInput = this.data.numberInputModal.inputValue;
    if (currentInput > 0) { // 最小值为0
      this.setData({
        'numberInputModal.inputValue': currentInput - 1
      });
    }
  },

  // 步进按钮 - 增加
  onStepPlus() {
    const currentInput = this.data.numberInputModal.inputValue;
    this.setData({
      'numberInputModal.inputValue': currentInput + 1
    });
  },

  // 输入框输入
  onNumberInput(e: WechatMiniprogram.Input) {
    const value = parseInt(e.detail.value, 10);
    if (!isNaN(value) && value >= 0) { // 允许输入0
      this.setData({
        'numberInputModal.inputValue': value
      });
    } else if (e.detail.value === '') {
      this.setData({
        'numberInputModal.inputValue': 0
      });
    }
  },

  // 弹窗取消
  onModalCancel() {
    this.setData({
      'numberInputModal.show': false
    });
  },

  // 弹窗确认
  async onModalConfirm() {
    const { type, inputValue, record, date } = this.data.numberInputModal;

    if (!record || inputValue < 0) {
      wx.showToast({
        title: '请输入有效数字',
        icon: 'none'
      });
      return;
    }

    await this.updateExtraTimeOrOvertime(record._id, date, type, inputValue);

    this.setData({
      'numberInputModal.show': false
    });

    if (type === 'overtime') {
      return;
    }

    if (inputValue > 0) {
      const typeText = type === 'extraTime' ? '加钟' : '加班';

      const currentTime = new Date();
      const durationMinutes = inputValue * 30;
      const endTime = new Date(currentTime.getTime() + durationMinutes * 60 * 1000 + 5 * 60 * 1000);

      const startTimeStr = formatTime(currentTime, false);
      const endTimeStr = formatTime(endTime, false);

      const genderObj = GENDERS.find(g => g._id === record.gender);
      const genderText = genderObj ? genderObj.name : '';
      const clockInfo = `顾客：${record.surname}${genderText}
项目：${typeText}(${inputValue})
技师：${record.technician}
房间：${record.room}
时间：${startTimeStr} - ${endTimeStr}`;

      wx.setClipboardData({
        data: clockInfo,
        success: () => {
          wx.showToast({
            title: `${typeText}信息已复制`,
            icon: 'success'
          });
        }
      });
    } else {
      wx.showToast({
        title: '已清除',
        icon: 'success'
      });
    }
  },

  // 更新加钟或加班数据
  async updateExtraTimeOrOvertime(recordId: string, date: string, field: 'extraTime' | 'overtime', value: number) {
    this.setData({ loading: true, loadingText: field === 'extraTime' ? '更新加钟中...' : '更新加班中...' });
    try {


      const updateData: any = { [field]: value };

      if (field === 'extraTime') {
        const record = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, recordId) as ConsultationRecord | null;
        if (record) {
          const [hours, minutes] = record.startTime.split(':').map(Number);
          const startDate = new Date();
          startDate.setHours(hours, minutes, 0, 0);

          const endDate = calculateProjectEndTime(startDate, record.project, value);
          updateData.endTime = formatTime(endDate, false);
        }
      }

      await cloudDb.updateById(Collections.CONSULTATION, recordId, updateData);


      await this.loadHistoryData();
    } catch (error) {
      console.error('更新失败:', error);
      wx.showToast({
        title: '更新失败',
        icon: 'error'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 每日总结弹窗 - 关闭
  onSummaryModalCancel() {
    this.setData({
      'summaryModal.show': false,
      'summaryModal.content': ''
    });
  },

  // 每日总结弹窗 - 内容修改
  onSummaryContentInput(e: WechatMiniprogram.CustomEvent) {
    const value = e.detail.value;
    this.setData({
      'summaryModal.content': value
    });
  },

  // 每日总结弹窗 - 确认推送到企业微信
  async onSummaryModalConfirm() {
    const { content } = this.data.summaryModal;
    
    if (!content || content.trim() === '') {
      wx.showToast({ title: '总结内容不能为空', icon: 'none' });
      return;
    }

    this.setData({ 'summaryModal.loading': true });

    try {
      
      const res = await wx.cloud.callFunction({
        name: 'sendWechatMessage',
        data: {
          content: content
        }
      });

      if (res.result && typeof res.result === 'object') {
        const result = res.result as { code: number; message?: string };
        if (result.code === 0) {
          wx.showToast({ title: '推送成功', icon: 'success', duration: 2000 });
          setTimeout(() => {
            this.onSummaryModalCancel();
          }, 1500);
        } else {
          wx.showToast({ title: '推送失败，请重试', icon: 'none' });
        }
      } else {
        wx.showToast({ title: '推送失败，请重试', icon: 'none' });
      }
    } catch (error) {
      console.error('推送到企业微信失败:', error);
      wx.showToast({ title: '推送失败，请重试', icon: 'none' });
    } finally {
      this.setData({ 'summaryModal.loading': false });
    }
  },

  formatTime,
});
