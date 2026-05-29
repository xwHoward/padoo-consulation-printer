import {Collections, cloudDb} from '../../utils/cloud-db';
import {ReservationService} from '../../services/reservation.service';
import {BODY_PART_MAP, COUPON_PLATFORM_NAMES, COUPON_PLATFORMS, GENDERS, MASSAGE_STRENGTHS} from "../../utils/constants";
import {loadingService, LockKeys} from '../../utils/loading-service';
import {hasButtonPermission} from '../../utils/permission';
import {formatTime, getCurrentDate, getPreviousDate, getNextDate, parseProjectDuration} from "../../utils/util";

// 扩展记录类型，添加折叠状态
interface DisplayRecord extends ConsultationRecord {
  collapsed: boolean;
  dailyCount?: number;
  isInProgress?: boolean; // 是否进行中
}

// 定义每日咨询单集合
interface DailyGroup {
  date: string;
  records: DisplayRecord[];
}

function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return w;
}

function padVisual(s: string, targetWidth: number): string {
  return s + ' '.repeat(Math.max(0, targetWidth - visualWidth(s)));
}

function buildTableRow(cols: string[], widths: number[], sep: string): string {
  return sep + cols.map((c, i) => padVisual(c, widths[i])).join(sep) + sep;
}

const app = getApp<IAppOption>();


