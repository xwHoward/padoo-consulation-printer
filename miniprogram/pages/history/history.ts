import {COUPON_PLATFORMS, GENDERS, MASSAGE_STRENGTHS} from "../../utils/constants";
import {Collections, db} from "../../utils/db";
import {calculateOvertimeUnits, calculateProjectEndTime, formatTime, SHIFT_END_TIMES} from "../../utils/util";

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

Page({
  data: {
    historyData: [] as DailyGroup[], // 按天分组的历史记录
    platforms: COUPON_PLATFORMS.reduce((acc, p) => ({...acc, [p.id]: p.name}), {}),
    genders: GENDERS.reduce((acc, g) => ({...acc, [g.id]: g.name}), {}),
    customerPhone: '', // 顾客手机号
    customerId: '', // 顾客ID
    // 数字输入弹窗状态
    numberInputModal: {
      show: false,
      title: '',
      type: '' as 'extraTime' | 'overtime',
      currentValue: 0,
      inputValue: 1,
      record: null as DisplayRecord | null,
      date: ''
    }
  },

  onLoad(options: any) {
    // 检查是否为顾客只读模式
    if (options.readonly === 'true' && options.customerPhone) {
      this.loadCustomerHistory(options.customerPhone, options.customerId);
    } else {
      // 页面加载时获取历史数据
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

  // 处理单日记录（计算计数、补全时间、排序）
  processDailyRecords(records: ConsultationRecord[]): DisplayRecord[] {
    // 按时间正序排列当天的记录（用于计算报钟顺序）
    const sortedByTime = [...records].sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // 计算每个记录的报钟数量
    const technicianCounts: Record<string, number> = {};
    const recordsWithCount = sortedByTime.map(record => {
      // 初始化技师计数
      if (!technicianCounts[record.technician]) {
        technicianCounts[record.technician] = 0;
      }

      // 如果记录未作废，增加计数
      if (!record.isVoided) {
        technicianCounts[record.technician]++;
      }

      // 兼容旧数据：如果没有 startTime/endTime 字段，动态计算
      let startTimeStr = record.startTime;
      let endTimeStr = record.endTime;

      if (!startTimeStr || !endTimeStr) {
        const createdDate = new Date(record.createdAt);
        startTimeStr = formatTime(createdDate, false);
        const endDate = calculateProjectEndTime(createdDate, record.project, record.extraTime || 0);
        endTimeStr = formatTime(endDate, false);
      }

      // 返回带计数的记录，已作废的默认折叠
      return {
        ...record,
        dailyCount: record.isVoided ? 0 : technicianCounts[record.technician],
        startTime: startTimeStr,
        endTime: endTimeStr,
        collapsed: record.isVoided // 已作废的默认折叠
      } as DisplayRecord;
    });

    // 按时间倒序排列当天的记录（用于显示）
    return recordsWithCount.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  },

  // 加载顾客历史记录
  loadCustomerHistory(customerPhone: string, customerId: string) {
    try {
      const consultationHistory = wx.getStorageSync('consultationHistory') || {};
      const historyData: DailyGroup[] = [];

      Object.keys(consultationHistory).forEach(date => {
        const records = consultationHistory[date] as ConsultationRecord[];
        if (records && records.length > 0) {
          // 过滤出该顾客的记录
          const customerRecords = records.filter(record => {
            const recordKey = record.phone || record.id;
            return recordKey === customerId && !record.isVoided;
          });

          if (customerRecords.length > 0) {
            // 自动计算该日期所有记录的加班
            this.autoUpdateOvertimeForDate(date);

            // 重新获取更新后的记录
            const updatedRecords = wx.getStorageSync('consultationHistory')[date] as ConsultationRecord[];

            // 再次过滤并处理
            const filteredRecords = updatedRecords.filter(record => {
              const recordKey = record.phone || record.id;
              return recordKey === customerId && !record.isVoided;
            });

            historyData.push({
              date,
              records: this.processDailyRecords(filteredRecords)
            });
          }
        }
      });

      // 按日期倒序排列
      historyData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      this.setData({
        historyData,
        customerPhone,
        customerId
      });
    } catch (error) {
      console.error('加载顾客历史失败:', error);
      wx.showToast({title: '加载失败', icon: 'error'});
    }
  },

  // 加载历史数据
  loadHistoryData() {
    try {
      const consultationHistory = wx.getStorageSync('consultationHistory') || {};
      const historyData: DailyGroup[] = [];

      Object.keys(consultationHistory).forEach(date => {
        const records = consultationHistory[date] as ConsultationRecord[];
        if (records && records.length > 0) {
          // 自动计算该日期所有记录的加班
          this.autoUpdateOvertimeForDate(date);

          // 重新获取更新后的记录
          const updatedRecords = wx.getStorageSync('consultationHistory')[date] as ConsultationRecord[];

          historyData.push({
            date,
            records: this.processDailyRecords(updatedRecords)
          });
        }
      });

      // 按日期倒序排列
      historyData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      this.setData({historyData});
    } catch (error) {
      console.error('加载历史数据失败:', error);
      wx.showToast({title: '加载失败', icon: 'error'});
    }
  },

  // 显示咨询单详情
  showConsultationDetail(e: WechatMiniprogram.TouchEvent) {
    const {record} = e.currentTarget.dataset;

    // 格式化咨询单详情文本
    const genderObj = GENDERS.find(g => g.id === record.gender);
    const genderText = genderObj ? genderObj.name : '';
    let detailText = `客户姓名: ${ record.surname } ${ genderText }\n`;
    detailText += `项目: ${ record.project }\n`;
    detailText += `技师: ${ record.technician }${ record.dailyCount && !record.isVoided ? `(${ record.dailyCount })` : '' }\n`;
    detailText += `房间: ${ record.room }\n`;
    detailText += `按摩力度: ${ this.getMassageStrengthText(record.massageStrength) }\n`;
    detailText += `精油选择: ${ record.essentialOil || '无' }\n`;

    // 处理升级选项
    if (record.upgradeHimalayanSaltStone) {
      detailText += `升级选项: 冬季喜马拉雅热油盐石\n`;
    }

    // 处理加强部位
    const selectedParts = Object.keys(record.selectedParts).filter(part => record.selectedParts[part]);
    detailText += `加强部位: ${ selectedParts.length > 0 ? selectedParts.join(', ') : '无' }\n\n`;

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
      url: `/pages/index/index?editId=${ record.id }`
    });
  },

  // 作废咨询单
  voidConsultation(e: WechatMiniprogram.TouchEvent) {
    const {record, date} = e.currentTarget.dataset;

    // 确认作废操作
    wx.showModal({
      title: '确认作废',
      content: '确定要作废该咨询单吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            // 获取当前历史数据
            const consultationHistory = wx.getStorageSync('consultationHistory') || {};

            // 确保 consultationHistory 是一个对象
            if (typeof consultationHistory === 'object' && consultationHistory !== null) {
              // 找到对应的咨询单并标记为作废
              const dailyRecords = consultationHistory[date];

              // 确保 dailyRecords 是一个数组
              if (Array.isArray(dailyRecords)) {
                const recordIndex = dailyRecords.findIndex(item => item.id === record.id);

                if (recordIndex !== -1) {
                  dailyRecords[recordIndex].isVoided = true;
                  dailyRecords[recordIndex].updatedAt = new Date().toISOString();

                  // 更新缓存
                  wx.setStorageSync('consultationHistory', consultationHistory);

                  // 重新加载数据
                  this.loadHistoryData();

                  wx.showToast({
                    title: '作废成功',
                    icon: 'success'
                  });
                } else {
                  console.error('未找到要作废的记录:', record.id);
                  wx.showToast({
                    title: '记录不存在',
                    icon: 'error'
                  });
                }
              } else {
                console.error('当日记录不是数组:', dailyRecords);
                wx.showToast({
                  title: '数据格式错误',
                  icon: 'error'
                });
              }
            } else {
              console.error('历史数据格式错误:', consultationHistory);
              wx.showToast({
                title: '数据格式错误',
                icon: 'error'
              });
            }
          } catch (error) {
            console.error('作废咨询单失败:', error);
            wx.showToast({
              title: '操作失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  // 获取按摩力度文本
  getMassageStrengthText(strength: string): string {
    const found = MASSAGE_STRENGTHS.find(s => s.id === strength);
    return found ? found.name.split(' ')[0] : ''; // 只取中文部分
  },

  // 获取技师在特定日期的报钟数量（用于历史记录显示）
  getTechnicianDailyCountForRecord(technician: string, recordDate: string, recordId: string): number {
    try {
      const cachedData = wx.getStorageSync('consultationHistory') || {};

      // 检查该日期是否有记录
      if (!cachedData[recordDate]) {
        return 1;
      }

      const records = cachedData[recordDate];
      let count = 0;

      // 遍历该日期的所有记录，计算在当前记录之前的有效报钟数量
      for (const record of records) {
        // 只计算未作废的记录，并且是当前记录或在当前记录之前创建的
        if (record.technician === technician && !record.isVoided) {
          count++;

          // 如果是当前记录，停止计数
          if (record.id === recordId) {
            break;
          }
        }
      }

      return count;
    } catch (error) {
      console.error('计算技师报钟数量失败:', error);
      return 1;
    }
  },

  // 生成当日总结
  onGenerateSummary(e: WechatMiniprogram.TouchEvent) {
    const {date} = e.currentTarget.dataset;

    try {
      // 获取该日期的所有记录
      const cachedData = wx.getStorageSync('consultationHistory') || {};
      if (!cachedData[date]) {
        wx.showToast({
          title: '当日无记录',
          icon: 'error'
        });
        return;
      }

      const records = cachedData[date] as ConsultationRecord[];

      // 按技师分组统计
      const technicianStats: Record<string, any> = {};

      records.forEach(record => {
        // 只统计未作废的记录
        if (!record.isVoided) {
          const technician = record.technician;

          // 如果技师不存在，初始化统计数据
          if (!technicianStats[technician]) {
            technicianStats[technician] = {
              projects: {} as Record<string, number>,
              clockInCount: 0,
              totalCount: 0,
              extraTimeCount: 0, // 加钟次数
              extraTimeTotal: 0, // 加钟总半小时数
              overtimeCount: 0, // 加班次数
              overtimeTotal: 0 // 加班总半小时数
            };
          }

          // 统计项目数量
          if (!technicianStats[technician].projects[record.project]) {
            technicianStats[technician].projects[record.project] = 0;
          }
          technicianStats[technician].projects[record.project]++;

          // 统计点钟数
          if (record.isClockIn) {
            technicianStats[technician].clockInCount++;
          }

          // 统计加钟
          if (record.extraTime && record.extraTime > 0) {
            technicianStats[technician].extraTimeCount++;
            technicianStats[technician].extraTimeTotal += record.extraTime;
          }

          // 统计加班
          if (record.overtime && record.overtime > 0) {
            technicianStats[technician].overtimeCount++;
            technicianStats[technician].overtimeTotal += record.overtime;
          }

          // 统计总记录数
          technicianStats[technician].totalCount++;
        }
      });

      // 格式化统计结果
      let summaryText = `=== ${ date } 每日总结 ===\n\n`;

      // 遍历每个技师的统计数据
      Object.keys(technicianStats).forEach(technician => {
        const stats = technicianStats[technician];
        summaryText += `技师: ${ technician }\n`;
        summaryText += `总单数: ${ stats.totalCount }\n`;
        summaryText += `点钟数: ${ stats.clockInCount }\n`;

        // 加钟统计
        if (stats.extraTimeTotal > 0) {
          summaryText += `加钟: ${ stats.extraTimeCount }\n`;
        }

        // 加班统计
        if (stats.overtimeTotal > 0) {
          const overtimeHours = (stats.overtimeTotal * 0.5).toFixed(1);
          summaryText += `加班: ${ stats.overtimeCount } (${ overtimeHours }小时)\n`;
        }

        summaryText += `项目统计:\n`;

        // 遍历每个项目的统计数据
        Object.keys(stats.projects).forEach(project => {
          summaryText += `  ${ project }: ${ stats.projects[project] }\n`;
        });

        summaryText += `\n`;
      });

      // 添加总计信息
      const totalRecords = Object.values(technicianStats).reduce((sum: number, stats: any) => sum + stats.totalCount, 0);
      const totalClockIn = Object.values(technicianStats).reduce((sum: number, stats: any) => sum + stats.clockInCount, 0);
      const totalExtraTime = Object.values(technicianStats).reduce((sum: number, stats: any) => sum + stats.extraTimeTotal, 0);
      const totalOvertime = Object.values(technicianStats).reduce((sum: number, stats: any) => sum + stats.overtimeTotal, 0);

      summaryText += `=== 总计 ===\n`;
      summaryText += `总单数: ${ totalRecords }\n`;
      summaryText += `总点钟数: ${ totalClockIn }\n`;

      if (totalExtraTime > 0) {
        summaryText += `总加钟: ${ (totalExtraTime) }\n`;
      }
      if (totalOvertime > 0) {
        summaryText += `总加班: ${ (totalOvertime) }\n`;
      }

      // 复制到剪贴板
      wx.setClipboardData({
        data: summaryText,
        success: () => {
          wx.showToast({
            title: '统计已复制到剪贴板',
            icon: 'success'
          });
        },
        fail: (err) => {
          console.error('复制到剪贴板失败:', err);
          wx.showToast({
            title: '复制失败',
            icon: 'error'
          });
        }
      });

      // 显示统计结果
      wx.showModal({
        title: `${ date } 统计报告`,
        content: summaryText,
        showCancel: false,
        confirmText: '确定'
      });

    } catch (error) {
      console.error('生成总结失败:', error);
      wx.showToast({
        title: '生成失败',
        icon: 'error'
      });
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

  // 计算加班时长（根据排班和起始时间）
  calculateOvertime(technician: string, date: string, startTime: string): number {
    try {
      // 获取当日排班
      const schedule = db.findOne<ScheduleRecord>(Collections.SCHEDULE, {
        date: date
      });

      if (!schedule) {
        return 0; // 没有排班，不计算加班
      }

      // 获取技师信息以匹配 staffId
      const staff = db.findOne<StaffInfo>(Collections.STAFF, {
        name: technician,
        status: 'active'
      });

      if (!staff || schedule.staffId !== staff.id) {
        return 0; // 未找到技师或排班不匹配
      }

      const endTime = SHIFT_END_TIMES[schedule.shift];
      return calculateOvertimeUnits(startTime, endTime);
    } catch (error) {
      console.error('计算加班时长失败:', error);
      return 0;
    }
  },

  // 自动计算并更新所有记录的加班
  autoUpdateOvertimeForDate(date: string) {
    try {
      const consultationHistory = wx.getStorageSync('consultationHistory') || {};

      if (!consultationHistory[date]) {
        return;
      }

      const records = consultationHistory[date] as ConsultationRecord[];
      let hasChanges = false;

      records.forEach(record => {
        // 只计算未作废的记录
        if (!record.isVoided) {
          const calculatedOvertime = this.calculateOvertime(record.technician, date, record.startTime);

          // 如果计算的加班与当前值不同，更新
          if (record.overtime !== calculatedOvertime) {
            record.overtime = calculatedOvertime;
            record.updatedAt = new Date().toISOString();
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        wx.setStorageSync('consultationHistory', consultationHistory);
      }
    } catch (error) {
      console.error('自动更新加班失败:', error);
    }
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
  onModalConfirm() {
    const {type, inputValue, record, date} = this.data.numberInputModal;

    if (!record || inputValue < 0) {
      wx.showToast({
        title: '请输入有效数字',
        icon: 'none'
      });
      return;
    }

    // 直接替换为新值
    this.updateExtraTimeOrOvertime(record.id, date, type, inputValue);

    // 关闭弹窗
    this.setData({
      'numberInputModal.show': false
    });

    if (type === 'overtime') {
      // 加班操作，不生成报钟信息
      return;
    }

    // 仅当值>0时生成报钟信息并复制
    if (inputValue > 0) {
      const typeText = type === 'extraTime' ? '加钟' : '加班';

      // 计算时间
      const currentTime = new Date();
      const durationMinutes = inputValue * 30; // 每个半小时=30分钟
      const endTime = new Date(currentTime.getTime() + durationMinutes * 60 * 1000 + 5 * 60 * 1000);

      const startTimeStr = formatTime(currentTime, false);
      const endTimeStr = formatTime(endTime, false);

      // 新的报钟信息格式
      const genderObj = GENDERS.find(g => g.id === record.gender);
      const genderText = genderObj ? genderObj.name : '';
      const clockInfo = `顾客：${ record.surname }${ genderText }
项目：${ typeText }(${ inputValue })
技师：${ record.technician }
房间：${ record.room }
时间：${ startTimeStr } - ${ endTimeStr }`;

      wx.setClipboardData({
        data: clockInfo,
        success: () => {
          wx.showToast({
            title: `${ typeText }信息已复制`,
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
  updateExtraTimeOrOvertime(recordId: string, date: string, field: 'extraTime' | 'overtime', value: number) {
    try {
      const consultationHistory = wx.getStorageSync('consultationHistory') || {};

      if (consultationHistory[date]) {
        const recordIndex = consultationHistory[date].findIndex((item: ConsultationRecord) => item.id === recordId);

        if (recordIndex !== -1) {
          const record = consultationHistory[date][recordIndex];
          record[field] = value;
          record.updatedAt = new Date().toISOString();

          // 如果是加钟，重新计算结束时间
          if (field === 'extraTime') {
            const [hours, minutes] = record.startTime.split(':').map(Number);
            const startDate = new Date();
            startDate.setHours(hours, minutes, 0, 0);

            const endDate = calculateProjectEndTime(startDate, record.project, value);
            record.endTime = formatTime(endDate, false);
          }

          wx.setStorageSync('consultationHistory', consultationHistory);
          this.loadHistoryData();
        }
      }
    } catch (error) {
      console.error('更新失败:', error);
      wx.showToast({
        title: '更新失败',
        icon: 'error'
      });
    }
  },

  formatTime,
});
