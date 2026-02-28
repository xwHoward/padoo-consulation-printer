const WxCharts = require("../../utils/wx-charts.js");


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
  charts: {} as Record<string, typeof WxCharts>,
  
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

    this.updateRevenueTrendChart();
    this.updateProjectRankingChart();
    this.updateProjectComparisonChart();
    this.updatePlatformRankingChart();
    this.updateGenderDistributionChart();
    this.updateVehicleDistributionChart();
  },

  updateRevenueTrendChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.dailyRevenueTrend) return;

    const data = analyticsData.dailyRevenueTrend;
    const dates = data.map(item => {
      const d = new Date(item.date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const revenues = data.map(item => item.revenue);

    if (this.charts['revenueTrendChart']) {
      this.charts['revenueTrendChart'].updateData({
        categories: dates,
        series: [{ name: '营业额', data: revenues, color: '#FF6B00' }]
      });
    } else {
      this.charts['revenueTrendChart'] = this.drawLineChart('revenueTrendChart', dates, [{ name: '营业额', data: revenues, color: '#FF6B00' }]);
    }
  },

  updateProjectRankingChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.projectConsumption) return;

    const data = analyticsData.projectConsumption.slice(0, 10);
    const projects = data.map(item => item.project);
    const amounts = data.map(item => item.amount);

    if (this.charts['projectRankingChart']) {
      this.charts['projectRankingChart'].updateData({
        categories: projects,
        series: [{ name: '消费金额', data: amounts, color: '#FF6B00' }]
      });
    } else {
      this.charts['projectRankingChart'] = this.drawBarChart('projectRankingChart', projects, [{ name: '消费金额', data: amounts, color: '#FF6B00' }]);
    }
  },

  updateProjectComparisonChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.projectConsumption) return;

    const data = analyticsData.projectConsumption.slice(0, 8);
    const projects = data.map(item => item.project);
    const counts = data.map(item => item.count);

    if (this.charts['projectComparisonChart']) {
      this.charts['projectComparisonChart'].updateData({
        categories: projects,
        series: [{ name: '消费次数', data: counts, color: '#4CAF50' }]
      });
    } else {
      this.charts['projectComparisonChart'] = this.drawBarChart('projectComparisonChart', projects, [{ name: '消费次数', data: counts, color: '#4CAF50' }]);
    }
  },

  updatePlatformRankingChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.platformConsumption) return;

    const data = analyticsData.platformConsumption;
    const platforms = data.map(item => item.platform);
    const amounts = data.map(item => item.amount);

    if (this.charts['platformRankingChart']) {
      this.charts['platformRankingChart'].updateData({
        categories: platforms,
        series: [{ name: '消费金额', data: amounts, color: '#2196F3' }]
      });
    } else {
      this.charts['platformRankingChart'] = this.drawBarChart('platformRankingChart', platforms, [{ name: '消费金额', data: amounts, color: '#2196F3' }]);
    }
  },

  updateGenderDistributionChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.genderDistribution) return;

    const { male, female } = analyticsData.genderDistribution;
    const total = male + female;

    if (total === 0) return;

    if (this.charts['genderDistributionChart']) {
      this.charts['genderDistributionChart'].updateData({
        series: [{
          name: '分布',
          data: [male, female]
        }]
      });
    } else {
      this.charts['genderDistributionChart'] = this.drawPieChart('genderDistributionChart', [
        { name: '男', value: male, color: '#2196F3' },
        { name: '女', value: female, color: '#FF9800' }
      ]);
    }
  },

  updateVehicleDistributionChart() {
    const { analyticsData } = this.data;
    if (!analyticsData || !analyticsData.vehicleDistribution) return;

    const { withVehicle, withoutVehicle } = analyticsData.vehicleDistribution;
    const total = withVehicle + withoutVehicle;

    if (total === 0) return;

    if (this.charts['vehicleDistributionChart']) {
      this.charts['vehicleDistributionChart'].updateData({
        series: [{
          name: '分布',
          data: [withVehicle, withoutVehicle]
        }]
      });
    } else {
      this.charts['vehicleDistributionChart'] = this.drawPieChart('vehicleDistributionChart', [
        { name: '有车', value: withVehicle, color: '#4CAF50' },
        { name: '无车', value: withoutVehicle, color: '#9C27B0' }
      ]);
    }
  },

  drawLineChart(canvasId: string, categories: string[], series: { name: string; data: number[]; color?: string }[]) {
    const systemInfo = wx.getWindowInfo();
    const windowWidth = systemInfo.windowWidth;
    
    return new WxCharts({
      canvasId: canvasId,
      type: 'line',
      categories: categories,
      series: series.map(s => ({
        name: s.name,
        data: s.data,
        color: s.color || '#FF6B00'
      })),
      width: windowWidth - 32,
      height: 200,
      yAxis: {
        format: function(val: number) {
          return val.toFixed(0);
        },
        min: 0
      },
      xAxis: {
        disableGrid: false
      },
      extra: {
        lineStyle: 'curve'
      }
    });
  },

  drawBarChart(canvasId: string, categories: string[], series: { name: string; data: number[]; color?: string }[]) {
    const systemInfo = wx.getWindowInfo();
    const windowWidth = systemInfo.windowWidth;
    
    return new WxCharts({
      canvasId: canvasId,
      type: 'column',
      categories: categories,
      series: series.map(s => ({
        name: s.name,
        data: s.data,
        color: s.color || '#FF6B00'
      })),
      width: windowWidth - 32,
      height: 200,
      yAxis: {
        format: function(val: number) {
          return val.toFixed(0);
        },
        min: 0
      },
      xAxis: {
        disableGrid: true
      }
    });
  },

  drawPieChart(canvasId: string, data: { name: string; value: number; color: string }[]) {
    const systemInfo = wx.getWindowInfo();
    const windowWidth = systemInfo.windowWidth;
    
    return new WxCharts({
      canvasId: canvasId,
      type: 'pie',
      series: [{
        name: '分布',
        data: data.map(item => item.value)
      }],
      width: windowWidth - 32,
      height: 200,
      dataLabel: true,
      extra: {
        pie: {
          offsetAngle: 0
        }
      }
    });
  }
});
