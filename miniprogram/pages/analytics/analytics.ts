
type TimeRangeType = "today" | "yesterday" | "last7days" | "thisMonth" | "lastMonth" | "custom";

interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  dailyRevenueTrend: { date: string; revenue: number }[];
  projectConsumption: { project: string; amount: number; count: number }[];
  platformConsumption: { platform: string; amount: number; count: number }[];
  genderDistribution: { male: number; female: number };
  vehicleDistribution: { withVehicle: number; withoutVehicle: number };
  membershipCardAmount: number;
}

Page({
  data: {
    timeRangeType: "today" as TimeRangeType,
    customStartDate: "",
    customEndDate: "",
    loading: false,
    analyticsData: null as AnalyticsData | null,
    dateOptions: [
      { label: "今日", value: "today" },
      { label: "昨日", value: "yesterday" },
      { label: "近7天", value: "last7days" },
      { label: "本月", value: "thisMonth" },
      { label: "上月", value: "lastMonth" },
      { label: "自定义", value: "custom" }
    ],
    showStartDatePicker: false,
    showEndDatePicker: false
  },

  onLoad() {
    this.loadAnalyticsData();
  },

  onRefresh() {
    this.loadAnalyticsData();
  },

  async loadAnalyticsData() {
    const { timeRangeType, customStartDate, customEndDate } = this.data;

    this.setData({ loading: true });

    try {
      const dateRange = this.getDateRange(timeRangeType, customStartDate, customEndDate);

      const res = await wx.cloud.callFunction({
        name: "getAnalytics",
        data: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        }
      });

      if (res.result && typeof res.result === "object" && res.result.code === 0) {
        this.setData({
          analyticsData: res.result.data
        });
        setTimeout(() => {
          this.initCharts();
        }, 100);
      } else {
        wx.showToast({ title: "加载数据失败", icon: "none" });
      }
    } catch (error) {
      console.error("加载报表数据失败:", error);
      wx.showToast({ title: "加载数据失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  getDateRange(type: TimeRangeType, customStart: string, customEnd: string): { startDate: string; endDate: string } {
    const now = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    switch (type) {
      case "today":
        return {
          startDate: formatDate(now),
          endDate: formatDate(now)
        };

      case "yesterday": {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          startDate: formatDate(yesterday),
          endDate: formatDate(yesterday)
        };
      }

      case "last7days": {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        return {
          startDate: formatDate(sevenDaysAgo),
          endDate: formatDate(now)
        };
      }

      case "thisMonth": {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          startDate: formatDate(firstDay),
          endDate: formatDate(now)
        };
      }

      case "lastMonth": {
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        return {
          startDate: formatDate(firstDayLastMonth),
          endDate: formatDate(lastDayLastMonth)
        };
      }

      case "custom":
        return {
          startDate: customStart || formatDate(now),
          endDate: customEnd || formatDate(now)
        };

      default:
        return {
          startDate: formatDate(now),
          endDate: formatDate(now)
        };
    }
  },

  onTimeRangeChange(e: WechatMiniprogram.CustomEvent) {
    const value = e.currentTarget.dataset.value as TimeRangeType;
    this.setData({ timeRangeType: value });

    if (value === "custom") {
      this.setData({ showStartDatePicker: true });
    } else {
      this.loadAnalyticsData();
    }
  },

  onStartDateTap() {
    this.setData({ showStartDatePicker: true });
  },

  onEndDateTap() {
    this.setData({ showEndDatePicker: true });
  },

  onStartDateConfirm(e: WechatMiniprogram.CustomEvent) {
    const selectedDate = e.detail.value as string;
    this.setData({
      customStartDate: selectedDate,
      showStartDatePicker: false,
      showEndDatePicker: true
    });
  },

  onStartDatePickerCancel() {
    this.setData({ showStartDatePicker: false });
  },

  onEndDateConfirm(e: WechatMiniprogram.CustomEvent) {
    const selectedDate = e.detail.value as string;
    this.setData({
      customEndDate: selectedDate,
      showEndDatePicker: false
    });
    this.loadAnalyticsData();
  },

  onEndDatePickerCancel() {
    this.setData({ showEndDatePicker: false });
  },

  goToHome() {
    wx.navigateBack();
  },

  initCharts() {
    const { analyticsData } = this.data;
    if (!analyticsData) return;

    this.drawRevenueTrendChart();
    this.drawProjectRankingChart();
    this.drawProjectComparisonChart();
    this.drawPlatformRankingChart();
    this.drawGenderDistributionChart();
    this.drawVehicleDistributionChart();
  },

  drawRevenueTrendChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.dailyRevenueTrend) return;

    const data = analyticsData.dailyRevenueTrend;
    const dates = data.map(item => {
      const d = new Date(item.date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const revenues = data.map(item => item.revenue);

    this.drawLineChart('revenueTrendChart', dates, [{ name: '营业额', data: revenues, color: '#FF6B00' }]);
  },

  drawProjectRankingChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.projectConsumption) return;

    const data = analyticsData.projectConsumption.slice(0, 10);
    const projects = data.map(item => item.project);
    const amounts = data.map(item => item.amount);
    console.log(projects, amounts);
    this.drawBarChart('projectRankingChart', projects, [{ name: '消费金额', data: amounts, color: '#FF6B00' }]);
  },

  drawProjectComparisonChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.projectConsumption) return;

    const data = analyticsData.projectConsumption.slice(0, 8);
    const projects = data.map(item => item.project);
    const counts = data.map(item => item.count);

    this.drawBarChart('projectComparisonChart', projects, [{ name: '消费次数', data: counts, color: '#4CAF50' }]);
  },

  drawPlatformRankingChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.platformConsumption) return;

    const data = analyticsData.platformConsumption;
    const platforms = data.map(item => item.platform);
    const amounts = data.map(item => item.amount);

    this.drawBarChart('platformRankingChart', platforms, [{ name: '消费金额', data: amounts, color: '#2196F3' }]);
  },

  drawGenderDistributionChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.genderDistribution) return;

    const { male, female } = analyticsData.genderDistribution;
    const total = male + female;

    if (total === 0) return;

    this.drawPieChart('genderDistributionChart', [
      { name: '男', value: male, color: '#2196F3' },
      { name: '女', value: female, color: '#FF9800' }
    ]);
  },

  drawVehicleDistributionChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.vehicleDistribution) return;

    const { withVehicle, withoutVehicle } = analyticsData.vehicleDistribution;
    const total = withVehicle + withoutVehicle;

    if (total === 0) return;

    this.drawPieChart('vehicleDistributionChart', [
      { name: '有车', value: withVehicle, color: '#4CAF50' },
      { name: '无车', value: withoutVehicle, color: '#9C27B0' }
    ]);
  },

  drawLineChart(canvasId: string, categories: string[], series: { name: string; data: number[]; color?: string }[]) {
    const query = wx.createSelectorQuery().in(this);
    query.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        const systemInfo = wx.getWindowInfo();
        const pixelRatio = systemInfo.pixelRatio;
        const dpr = systemInfo.pixelRatio || 1;

        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        const width = res[0].width;
        const height = res[0].height;
        const padding = { top: 30, right: 20, bottom: 40, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        ctx.clearRect(0, 0, width, height);

        const allValues = series.flatMap(s => s.data);
        const maxValue = Math.max(...allValues, 0);
        const yAxisMax = maxValue > 0 ? Math.ceil(maxValue * 1.1) : 100;

        ctx.fillStyle = '#999999';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
          const y = padding.top + chartHeight - (i / 5) * chartHeight;
          const value = Math.round((i / 5) * yAxisMax);
          ctx.fillText(String(value), padding.left - 5, y + 3);

          ctx.strokeStyle = '#E5E5E5';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(padding.left + chartWidth, y);
          ctx.stroke();
        }

        ctx.textAlign = 'center';
        const xStep = categories.length > 1 ? chartWidth / (categories.length - 1) : chartWidth / 2;
        
        const skipStep = categories.length > 10 ? Math.ceil(categories.length / 10) : 1;
        
        categories.forEach((cat, index) => {
          if (index % skipStep !== 0) return;
          
          let x: number;
          if (categories.length === 1) {
            x = padding.left + chartWidth / 2;
          } else {
            x = padding.left + index * xStep;
          }
          ctx.fillText(cat, x, height - padding.bottom + 20);
        });

        series.forEach(serie => {
          const color = serie.color || '#FF6B00';
          const data = serie.data;

          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();

          data.forEach((value, index) => {
            let x: number;
            if (categories.length === 1) {
              x = padding.left + chartWidth / 2;
            } else {
              x = padding.left + index * xStep;
            }
            const y = padding.top + chartHeight - (value / yAxisMax) * chartHeight;

            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });

          ctx.stroke();

          data.forEach((value, index) => {
            let x: number;
            if (categories.length === 1) {
              x = padding.left + chartWidth / 2;
            } else {
              x = padding.left + index * xStep;
            }
            const y = padding.top + chartHeight - (value / yAxisMax) * chartHeight;

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
          });
        });
      });
  },

  drawBarChart(canvasId: string, categories: string[], series: { name: string; data: number[]; color?: string }[]) {
    const query = wx.createSelectorQuery().in(this);
    query.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        const systemInfo = wx.getWindowInfo();
        const dpr = systemInfo.pixelRatio || 1;

        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        const width = res[0].width;
        const height = res[0].height;
        const padding = { top: 30, right: 20, bottom: 50, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        ctx.clearRect(0, 0, width, height);

        const allValues = series.flatMap(s => s.data);
        const maxValue = Math.max(...allValues, 0);
        const yAxisMax = maxValue > 0 ? Math.ceil(maxValue * 1.1) : 100;

        ctx.fillStyle = '#999999';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
          const y = padding.top + chartHeight - (i / 5) * chartHeight;
          const value = Math.round((i / 5) * yAxisMax);
          ctx.fillText(String(value), padding.left - 5, y + 3);

          ctx.strokeStyle = '#E5E5E5';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(padding.left + chartWidth, y);
          ctx.stroke();
        }

        const barWidth = Math.min(30, chartWidth / categories.length - 10);
        const xStep = chartWidth / categories.length;
        const skipStep = categories.length > 8 ? Math.ceil(categories.length / 8) : 1;

        series.forEach(serie => {
          const color = serie.color || '#FF6B00';
          const data = serie.data;

          data.forEach((value, index) => {
            const x = padding.left + index * xStep + (xStep - barWidth) / 2;
            const barHeight = (value / yAxisMax) * chartHeight;
            const y = padding.top + chartHeight - barHeight;

            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth, barHeight);
          });
        });

        ctx.fillStyle = '#666666';
        ctx.font = '10px sans-serif';
        categories.forEach((cat, index) => {
          if (index % skipStep !== 0) return;
          
          const centerX = padding.left + index * xStep + xStep / 2;
          const text = cat.length > 6 ? cat.substring(0, 6) + '..' : cat;
          
          ctx.save();
          ctx.translate(centerX, height - padding.bottom + 20);
          ctx.rotate(-Math.PI / 4);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, 5, 0);
          ctx.restore();
        });
      });
  },

  drawPieChart(canvasId: string, data: { name: string; value: number; color: string }[]) {
    const query = wx.createSelectorQuery().in(this);
    query.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        const systemInfo = wx.getWindowInfo();
        const dpr = systemInfo.pixelRatio || 1;

        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        const width = res[0].width;
        const height = res[0].height;
        const centerX = width / 2;
        const centerY = height / 2 - 10;
        const radius = Math.min(width, height) / 3;

        ctx.clearRect(0, 0, width, height);

        const total = data.reduce((sum, item) => sum + item.value, 0);

        if (total === 0) {
          ctx.fillStyle = '#CCCCCC';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('暂无数据', centerX, centerY);
          return;
        }

        let startAngle = -Math.PI / 2;

        data.forEach(item => {
          const sliceAngle = (item.value / total) * 2 * Math.PI;
          const endAngle = startAngle + sliceAngle;

          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, radius, startAngle, endAngle);
          ctx.closePath();

          ctx.fillStyle = item.color;
          ctx.fill();

          const labelAngle = startAngle + sliceAngle / 2;
          const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
          const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

          if (item.value > 0) {
            const percentage = Math.round((item.value / total) * 100);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = percentage >= 10 ? 'bold 11px sans-serif' : '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${percentage}%`, labelX, labelY);
          }

          startAngle = endAngle;
        });

        const legendY = height - 25;
        let legendX = 20;
        const legendItemWidth = 70;

        data.forEach(item => {
          ctx.fillStyle = item.color;
          ctx.fillRect(legendX, legendY, 12, 12);

          ctx.fillStyle = '#333333';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${item.name} (${item.value})`, legendX + 16, legendY + 6);

          legendX += legendItemWidth;
        });
      });
  }
});
