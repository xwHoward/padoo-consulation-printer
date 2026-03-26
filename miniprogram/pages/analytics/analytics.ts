const WxCharts = require("../../utils/wx-charts.js");

type TimeRangeType = "day" | "last7days" | "last30days" | "thisMonth";

interface TimeRange {
	startDate: string;
	endDate: string;
	currentDate?: string;
}

interface AnalyticsData {
	timeRangeType: TimeRangeType;
	currentDate: string;
	keyMetrics: {
		totalOrders: number;
		totalReservations: number;
		maleAvgOrders: number;
		femaleAvgOrders: number;
		walkInCustomers: number;
	};
	customerTrend: {
		labels: string[];
		male: number[];
		female: number[];
		total: number[];
	};
	genderTrend: {
		labels: string[];
		male: number[];
		female: number[];
	};
	projectRanking: {
		project: string;
		count: number;
		percentage: number;
	}[];
	technicianAvgTrend?: {
		labels: string[];
		male: number[];
		female: number[];
	};
}

Page({
	charts: {} as Record<string, typeof WxCharts>,

	data: {
		timeRangeType: "day" as TimeRangeType,
		currentDate: "",
		loading: false,
		analyticsData: null as AnalyticsData | null,
		dateOptions: [
			{ label: "日", value: "day" },
			{ label: "近7天", value: "last7days" },
			{ label: "近30天", value: "last30days" },
			{ label: "本月", value: "thisMonth" }
		],
	},

	onLoad() {
		const today = this.formatDate(new Date());
		this.setData({ currentDate: today });
		this.loadAnalyticsData();
	},

	onRefresh() {
		this.loadAnalyticsData();
	},

	onTimeRangeChange(e: WechatMiniprogram.CustomEvent) {
		const value = e.currentTarget.dataset.value as TimeRangeType;
		this.setData({ timeRangeType: value });
		this.loadAnalyticsData();
	},

	onDateChange(e: WechatMiniprogram.CustomEvent) {
		const date = e.detail.date;
		this.setData({ currentDate: date });
		this.loadAnalyticsData();
	},

	async loadAnalyticsData() {
		const { timeRangeType, currentDate } = this.data;
		const dateRange = this.getDateRange(timeRangeType, currentDate);

		this.setData({ loading: true });

		try {
			const res = await wx.cloud.callFunction({
				name: "getAnalytics",
				data: {
					action: "getAnalyticsData",
					startDate: dateRange.startDate,
					endDate: dateRange.endDate,
					timeRangeType: timeRangeType,
					currentDate: dateRange.currentDate
				}
			});

			if (res.result && typeof res.result === "object" && res.result.code === 0) {
				this.setData({
					analyticsData: {
						...res.result.data,
						timeRangeType,
						currentDate
					}
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

	getDateRange(type: TimeRangeType, currentDate: string): TimeRange {
		const now = new Date();
		const format = (date: Date) => {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			return `${year}-${month}-${day}`;
		};

		switch (type) {
			case "day":
				return {
					startDate: currentDate,
					endDate: currentDate,
					currentDate: currentDate
				};

			case "last7days": {
				const sevenDaysAgo = new Date(now);
				sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
				return {
					startDate: format(sevenDaysAgo),
					endDate: format(now)
				};
			}

			case "last30days": {
				const thirtyDaysAgo = new Date(now);
				thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
				return {
					startDate: format(thirtyDaysAgo),
					endDate: format(now)
				};
			}

			case "thisMonth": {
				const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
				return {
					startDate: format(firstDay),
					endDate: format(now)
				};
			}

			default:
				return {
					startDate: format(now),
					endDate: format(now)
				};
		}
	},

	formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	},

	goToHome() {
		wx.navigateBack();
	},

	initCharts() {
		const { analyticsData } = this.data;
		if (!analyticsData) return;

		this.updateCustomerTrendChart();
		this.updateGenderTrendChart();
		this.updateProjectRankingChart();
		
		if (analyticsData.technicianAvgTrend) {
			this.updateTechnicianAvgTrendChart();
		}
	},

	updateCustomerTrendChart() {
		const { analyticsData } = this.data;
		if (!analyticsData || !analyticsData.customerTrend) return;

		const data = analyticsData.customerTrend;
		const labels = data.labels;

		if (this.charts['customerTrendChart']) {
			this.charts['customerTrendChart'].updateData({
				categories: labels,
				series: [
					{ name: '客流总数', data: data.total, color: '#FF6B00' }
				]
			});
		} else {
			this.charts['customerTrendChart'] = this.drawLineChart('customerTrendChart', labels, [
				{ name: '客流总数', data: data.total, color: '#FF6B00' }
			]);
		}
	},

	updateGenderTrendChart() {
		const { analyticsData } = this.data;
		if (!analyticsData || !analyticsData.genderTrend) return;

		const data = analyticsData.genderTrend;
		const labels = data.labels;

		if (this.charts['genderTrendChart']) {
			this.charts['genderTrendChart'].updateData({
				categories: labels,
				series: [
					{ name: '男', data: data.male, color: '#2196F3' },
					{ name: '女', data: data.female, color: '#FF9800' }
				]
			});
		} else {
			this.charts['genderTrendChart'] = this.drawLineChart('genderTrendChart', labels, [
				{ name: '男', data: data.male, color: '#2196F3' },
				{ name: '女', data: data.female, color: '#FF9800' }
			]);
		}
	},

	updateProjectRankingChart() {
		const { analyticsData } = this.data;
		if (!analyticsData || !analyticsData.projectRanking) return;

		const data = analyticsData.projectRanking.slice(0, 10);
		const projects = data.map(item => `${item.project} (${item.percentage}%)`);
		const counts = data.map(item => item.count);

		if (this.charts['projectRankingChart']) {
			this.charts['projectRankingChart'].updateData({
				categories: projects,
				series: [{ name: '消费次数', data: counts, color: '#FF6B00' }]
			});
		} else {
			this.charts['projectRankingChart'] = this.drawBarChart('projectRankingChart', projects, [
				{ name: '消费次数', data: counts, color: '#FF6B00' }
			]);
		}
	},

	updateTechnicianAvgTrendChart() {
		const { analyticsData } = this.data;
		if (!analyticsData || !analyticsData.technicianAvgTrend) return;

		const data = analyticsData.technicianAvgTrend;
		const labels = data.labels;

		if (this.charts['technicianAvgTrendChart']) {
			this.charts['technicianAvgTrendChart'].updateData({
				categories: labels,
				series: [
					{ name: '男技师', data: data.male, color: '#2196F3' },
					{ name: '女技师', data: data.female, color: '#FF9800' }
				]
			});
		} else {
			this.charts['technicianAvgTrendChart'] = this.drawLineChart('technicianAvgTrendChart', labels, [
				{ name: '男技师', data: data.male, color: '#2196F3' },
				{ name: '女技师', data: data.female, color: '#FF9800' }
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
	}
});
