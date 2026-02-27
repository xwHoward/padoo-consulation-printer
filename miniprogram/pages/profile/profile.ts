import { checkLogin } from '../../utils/auth';
import { cloudDb, Collections } from '../../utils/cloud-db';
import { earlierThan, getCurrentDate, laterOrEqualTo } from '../../utils/util';

interface Room {
	_id: string
	name: string
	status: string
}

interface RotationItem {
	_id: string
	name: string
	shift: 'morning' | 'evening'
	weight: number
}


interface ProfileData {
	staffId: string
	staffInfo: StaffInfo | null
	loading: boolean
	loadingText: string
	selectedDate: string
	isToday: boolean
	rotationList: RotationItem[]
	rotationTodayPosition: number
	rooms: Room[]
	performanceRecords: ConsultationRecord[]
	performanceStats: {
		totalCount: number
		totalAmount: number
		projectStats: Array<{ project: string; count: number; amount: number }>
	}
	paymentPlatformLabels: Record<string, string>
	paymentPlatforms: Record<string, string>
}

const app = getApp<IAppOption>();

Page({
	data: {
		staffId: '',
		staffInfo: null,
		loading: false,
		loadingText: '加载中...',
		selectedDate: '',
		isToday: true,
		rotationList: [],
		rotationTodayPosition: 0,
		rooms: [],
		performanceRecords: [],
		performanceStats: {
			totalCount: 0,
			totalAmount: 0,
			projectStats: []
		},
		paymentPlatforms: {
			cash: '现金',
			alipay: '支付宝',
			wxpay: '微信支付',
			gaode: '高德',
			free: '免单',
			membership: '划卡'
		},
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
	} as ProfileData,

	async onLoad() {
		const isLoggedIn = await checkLogin();
		if (!isLoggedIn) return;

		const user = getApp<IAppOption>().globalData.currentUser;
		if (!user || !user.staffId) {
			wx.showModal({
				title: '提示',
				content: '请先绑定员工账号',
				showCancel: false,
				success: () => {
					wx.redirectTo({
						url: '/pages/bind-staff/bind-staff'
					});
				}
			});
			return;
		}

		this.setData({
			staffId: user.staffId,
			selectedDate: getCurrentDate(),
			isToday: true
		});

		await this.loadStaffInfo();
		this.loadAllData();
	},

	async loadStaffInfo() {
		try {
			const staff = await cloudDb.findById<StaffInfo>(Collections.STAFF, this.data.staffId);
			this.setData({ staffInfo: staff });
		} catch (error) {
			console.error('加载员工信息失败:', error);
		}
	},

	async loadAllData() {
		await Promise.all([
			this.loadTimelineData(),
			this.loadPerformanceData(),
			this.loadRotationData()
		]);
	},

	async loadTimelineData() {
		this.setData({ loading: true, loadingText: '加载数据...' });

		try {
			const today = this.data.selectedDate || getCurrentDate();
			const todayStr = getCurrentDate();
			const isToday = today === todayStr;

			const allRooms = await app.getRooms();
			const filteredRooms = allRooms.filter((r: Room) => r.status === 'normal');

			const todayRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);

			const now = new Date();
			let currentTime = '';
			if (isToday) {
				const hours = now.getHours();
				const minutes = now.getMinutes();
				currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
			}

			const rooms = filteredRooms.map((room) => {
				let occupiedRecords = todayRecords
					.filter(r => !r.isVoided && r.room === room.name)
					.map(r => ({
						customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
						technician: r.technician || '',
						startTime: r.startTime,
						endTime: r.endTime || ''
					}));

				if (isToday && currentTime) {
					occupiedRecords = occupiedRecords.filter(r => {
						return laterOrEqualTo(currentTime, r.startTime) && earlierThan(currentTime, r.endTime);
					});
				}

				occupiedRecords.sort((a, b) => b.endTime.localeCompare(a.endTime));

				const isOccupied = occupiedRecords.length > 0;

				return {
					...room,
					isOccupied,
					occupiedRecords
				};
			});

			this.setData({ rooms });
		} catch (error) {
			console.error('加载数据失败:', error);
			wx.showToast({
				title: '加载失败',
				icon: 'none'
			});
		} finally {
			this.setData({ loading: false });
		}
	},

	async loadPerformanceData() {
		this.setData({ loading: true, loadingText: '加载业绩数据...' });

		try {
			const date = this.data.selectedDate || getCurrentDate();
			const staff = await app.getStaff(this.data.staffId);
			const staffName = staff?.name || '';

			const records = await cloudDb.find<ConsultationRecord>(Collections.CONSULTATION, {
				date: date,
				technician: staffName,
				isVoided: false
			});

			const projectStats: Record<string, { count: number; amount: number }> = {};
			let totalAmount = 0;

			records.forEach(record => {
				const project = record.project;
				if (!projectStats[project]) {
					projectStats[project] = { count: 0, amount: 0 };
				}
				projectStats[project].count += 1;
				projectStats[project].amount += record.settlement?.totalAmount || 0;
				totalAmount += record.settlement?.totalAmount || 0;
			});

			const projectStatsArray = Object.entries(projectStats).map(([project, stats]) => ({
				project,
				count: stats.count,
				amount: stats.amount
			}));

			this.setData({
				performanceRecords: records,
				performanceStats: {
					totalCount: records.length,
					totalAmount: totalAmount,
					projectStats: projectStatsArray
				}
			});
		} catch (error) {
			console.error('加载业绩数据失败:', error);
			wx.showToast({
				title: '加载失败',
				icon: 'none'
			});
		} finally {
			this.setData({ loading: false });
		}
	},

	async loadRotationData() {
		this.setData({ loading: true, loadingText: '加载轮牌...' });

		try {
			const rotationList = await app.getActiveStaffs();

			const todayPosition = rotationList.findIndex(s => s._id === this.data.staffId);

			this.setData({
				rotationList: rotationList,
				rotationTodayPosition: todayPosition + 1,
				loading: false
			});
		} catch (error) {
			console.error('加载轮牌数据失败:', error);
			this.setData({ loading: false });
			wx.showToast({
				title: '加载失败',
				icon: 'none'
			});
		}
	},

	onDatePickerChange(e: WechatMiniprogram.CustomEvent) {
		const date = e.detail.date;
		const isToday = date === getCurrentDate();
		this.setData({ selectedDate: date, isToday });
		this.loadAllData();
	},

	onBlockClick(e: WechatMiniprogram.CustomEvent) {
		console.log('Block clicked:', e.currentTarget.dataset);
	}
});
