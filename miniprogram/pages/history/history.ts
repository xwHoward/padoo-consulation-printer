import {formatTime, parseProjectDuration} from "../../utils/util";

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
    platforms: {meituan: '美团', dianping: '点评', douyin: '抖音'},
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

  onLoad() {
    // 页面加载时获取历史数据
    this.loadHistoryData();
  },

  onShow() {
    // 页面显示时重新加载数据，确保数据最新
    this.loadHistoryData();
  },

  // 加载历史数据
  loadHistoryData() {
    try {
      // 从本地缓存获取历史数据
      const consultationHistory = wx.getStorageSync('consultationHistory') || {};

      // 将数据转换为按天分组的数组
      const historyData: DailyGroup[] = [];

      // 遍历日期键
      Object.keys(consultationHistory).forEach(date => {
        const records = consultationHistory[date] as ConsultationRecord[];
        if (records && records.length > 0) {
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

              const projectDuration = parseProjectDuration(record.project);
              const extraTimeMinutes = (record.extraTime || 0) * 30;
              const totalDuration = projectDuration + extraTimeMinutes + 10;
              const endDate = new Date(createdDate.getTime() + totalDuration * 60 * 1000);
              endTimeStr = formatTime(endDate, false);
            }

            // 返回带计数的记录，已作废的默认折叠
            return {
              ...record,
              dailyCount: record.isVoided ? 0 : technicianCounts[record.technician],
              startTime: startTimeStr,
              endTime: endTimeStr,
              collapsed: record.isVoided // 已作废的默认折叠
            };
          });

          // 按时间倒序排列当天的记录（用于显示）
          const sortedForDisplay = recordsWithCount.sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          // 添加到历史数据
          historyData.push({
            date,
            records: sortedForDisplay as DisplayRecord[]
          });
        }
      });

      // 按日期倒序排列
      historyData.sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      // 更新页面数据
      this.setData({
        historyData
      });
    } catch (error) {
      console.error('加载历史数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  // 显示咨询单详情
  showConsultationDetail(e: WechatMiniprogram.TouchEvent) {
    const {record} = e.currentTarget.dataset;

    // 格式化咨询单详情文本
    let detailText = `客户姓名: ${ record.surname } ${ record.gender === 'male' ? '先生' : record.gender === 'female' ? '女士' : '' }\n`;
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

    detailText += `创建时间: ${ this.formatDateTime(record.createdAt) }\n`;
    detailText += `更新时间: ${ this.formatDateTime(record.updatedAt) }\n`;
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
    const strengthMap = {
      'standard': '标准',
      'soft': '轻柔',
      'gravity': '重力'
    };
    return strengthMap[strength as keyof typeof strengthMap] || '';
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

  // 格式化日期时间
  formatDateTime(dateTime: string): string {
    const date = new Date(dateTime);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${ month }-${ day } ${ hours }:${ minutes }`;
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

  // 加班操作 - 显示弹窗
  onOvertime(e: WechatMiniprogram.TouchEvent) {
    const {record, date} = e.currentTarget.dataset;
    const currentValue = record.overtime || 0;

    this.setData({
      numberInputModal: {
        show: true,
        title: '加班',
        type: 'overtime',
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
      const clockInfo = `顾客：${ record.surname }${ record.gender === 'male' ? '先生' : '女士' }
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
            const projectDuration = parseProjectDuration(record.project);
            const extraTimeMinutes = value * 30; // 加钟时长（单位：分钟）
            const totalDuration = projectDuration + extraTimeMinutes + 10; // 项目时长 + 加钟时长 + 10分钟

            // 从 startTime 计算新的 endTime
            const [hours, minutes] = record.startTime.split(':').map(Number);
            const startDate = new Date();
            startDate.setHours(hours, minutes, 0, 0);
            const endDate = new Date(startDate.getTime() + totalDuration * 60 * 1000);
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
