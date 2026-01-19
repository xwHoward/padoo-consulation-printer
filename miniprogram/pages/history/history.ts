// history.ts
// 定义咨询单数据结构
interface ConsultationInfo {
  surname: string;
  gender: "male" | "female" | "";
  project: string;
  technician: string;
  room: string;
  massageStrength: "standard" | "soft" | "gravity" | "";
  essentialOil: string;
  selectedParts: Record<string, boolean>;
}

// 定义带ID的咨询单数据结构（用于历史记录）
interface ConsultationRecord extends ConsultationInfo {
  id: string; // 唯一标识符
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  isVoided: boolean; // 是否作废
}

// 定义每日咨询单集合
interface DailyGroup {
  date: string;
  records: ConsultationRecord[];
}

Page({
  data: {
    historyData: [] as DailyGroup[], // 按天分组的历史记录
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
            
            // 返回带计数的记录
            return {
              ...record,
              dailyCount: record.isVoided ? 0 : technicianCounts[record.technician]
            };
          });
          
          // 按时间倒序排列当天的记录（用于显示）
          const sortedForDisplay = recordsWithCount.sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
          
          // 添加到历史数据
          historyData.push({
            date,
            records: sortedForDisplay as ConsultationRecord[]
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
    const { record } = e.currentTarget.dataset;
    
    // 格式化咨询单详情文本
    let detailText = `客户姓名: ${record.surname} ${record.gender === 'male' ? '先生' : record.gender === 'female' ? '女士' : ''}\n`;
    detailText += `项目: ${record.project}\n`;
    detailText += `技师: ${record.technician}${record.dailyCount && !record.isVoided ? `(${record.dailyCount})` : ''}\n`;
    detailText += `房间: ${record.room}\n`;
    detailText += `按摩力度: ${this.getMassageStrengthText(record.massageStrength)}\n`;
    detailText += `精油选择: ${record.essentialOil || '无'}\n`;
    
    // 处理加强部位
    const selectedParts = Object.keys(record.selectedParts).filter(part => record.selectedParts[part]);
    detailText += `加强部位: ${selectedParts.length > 0 ? selectedParts.join(', ') : '无'}\n\n`;
    
    detailText += `创建时间: ${this.formatDateTime(record.createdAt)}\n`;
    detailText += `更新时间: ${this.formatDateTime(record.updatedAt)}\n`;
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
      url: `/pages/index/index?editId=${record.id}`
    });
  },

  // 作废咨询单
  voidConsultation(e: WechatMiniprogram.TouchEvent) {
    const { record, date } = e.currentTarget.dataset;
    
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
    
    return `${month}-${day} ${hours}:${minutes}`;
  },

  // 返回主页面
  goBack() {
    wx.navigateBack();
  }
});
