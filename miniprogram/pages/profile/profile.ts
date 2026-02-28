import { checkLogin } from '../../utils/auth';
import { cloudDb, Collections } from '../../utils/cloud-db';
import { earlierThan, getCurrentDate, laterOrEqualTo } from '../../utils/util';

interface Room {
	_id: string
	name: string
	status: string
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
		totalCommission: number
		clockInCount: number
		overtimeCount: number
		projectStats: Array<{ project: string; count: number; amount: number }>
	}
	paymentPlatformLabels: Record<string, string>
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
			totalCommission: 0,
			clockInCount: 0,
			overtimeCount: 0,
			projectStats: []
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

	async onShow() {
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

		this.loadStaffInfo();
		this.loadRoomData();
		this.loadRotationData();
		this.loadPerformanceData();
	},

	async loadStaffInfo() {
		try {
			const staff = await cloudDb.findById<StaffInfo>(Collections.STAFF, this.data.staffId);
			this.setData({ staffInfo: staff });
		} catch (error) {
		}
	},

	async loadRoomData() {
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

			const allProjects = await app.getProjects();
			const projectCommissionMap: Record<string, number> = {};
			allProjects.forEach(project => {
				projectCommissionMap[project.name] = project.commission || 0;
			});

			const projectStats: Record<string, { count: number; amount: number }> = {};
			let totalAmount = 0;
			let totalCommission = 0;
			let clockInCount = 0;
			let overtimeCount = 0;

			records.forEach(record => {
				const project = record.project;
				if (!projectStats[project]) {
					projectStats[project] = { count: 0, amount: 0 };
				}
				projectStats[project].count += 1;

				let commission = projectCommissionMap[project] || 0;
				if (record.isClockIn) {
					clockInCount += 1;
					commission += 5;
				}

				if (record.overtime) {
					overtimeCount += record.overtime;
					const overtimeCommission = record.overtime * 7.5;
					commission += overtimeCommission;
				}

				projectStats[project].amount += commission;
				totalCommission += commission;
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
					totalCommission: totalCommission,
					clockInCount: clockInCount,
					overtimeCount: overtimeCount,
					projectStats: projectStatsArray
				}
			});
		} catch (error) {
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
			const rotationData = await app.getRotationQueue(this.data.selectedDate);

			if (!rotationData || !rotationData.staffList || rotationData.staffList.length === 0) {
				this.setData({
					rotationList: [],
					rotationTodayPosition: 0,
					loading: false
				});
				return;
			}

			const rotationList: RotationItem[] = rotationData.staffList.map((staffData) => ({
				_id: staffData.staffId,
				name: staffData.name,
				shift: staffData.shift as 'morning' | 'evening',
			}));

			const todayPosition = rotationList.findIndex(s => s._id === this.data.staffId);

			this.setData({
				rotationList: rotationList,
				rotationTodayPosition: todayPosition + 1,
				loading: false
			});
		} catch (error) {
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
		this.loadPerformanceData();
	},
});