Page({
  data: {
    historyData: [] as DailyGroup[], // 按天分组的历史记录
    platforms: COUPON_PLATFORMS.reduce((acc, p) => ({...acc, [p._id]: p.name}), {}),
    genders: GENDERS.reduce((acc, g) => ({...acc, [g._id]: g.name}), {}),
    paymentPlatformLabels: COUPON_PLATFORM_NAMES,
    customerPhone: '', // 顾客手机号
    customerId: '', // 顾客ID
    loading: false, // 全局loading状态
    loadingText: '加载中...', // loading提示文字
    // 加钟弹窗
    extraTimeModal: {
      show: false,
      sourceRecordId: '' as string,
      sourceDate: '' as string,
      projects: [] as Project[],
      selectedProject: '' as string,
      selectedProjectName: '' as string,
      quantity: 1
    },
    // 日期选择器状态
    dateSelector: {
      selectedDate: '',
      maxDate: '',
      previousDate: '',
      nextDate: '',
      isToday: false
    },
    // 每日总结推送弹窗状态
    summaryModal: {
      show: false,
      content: '',
      loading: false
    },
    // 提前下钟确认弹窗状态
    earlyFinishModal: {
      show: false,
      recordId: '',
      technician: '',
      room: ''
    },
    canDelete: false // 是否有删除权限
  },

  onLoad(options) {
    // 检查删除权限
    this.setData({
      canDelete: hasButtonPermission('deleteConsultation')
    });

    // 检查是否为顾客只读模式
    if (options.readonly === 'true' && options.customerPhone && options.customerId) {
      this.loadCustomerHistory(options.customerPhone, options.customerId);
    } else {
      // 页面加载时获取当前日期的历史数据
      this.loadHistoryData(getCurrentDate());
    }
  },

  onShow() {
    // 顾客只读模式下不重新加载数据
    if (this.data.customerPhone) {
      return;
    }
    // 页面显示时重新加载当前日期的数据，确保数据最新
    const currentDate = getCurrentDate();
    if (this.data.dateSelector.selectedDate !== currentDate) {
      this.loadHistoryData(currentDate);
    }
  },

  onDatePickerChange(e: WechatMiniprogram.CustomEvent) {
    const selectedDate = e.detail.date;
    this.setData({
      'dateSelector.selectedDate': selectedDate
    });
    this.loadHistoryData(selectedDate);
  },

  async triggerRearrange(date: string): Promise<void> {
    return ReservationService.triggerRearrange(date);
  },

  // 加载顾客历史记录
  async loadCustomerHistory(customerPhone: string, customerId: string) {
    await loadingService.withLoading(this, async () => {
      const res = await wx.cloud.callFunction({
        name: 'getHistoryData',
        data: {
          action: 'loadCustomerHistory',
          customerPhone: customerPhone,
          customerId: customerId,
        }
      });
      if (!res.result || typeof res.result !== 'object') {
        throw new Error('加载顾客历史失败: 无返回数据');
      }

      if (res.result.code === 0) {
        const {historyData} = res.result.data;

        this.setData({
          historyData,
          customerPhone,
          customerId
        });
      } else {
        throw new Error(res.result.message || '加载失败');
      }
    }, {
      loadingText: '加载中...',
      lockKey: LockKeys.LOAD_HISTORY,
      errorText: '加载失败'
    });
  },

  // 加载历史数据
  async loadHistoryData(targetDate: string) {
    await loadingService.withLoading(this, async () => {
      const res = await wx.cloud.callFunction({
        name: 'getHistoryData',
        data: {
          action: 'loadSingleDate',
          targetDate: targetDate,
        }
      });
      if (!res.result || typeof res.result !== 'object') {
        throw new Error('加载历史数据失败: 无返回数据');
      }

      if (res.result.code === 0) {
        const {selectedDate, historyData} = res.result.data;
        const currentDate = getCurrentDate();
        const previousDate = getPreviousDate(selectedDate);
        const nextDate = getNextDate(selectedDate, currentDate);
        const isToday = selectedDate === currentDate;

        this.setData({
          'dateSelector.selectedDate': selectedDate,
          'dateSelector.maxDate': currentDate,
          'dateSelector.previousDate': previousDate,
          'dateSelector.nextDate': nextDate,
          'dateSelector.isToday': isToday,
          historyData
        });
      } else {
        throw new Error(res.result.message || '加载失败');
      }
    }, {
      loadingText: '加载中...',
      lockKey: LockKeys.LOAD_HISTORY,
      errorText: '加载失败'
    });
  },

  // 显示咨询单详情
  showConsultationDetail(e: WechatMiniprogram.TouchEvent) {
    const {record} = e.currentTarget.dataset;

    // 格式化咨询单详情文本
    const genderObj = GENDERS.find(g => g._id === record.gender);
    const genderText = genderObj ? genderObj.name : '';
    let detailText = `客户姓名: ${ record.surname } ${ genderText }\n`;
    detailText += `项目: ${ record.project }\n`;
    detailText += `技师: ${ record.technician }${ record.dailyCount && !record.isVoided ? `(${ record.dailyCount })` : '' }\n`;
    detailText += `房间: ${ record.room }\n`;
    detailText += `按摩力度: ${ this.getMassageStrengthText(record.massageStrength) }\n`;
    detailText += `精油选择: ${ this.getEssentialOilText(record.essentialOil) || '无' }\n`;

    // 处理加强部位
    const selectedParts = Object.keys(record.selectedParts).filter(part => record.selectedParts[part]);
    detailText += `加强部位: ${ selectedParts.length > 0 ? selectedParts.map(part => this.getPartName(part)).join(', ') : '无' }\n\n`;

    detailText += `创建时间: ${ formatTime(new Date(record.createdAt)) }\n`;
    detailText += `更新时间: ${ formatTime(new Date(record.updatedAt)) }\n`;
    detailText += `状态: ${ record.isVoided ? '已作废' : '正常' }`;

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
    const {record} = e.currentTarget.dataset;

    // 跳转到主页面，并传递要编辑的记录ID
    wx.navigateTo({
      url: `/pages/index/index?editId=${ record._id }`
    });
  },

  // 作废咨询单
  voidConsultation(e: WechatMiniprogram.TouchEvent) {
    const {record} = e.currentTarget.dataset;

    wx.showModal({
      title: '确认作废',
      content: '确定要作废该咨询单吗？',
      success: async (res) => {
        if (res.confirm) {
          await loadingService.withLoading(this, async () => {
            const updated = await cloudDb.updateById(
              Collections.CONSULTATION,
              record._id,
              {isVoided: true}
            );

            if (updated) {
              wx.showToast({
                title: '作废成功',
                icon: 'success'
              });
              await this.loadHistoryData(this.data.dateSelector.selectedDate);
              await this.triggerRearrange(record.date);
            } else {
              throw new Error('记录不存在');
            }
          }, {
            loadingText: '作废中...',
            lockKey: LockKeys.VOID_CONSULTATION,
            errorText: '操作失败'
          });
        }
      }
    });
  },

  // 提前下钟操作
  onEarlyFinish(e: WechatMiniprogram.TouchEvent) {
    const {record} = e.currentTarget.dataset;

    this.setData({
      'earlyFinishModal.show': true,
      'earlyFinishModal.recordId': record._id,
      'earlyFinishModal.technician': record.technician,
      'earlyFinishModal.room': record.room
    });
  },

  // 提前下钟确认弹窗 - 取消
  onEarlyFinishModalCancel() {
    this.setData({
      'earlyFinishModal.show': false
    });
  },

  // 提前下钟确认弹窗 - 确认
  async onEarlyFinishModalConfirm() {
    const {recordId} = this.data.earlyFinishModal;

    if (!recordId) {
      return;
    }

    this.setData({loading: true, loadingText: '更新中...'});

    try {
      const now = new Date();
      const newEndTime = formatTime(now, false);

      const success = await cloudDb.updateById(Collections.CONSULTATION, recordId, {
        endTime: newEndTime
      });

      if (success) {
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        });
        this.setData({
          'earlyFinishModal.show': false
        });
        // 提前下钟后触发重排
        await this.triggerRearrange(this.data.dateSelector.selectedDate);
        await this.loadHistoryData(this.data.dateSelector.selectedDate);
      } else {
        wx.showToast({
          title: '更新失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      });
    } finally {
      this.setData({loading: false});
    }
  },

  // 删除咨询单
  deleteConsultation(e: WechatMiniprogram.TouchEvent) {
    if (!hasButtonPermission('deleteConsultation')) {
      return;
    }

    const {record} = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除该咨询单吗？删除后无法恢复。',
      confirmText: '确认删除',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          this.setData({loading: true, loadingText: '删除中...'});
          try {
            const success = await cloudDb.deleteById(Collections.CONSULTATION, record._id);

            if (success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              await this.loadHistoryData(this.data.dateSelector.selectedDate);
              // 删除后触发重排
              await this.triggerRearrange(record.date);
            } else {
              wx.showToast({
                title: '记录不存在',
                icon: 'error'
              });
            }
          } catch (error) {
            wx.showToast({
              title: '删除失败',
              icon: 'error'
            });
          } finally {
            this.setData({loading: false});
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
    const {date} = e.currentTarget.dataset;

    this.setData({loading: true, loadingText: '生成统计中...'});
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

      const {technicianStats, monthlyScoreRanking, performanceMetrics} = res.result.data as {technicianStats: Record<string, TechnicianStats>; monthlyScoreRanking: MonthlyScoreRanking; performanceMetrics?: { technicians: Record<string, any> };} || {
        technicianStats: {},
        monthlyScoreRanking: {} as MonthlyScoreRanking,
        performanceMetrics: undefined
      };

      if (Object.keys(technicianStats).length === 0) {
        wx.showToast({
          title: '当日无记录',
          icon: 'error'
        });
        return;
      }

      let summaryText = `${ date } 每日总结\n${'='.repeat(20)}\n\n`;

      Object.keys(technicianStats).forEach(technician => {
        const stats = technicianStats[technician];
        summaryText += `技师: ${ technician }\n`;
        summaryText += `  总单数: ${ stats.totalCount }\n`;
        summaryText += `  点钟数: ${ stats.clockInCount }\n`;

        if (stats.extraTimeCount > 0) {
          summaryText += `  加钟数: ${ stats.extraTimeCount }\n`;
        }

        if (stats.overtime > 0) {
          summaryText += `  加班: ${ stats.overtime/2 }小时\n`;
        }

        if (stats.guashaCount > 0) {
          summaryText += `  刮痧: ${ stats.guashaCount }\n`;
        }

        summaryText += `  项目统计:\n`;
        Object.keys(stats.projects).forEach(project => {
          summaryText += `    ${ project }: ${ stats.projects[project] }\n`;
        });

        summaryText += `\n`;
      });

      const totalRecords = Object.values(technicianStats).reduce((sum: number, stats: TechnicianStats) => sum + stats.totalCount, 0);
      const totalClockIn = Object.values(technicianStats).reduce((sum: number, stats: TechnicianStats) => sum + stats.clockInCount, 0);
      const totalExtraTime = Object.values(technicianStats).reduce((sum: number, stats: TechnicianStats) => sum + (stats.extraTimeCount || 0), 0);
      const totalOvertime = Object.values(technicianStats).reduce((sum: number, stats: TechnicianStats) => sum + stats.overtime, 0);

      summaryText += `${'='.repeat(20)}\n`;
      summaryText += `总计\n`;
      summaryText += `  总单数: ${ totalRecords }\n`;
      summaryText += `  总点钟数: ${ totalClockIn }\n`;

      if (totalExtraTime > 0) {
        summaryText += `  总加钟数: ${ totalExtraTime }\n`;
      }
      if (totalOvertime > 0) {
        summaryText += `  总加班: ${ totalOvertime/2 }小时\n`;
      }

      if (monthlyScoreRanking && monthlyScoreRanking.rankings) {
        summaryText += `\n${'='.repeat(20)}\n`;
        summaryText += `${ monthlyScoreRanking.period.month }月排名\n\n`;

        const colWidths = [ 2, 1, 1, 1, 1, 1, 1];
        const headers = ['代号', '卡', '点', '回', '微', '总'];

        summaryText += buildTableRow(headers, colWidths, '┃') + '\n';

        monthlyScoreRanking.rankings.forEach((item) => {
          const perf = (performanceMetrics && performanceMetrics.technicians) ? performanceMetrics.technicians[item.technician] : null;

          const cells = [
            item.technician,
            String(item.salesCount),
            String(item.clockInCount),
            String(perf ? (perf.returnOrders || 0) : '-'),
            String(perf ? (perf.wechatAdds || 0) : '-'),
            String(item.totalScore),
          ];

          summaryText += buildTableRow(cells, colWidths, '┃') + '\n';
        });

      }

      this.setData({
        'summaryModal.show': true,
        'summaryModal.content': summaryText
      });

    } catch (error) {
      wx.showToast({
        title: '生成失败',
        icon: 'error'
      });
    } finally {
      this.setData({loading: false});
    }
  },

  // 切换记录的折叠状态
  toggleCollapse(e: WechatMiniprogram.TouchEvent) {
    const {groupIndex, recordIndex} = e.currentTarget.dataset;
    const key = `historyData[${ groupIndex }].records[${ recordIndex }].collapsed`;
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
    const {record, date} = e.currentTarget.dataset;
    const projects = (app.globalData.projects || []).filter((p: Project) => p.name && p.name.includes('[加]'));

    this.setData({
      extraTimeModal: {
        show: true,
        sourceRecordId: record._id,
        sourceDate: date,
        projects,
        selectedProject: '',
        selectedProjectName: '',
        quantity: 1
      }
    });
  },

  closeExtraTimeModal() {
    this.setData({
      'extraTimeModal.show': false
    });
  },

  selectExtraTimeProject(e: WechatMiniprogram.CustomEvent) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      'extraTimeModal.selectedProject': id,
      'extraTimeModal.selectedProjectName': name
    });
  },

  onExtraTimeQuantityChange(e: WechatMiniprogram.CustomEvent) {
    const { action } = e.currentTarget.dataset;
    const current = this.data.extraTimeModal.quantity;
    if (action === 'increase') {
      this.setData({ 'extraTimeModal.quantity': current + 1 });
    } else if (action === 'decrease' && current > 1) {
      this.setData({ 'extraTimeModal.quantity': current - 1 });
    }
  },

  async confirmExtraTime() {
    const { sourceRecordId, sourceDate, selectedProject, selectedProjectName, quantity } = this.data.extraTimeModal;
    if (!selectedProject) {
      wx.showToast({ title: '请选择一个加钟项目', icon: 'none' });
      return;
    }

    this.setData({ loading: true, loadingText: '加钟中...' });
    try {
      const record = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, sourceRecordId);
      if (!record) {
        wx.showToast({ title: '未找到原始单据', icon: 'error' });
        return;
      }

      const [endH, endM] = record.endTime.split(':').map(Number);
      const [year, month, day] = record.date.split('-').map(Number);
      const startTimeDate = new Date(year, month - 1, day, endH, endM, 0, 0);
      const startTime = formatTime(startTimeDate, false);

      const duration = parseProjectDuration(selectedProjectName) || 90;
      const totalDuration = duration * quantity;
      const endTimeDate = new Date(startTimeDate.getTime() + totalDuration * 60 * 1000);
      const endTime = formatTime(endTimeDate, false);

      const extraRecord: Add<ConsultationRecord> = {
        surname: record.surname,
        gender: record.gender,
        project: selectedProjectName,
        technician: record.technician,
        room: record.room,
        massageStrength: record.massageStrength,
        essentialOil: record.essentialOil,
        selectedParts: record.selectedParts || {},
        isClockIn: false,
        remarks: record.remarks || '',
        phone: record.phone || '',
        couponCode: '',
        couponPlatform: record.couponPlatform || 'meituan',
        extraTime: 0,
        date: record.date,
        startTime,
        endTime,
        isVoided: false,
        overtime: 0,
        guasha: false,
        isExtraTime: true
      };

      await cloudDb.saveConsultation(extraRecord);

      this.closeExtraTimeModal();
      await this.loadHistoryData(sourceDate);
      await this.triggerRearrange(sourceDate);
      wx.showToast({ title: '加钟成功', icon: 'success' });
    } catch (error: any) {
      wx.showToast({
        title: error?.message || '加钟失败',
        icon: 'error'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 刮痧操作
  async onGuasha(e: WechatMiniprogram.TouchEvent) {
    const {record, date} = e.currentTarget.dataset;
    const currentGuasha = record.guasha || false;
    const newGuasha = !currentGuasha;

    this.setData({loading: true, loadingText: '更新中...'});

    try {
      const updateData: {guasha: boolean; guashaTime?: number; endTime?: string;} = {guasha: newGuasha};

      // 使用记录的日期构建Date对象，避免跨日计算错误
      const [year, month, day] = record.date.split('-').map(Number);

      if (newGuasha) {
        updateData.guashaTime = 15;

        const [hours, minutes] = record.endTime.split(':').map(Number);
        const endDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

        const newEndDate = new Date(endDate.getTime() + 15 * 60 * 1000);
        updateData.endTime = formatTime(newEndDate, false);
      } else {
        updateData.guashaTime = undefined;

        if (record.guashaTime) {
          const [hours, minutes] = record.endTime.split(':').map(Number);
          const endDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

          const newEndDate = new Date(endDate.getTime() - 15 * 60 * 1000);
          updateData.endTime = formatTime(newEndDate, false);
        }
      }

      await cloudDb.updateById(Collections.CONSULTATION, record._id, updateData);
      
      // 刮痧变更后触发重排
      await this.triggerRearrange(date);
      
      wx.showToast({
        title: newGuasha ? '已添加刮痧' : '已取消刮痧',
        icon: 'success'
      });
      await this.loadHistoryData(date);
    } catch (error) {
      wx.showToast({
        title: '更新失败',
        icon: 'error'
      });
    } finally {
      this.setData({loading: false});
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

  // 每日总结弹窗 - 复制到剪贴板
  async onSummaryModalConfirm() {
    const {content} = this.data.summaryModal;

    if (!content || content.trim() === '') {
      wx.showToast({title: '总结内容不能为空', icon: 'none'});
      return;
    }

    this.setData({'summaryModal.loading': true});

    try {
      await wx.setClipboardData({
        data: content
      });
      
      wx.showToast({title: '已复制到剪贴板', icon: 'success', duration: 2000});
      setTimeout(() => {
        this.onSummaryModalCancel();
      }, 1500);
    } catch (error) {
      wx.showToast({title: '复制失败，请重试', icon: 'none'});
    } finally {
      this.setData({'summaryModal.loading': false});
    }
  },

  formatTime,
});
