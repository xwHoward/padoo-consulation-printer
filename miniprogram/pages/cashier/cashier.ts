// cashier.ts
import { checkLogin } from '../../utils/auth';
import { cloudDb, Collections } from '../../utils/cloud-db';
import { DEFAULT_SHIFT, SHIFT_END_TIME, SHIFT_START_TIME, ShiftType } from '../../utils/constants';
import { hasButtonPermission, requirePagePermission } from '../../utils/permission';
import { earlierThan, formatTime, getCurrentDate, getMinutesDiff, getNextDate, getPreviousDate, laterOrEqualTo, parseProjectDuration } from '../../utils/util';

interface PaymentMethodItem {
	key: string;
	label: string;
	selected: boolean;
	amount: string;
	couponCode?: string;
}

const app = getApp<IAppOption>();

Page({
	data: {
		isLandscape: false,
		selectedDate: '',
		rooms: [] as Room[],
		rotationList: [] as RotationItem[],
		timelineRefreshTrigger: 0,
		// 日期选择器状态
		dateSelector: {
			selectedDate: '',
			previousDate: '',
			nextDate: '',
			isToday: false
		},
		// 权限状态
		canCreateReservation: false,
		canPushRotation: false,
		// 预约弹窗相关
		showReserveModal: false,
		projects: [] as Project[],
		activeStaffList: [] as StaffInfo[],
		staffAvailability: [] as StaffAvailability[],
		availableMaleCount: 0,
		availableFemaleCount: 0,
		reserveForm: {
			_id: '',
			date: '',
			customerName: '',
			gender: 'male' as 'male' | 'female',
			project: '',
			phone: '',
			requirementType: 'specific' as 'specific' | 'gender',
			selectedTechnicians: [] as Array<{ _id: string; name: string; phone: string; isClockIn: boolean }>,
			genderRequirement: { male: 0, female: 0 },
			startTime: '',
			// 兼容编辑模式
			technicianId: '',
			technicianName: '',
		},
		originalReservation: null as ReservationRecord | null,
		// 结算弹窗相关
		showSettlementModal: false,
		settlementRecordId: '',
		settlementCouponCode: '',
		projectOriginalPrice: 0,
		totalSettlementAmount: 0,
		paymentMethods: [
			{ key: 'meituan', label: '美团', selected: false, amount: '', couponCode: '' },
			{ key: 'dianping', label: '大众点评', selected: false, amount: '', couponCode: '' },
			{ key: 'douyin', label: '抖音', selected: false, amount: '', couponCode: '' },
			{ key: 'wechat', label: '微信', selected: false, amount: '', couponCode: '' },
			{ key: 'alipay', label: '支付宝', selected: false, amount: '', couponCode: '' },
			{ key: 'cash', label: '现金', selected: false, amount: '', couponCode: '' },
			{ key: 'gaode', label: '高德', selected: false, amount: '', couponCode: '' },
			{ key: 'free', label: '免单', selected: false, amount: '', couponCode: '' },
			{ key: 'membership', label: '划卡', selected: false, amount: '', couponCode: '' },
		],
		// loading状态
		loading: false,
		loadingText: '加载中...',
		// 顾客匹配
		matchedCustomer: null as CustomerRecord|null,
		matchedCustomerApplied: false,
		// 预约推送确认弹窗
		pushModal: {
			show: false,
			loading: false,
			type: 'create' as 'create' | 'cancel',
			reservationData: null as {
				customerName: string;
				gender: 'male' | 'female';
				date: string;
				startTime: string;
				endTime: string;
				project: string;
				technicians: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }>;
			} | null
		},
		// 轮牌推送确认弹窗
		rotationPushModal: {
			show: false,
			loading: false
		}
	},

	async onLoad() {
		const isLoggedIn = await checkLogin();
		if (!isLoggedIn) return;

		if (!requirePagePermission('cashier')) return;

		const today = getCurrentDate();
		this.setData({ selectedDate: today });
		this.loadProjects();
	},
	async onShow() {
		const isLoggedIn = await checkLogin();
		if (!isLoggedIn) return;

		if (!requirePagePermission('cashier')) return;

		// 检查按钮权限
		this.setData({
			canCreateReservation: hasButtonPermission('createReservation'),
			canPushRotation: hasButtonPermission('pushRotation')
		});

		this.loadInitialData();
	},

	// 切换横屏/竖屏
	toggleLandscape() {
		const isLandscape = !this.data.isLandscape;
		this.setData({ isLandscape });

		// 修改页面方向
		try {
			if (isLandscape) {
				wx.setPageOrientation({
					pageOrientation: 'landscape'
				});
			} else {
				wx.setPageOrientation({
					pageOrientation: 'portrait'
				});
			}
		} catch (error) {
			wx.showToast({
				title: '设置失败',
				icon: 'none'
			});
		}
	},

	async loadProjects() {
		try {
			const app = getApp<IAppOption>();
			const allProjects = await app.getProjects();
			this.setData({ projects: allProjects });
		} catch (error) {
			this.setData({ projects: [] });
		}
	},

	async onDateChange(e: WechatMiniprogram.CustomEvent) {
		const selectedDate = e.detail.value;
		this.setData({ selectedDate });
		await this.loadTimelineData();
	},

	onDatePickerChange(e: WechatMiniprogram.CustomEvent) {
		const selectedDate = e.detail.date;
		this.setData({ selectedDate });
		this.loadTimelineData();
	},

	// 加载初始数据（房间状态、员工轮牌状态、排钟进度）
	async loadInitialData() {
		this.setData({ loading: true, loadingText: '加载数据...' });
		try {
			const app = getApp<IAppOption>();
			const today = this.data.selectedDate || getCurrentDate();
			const allRooms = await app.getRooms();
			const filteredRooms = allRooms.filter((r: Room) => r.status === 'normal');
			const todayRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
			const activeRecords = todayRecords.filter(r => !r.isVoided);
			const now = new Date();
			const todayStr = getCurrentDate();
			const isToday = today === todayStr;
			let currentTime = '';
			if (isToday) {
				const hours = now.getHours();
				const minutes = now.getMinutes();
				currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
			}

			const rooms = filteredRooms.map((room) => {
				let occupiedRecords = activeRecords
					.filter(r => r.room === room.name)
					.map(r => ({
						customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
						technician: r.technician || '',
						startTime: r.startTime,
						endTime: r.endTime || ''
					}));

				// 只显示当前时间正在占用的记录（对于今天）
				if (isToday && currentTime) {
					occupiedRecords = occupiedRecords.filter(r => {
						return laterOrEqualTo(currentTime, r.startTime) && earlierThan(currentTime, r.endTime);
					});
				}

				// 按结束时间降序排列
				occupiedRecords.sort((a, b) => b.endTime.localeCompare(a.endTime));

				const isOccupied = occupiedRecords.length > 0;

				return {
					...room,
					isOccupied,
					occupiedRecords
				};
			});

			// 2. 获取员工轮牌与排钟表数据
			const allSchedules = await cloudDb.getAll<ScheduleRecord>(Collections.SCHEDULE);
			const allStaff = await app.getStaffs();
			const activeStaffList = allStaff.filter(s => s.status === 'active');
			const scheduledStaff = allSchedules.map(s => s.staffId);
			const activeStaff = activeStaffList.filter(s => scheduledStaff.includes(s._id));


			this.setData({
				activeStaffList: activeStaff,
			});

			// 调用云函数获取技师可用列表
			const projectDuration = 60;
			const currentTimeStr = isToday ? currentTime : '12:00';

			const technicianRes = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date: today,
					currentTime: currentTimeStr,
					projectDuration: projectDuration,
					currentReservationIds: []
				}
			});

			let availableTechnicians = [] as StaffAvailability[];
			if (!technicianRes.result || typeof technicianRes.result !== 'object') {
				this.setData({ staffAvailability: availableTechnicians });
				return;
			}
			if (technicianRes.result && technicianRes.result.code === 0) {
				availableTechnicians = technicianRes.result.data as StaffAvailability[];
			}

			this.setData({ staffAvailability: availableTechnicians });

			// 使用辅助方法准备轮牌数据
			const rotationList = await this.prepareRotationList(today);

			// 计算日期导航状态
			const previousDate = getPreviousDate(today);
			const nextDate = getNextDate(today) || '';

			this.setData({
				rooms,
				rotationList,
				dateSelector: {
					selectedDate: today,
					previousDate,
					nextDate,
					isToday
				}
			});
		} catch (error) {
			wx.showToast({
				title: '加载数据失败',
				icon: 'none'
			});
		} finally {
			this.setData({ loading: false });
		}
	},

	// 只刷新排钟进度（日期切换时使用）
	async loadTimelineData() {
		this.setData({ loading: true, loadingText: '刷新排钟...' });
		try {
			const today = this.data.selectedDate || getCurrentDate();
			const rotationList = await this.prepareRotationList(today);

			this.setData({
				rotationList,
				timelineRefreshTrigger: this.data.timelineRefreshTrigger + 1
			});
		} catch (error) {
			wx.showToast({
				title: '刷新失败',
				icon: 'none'
			});
		} finally {
			this.setData({ loading: false });
		}
	},

	async prepareRotationList(today: string) {
		const rotationData = await app.getRotationQueue(today);

		if (!rotationData || !rotationData.staffList || rotationData.staffList.length === 0) {
			return [];
		}

		const todayRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
		const activeRecords = todayRecords.filter(r => !r.isVoided);
		const reservations = (await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, { date: today, status: 'active' }));

		const allSchedules = await cloudDb.getAll<ScheduleRecord>(Collections.SCHEDULE);

		const rotationList: RotationItem[] = rotationData.staffList.map((staffData) => {
			const schedule = allSchedules.find(s => s.date === today && s.staffId === staffData.staffId);
			const shift = schedule ? schedule.shift : DEFAULT_SHIFT;

			const availableSlots = this.calculateAvailableSlots(staffData.name, activeRecords, reservations, today, shift);

			return {
				_id: staffData.staffId,
				name: staffData.name,
				shift: shift as ShiftType,
				availableSlots,
			};
		}).filter(item => item.shift === 'morning' || item.shift === 'evening');

		return rotationList;
	},

	// 计算时间轴上的空闲时段
	// 计算技师可约时段
	calculateAvailableSlots(
		staffName: string,
		activeRecords: ConsultationRecord[],
		reservations: ReservationRecord[],
		selectedDate: string,
		shift: ShiftType
	): string {
		const now = new Date();
		const todayStr = getCurrentDate();
		const isToday = selectedDate === todayStr;

		const shiftStart = SHIFT_START_TIME[shift];
		const shiftEnd = SHIFT_END_TIME[shift];

		if (!shiftStart || !shiftEnd) {
			return '未排班';
		}

		const nowHour = now.getHours();
		const nowMinute = now.getMinutes();

		if (isToday) {
			const shiftEndHour = parseInt(shiftEnd.substring(0, 2));
			if (nowHour >= shiftEndHour) {
				return '已下班';
			}
		}

		const staffRecords = activeRecords.filter(r => r.technician === staffName);
		const staffReservations = reservations.filter(r => r.technicianName === staffName);

		const occupiedSlots = [...staffRecords, ...staffReservations]
			.map(r => ({
				startTime: r.startTime,
				endTime: r.endTime
			}))
			.filter(slot => slot.startTime < shiftEnd && slot.endTime > shiftStart)
			.sort((a, b) => a.startTime.localeCompare(b.startTime));

		const availableSlots: string[] = [];

		let startTime = shiftStart;
		if (isToday) {
			const shiftStartHour = parseInt(shiftStart.substring(0, 2));
			const shiftStartMinute = parseInt(shiftStart.substring(3));
			if (nowHour > shiftStartHour || (nowHour === shiftStartHour && nowMinute >= shiftStartMinute)) {
				const nextMinute = nowMinute < 30 ? 30 : 60;
				const nextHour = nextMinute === 60 ? nowHour + 1 : nowHour;
				if (nextMinute === 60) {
					startTime = `${String(nextHour).padStart(2, '0')}:00`;
				} else {
					startTime = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
				}
			}
		}

		if (occupiedSlots.length === 0) {
			if (startTime >= shiftEnd) {
				return '已满';
			}
			const duration = getMinutesDiff(startTime, shiftEnd);
			return `${startTime}-${shiftEnd}(${duration}分钟)`;
		}

		for (let i = 0; i <= occupiedSlots.length; i++) {
			const slotEnd = i === 0 ? startTime : occupiedSlots[i - 1].endTime;
			const slotStart = i === occupiedSlots.length ? shiftEnd : occupiedSlots[i].startTime;

			if (slotEnd >= shiftEnd) {
				break;
			}

			const actualStart = slotEnd < startTime ? startTime : slotEnd;
			const actualEnd = slotStart > shiftEnd ? shiftEnd : slotStart;

			if (actualStart >= actualEnd) {
				continue;
			}

			const gap = getMinutesDiff(actualStart, actualEnd);
			if (gap >= 60) {
				availableSlots.push(`${actualStart}-${actualEnd}(${gap}分钟)`);
			}
		}

		if (availableSlots.length === 0) {
			return '已满';
		}

		return availableSlots.join(', ');
	},

	async moveRotation(e: WechatMiniprogram.TouchEvent) {
		const { index, direction } = e.currentTarget.dataset;
		const list = [...this.data.rotationList];

		let fromIndex = index;
		let toIndex = index;

		if (direction === 'up' && index > 0) {
			toIndex = index - 1;
		} else if (direction === 'down' && index < list.length - 1) {
			toIndex = index + 1;
		} else {
			return;
		}

		this.setData({ loading: true, loadingText: '调整中...' });

		try {
			const result = await app.adjustRotationPosition(this.data.selectedDate, fromIndex, toIndex);

			if (result) {
				[list[fromIndex], list[toIndex]] = [list[toIndex], list[fromIndex]];
				this.setData({ rotationList: list });

				await app.loadGlobalData();

				wx.showToast({ title: '调整成功', icon: 'success' });
			} else {
				wx.showToast({ title: '调整失败', icon: 'none' });
			}
		} catch (error) {
			wx.showToast({ title: '调整失败', icon: 'none' });
		} finally {
			this.setData({ loading: false });
		}
	},

	// 预约相关
	async openReserveModal() {
		if (!hasButtonPermission('createReservation')) {
			wx.showToast({ title: '您没有权限新增预约', icon: 'none' });
			return;
		}

		const now = new Date();
		// 计算最近的整点或半点
		const minutes = now.getMinutes();
		const roundedMinutes = minutes < 30 ? 30 : 60;
		const startTime = new Date(now);
		if (roundedMinutes === 60) {
			startTime.setHours(now.getHours() + 1);
			startTime.setMinutes(0);
		} else {
			startTime.setMinutes(30);
		}

		const startTimeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;

		this.setData({
			showReserveModal: true,
			reserveForm: {
				_id: '',
				date: this.data.selectedDate || getCurrentDate(),
				customerName: '',
				gender: 'male',
				project: '',
				phone: '',
				requirementType: 'specific',
				selectedTechnicians: [],
				genderRequirement: { male: 0, female: 0 },
				startTime: startTimeStr,
				technicianId: '',
				technicianName: '',
			}
		});
		await this.checkStaffAvailability();
	},

	// 点击排钟项目操作
	onBlockClick(e: WechatMiniprogram.CustomEvent) {
		const { id: _id, reservation, settled, inprogress } = e.detail;

		let itemList: string[];

		if (reservation) {
			itemList = ['编辑', '到店', '取消预约'];
		} else {
			// 进行中的服务添加"提前下钟"选项
			if (inprogress) {
				itemList = settled ? ['编辑', '修改结算', '提前下钟'] : ['编辑', '结算', '提前下钟'];
			} else {
				itemList = settled ? ['编辑', '修改结算'] : ['编辑', '结算'];
			}
		}

		wx.showActionSheet({
			itemList,
			success: (res) => {
				const action = itemList[res.tapIndex];
				if (action === '编辑') {
					if (reservation) {
						this.editReservation(_id);
					} else {
						wx.navigateTo({ url: `/pages/index/index?editId=${_id}` });
					}
				} else if (action === '到店') {
					this.handleArrival(_id);
				} else if (action === '取消预约') {
					this.cancelReservation(_id);
				} else if (action === '结算' || action === '修改结算') {
					this.openSettlement(_id);
				} else if (action === '提前下钟') {
					this.handleEarlyFinish(_id);
				}
			}
		});
	},

	// 提前下钟操作（使用 wx.showModal）
	async handleEarlyFinish(recordId: string) {
		this.setData({ loading: true, loadingText: '处理中...' });

		try {
			const record = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, recordId);
			if (!record) {
				wx.showToast({
					title: '记录不存在',
					icon: 'none'
				});
				this.setData({ loading: false });
				return;
			}

			const modalRes = await wx.showModal({
				title: '提前下钟',
				content: `确认要为技师 ${record.technician || ''}（房间：${record.room || ''}）提前下钟吗？\n\n将把结束时间更新为当前时间。`,
				confirmText: '确定',
				cancelText: '取消'
			});

			if (!modalRes.confirm) {
				this.setData({ loading: false });
				return;
			}

			const now = new Date();
			const endTime = formatTime(now, false);

			const updateRes = await cloudDb.updateById(Collections.CONSULTATION, recordId, {
				endTime
			});

			if (updateRes) {
				wx.showToast({
					title: '下钟成功',
					icon: 'success'
				});
				await this.loadTimelineData();
			} else {
				wx.showToast({
					title: '更新失败',
					icon: 'none'
				});
			}
		} catch (error) {
			wx.showToast({
				title: '操作失败',
				icon: 'none'
			});
		} finally {
			this.setData({ loading: false });
		}
	},

	// 处理到店操作
	async handleArrival(reserveId: string) {
		this.setData({ loading: true, loadingText: '加载中...' });
		try {
			const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
			if (!record) {
				wx.showToast({ title: '预约不存在', icon: 'none' });
				this.setData({ loading: false });
				return;
			}

			if (record.status === 'cancelled') {
				wx.showToast({ title: '该预约已取消', icon: 'none' });
				this.setData({ loading: false });
				return;
			}

			const reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
				date: record.date,
				customerName: record.customerName,
				startTime: record.startTime,
				project: record.project,
				status: 'active',
			});

			// 发送到店通知
			await this.sendArrivalNotification(reservations);

			this.setData({ loading: false });

			// 跳转到服务页面，带上预约ID列表
			if (reservations.length > 1) {
				const reserveIds = reservations.map(r => r._id).join(',');
				wx.navigateTo({ url: `/pages/index/index?reserveIds=${reserveIds}` });
			} else {
				wx.navigateTo({ url: `/pages/index/index?reserveId=${reserveId}` });
			}
		} catch (error) {
			wx.showToast({ title: '加载失败', icon: 'none' });
			this.setData({ loading: false });
		}
	},

	// 推送到店通知
	async sendArrivalNotification(reservations: ReservationRecord[]) {
		try {
			if (!reservations || reservations.length === 0) {
				return;
			}

			const firstReservation = reservations[0];
			const genderLabel = firstReservation.gender === 'male' ? '先生' : '女士';
			const customerInfo = `${firstReservation.customerName}${genderLabel}`;

			// 计算茶点份数（预约数量）
			const teaCount = reservations.length;

			// 获取技师信息
			const staffList = await app.getActiveStaffs();
			const staffMap = new Map(staffList.map(s => [s._id, s]));

			// 提取技师姓名和手机号（去重）
			const uniqueTechnicians = new Map<string, { name: string; phone?: string }>();
			reservations.forEach(r => {
				const staff = r.technicianId ? staffMap.get(r.technicianId) : null;
				const key = r.technicianId || r.technicianName;
				if (!uniqueTechnicians.has(key!)) {
					uniqueTechnicians.set(key!, { name: r.technicianName!, phone: staff?.phone });
				}
			});

			const technicianMentions = Array.from(uniqueTechnicians.values())
				.map(t => t.phone ? `${t.name}<@${t.phone}>` : t.name)
				.join(' ');

			const message = `【🏃 到店通知】

${customerInfo} 已到店
项目：${firstReservation.project}
请${technicianMentions}准备上钟，工服、口罩穿戴整齐，准备茶点（${teaCount}份）`;

			const res = await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; message?: string };
				if (result.code !== 0) {
				}
			}
		} catch (error) {
		}
	},

	// 推送预约变更通知
	async sendReservationModificationNotification(original: ReservationRecord | null, updated: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>) {
		try {
			if (!original) {
				return;
			}

			// 对比变更内容
			const changes: string[] = [];

			if (original.date !== updated.date) {
				changes.push(`📅 日期：${original.date} → ${updated.date}`);
			}
			if (original.startTime !== updated.startTime) {
				changes.push(`⏰ 时间：${original.startTime} → ${updated.startTime}`);
			}
			if (original.project !== updated.project) {
				changes.push(`💆 项目：${original.project} → ${updated.project}`);
			}
			if (original.technicianId !== updated.technicianId || original.technicianName !== updated.technicianName || (original.isClockIn || false) !== (updated.isClockIn || false)) {
				changes.push(`👨‍💼 技师：${original.technicianName}${original.isClockIn ? '[点]' : ''} → ${updated.technicianName}${updated.isClockIn ? '[点]' : ''}`);
			}
			if (original.customerName !== updated.customerName) {
				changes.push(`👤 顾客：${original.customerName} → ${updated.customerName}`);
			}
			if (original.phone !== updated.phone) {
				changes.push(`📱 电话：${original.phone} → ${updated.phone}`);
			}

			// 如果没有变更，不推送
			if (changes.length === 0) {
				return;
			}

			const genderLabel = updated.gender === 'male' ? '先生' : '女士';
			const customerInfo = `${updated.customerName}${genderLabel}`;

			// 获取技师手机号
			let technicianMention = '';
			if (updated.technicianId) {
				const staff = await app.getStaff(updated.technicianId);
				if (staff && staff.phone) {
					technicianMention = `<@${staff.phone}>`;
				}
			}
			const technicianName = updated.technicianName || '待定';
			const message = `【📝 预约变更通知】

顾客：${customerInfo}
${changes.join('\n')}

请${technicianName}${technicianMention || technicianName}知悉，做好准备`;

			const res = await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; message?: string };
				if (result.code !== 0) {
				}
			}
		} catch (error) {
		}
	},

	// 编辑预约
	async editReservation(_id: string) {
		this.setData({ loading: true, loadingText: '加载中...' });
		try {
			const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id);
			if (record) {
				if (record.status === 'cancelled') {
					wx.showToast({ title: '该预约已取消，无法编辑', icon: 'none' });
					this.setData({ loading: false });
					return;
				}

				// 判断预约类型
				const hasGenderRequirement = record.genderRequirement && !record.technicianId;
				const requirementType = hasGenderRequirement ? 'gender' : 'specific';

				const selectedTechnicians: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }> = [];
				if (record.technicianId && record.technicianName) {
					const staff = this.data.staffAvailability.find(s => s._id === record.technicianId);
					if (staff) {
						selectedTechnicians.push({ _id: staff._id, name: staff.name, phone: staff.phone, isClockIn: record.isClockIn || false });
					}
				}

				this.setData({
					showReserveModal: true,
					reserveForm: {
						_id: record._id,
						date: record.date,
						customerName: record.customerName,
						gender: record.gender,
						project: record.project,
						phone: record.phone,
						requirementType: requirementType as 'specific' | 'gender',
						selectedTechnicians,
						genderRequirement: hasGenderRequirement ? { male: record.genderRequirement === 'male' ? 1 : 0, female: record.genderRequirement === 'female' ? 1 : 0 } : { male: 0, female: 0 },
						startTime: record.startTime,
						technicianId: record.technicianId || '',
						technicianName: record.technicianName || '',
					},
					// 保存原始预约数据用于变更对比
					originalReservation: record
				});
				await this.checkStaffAvailability();
			}
		} catch (error) {
			wx.showToast({
				title: '加载预约失败',
				icon: 'none'
			});
		} finally {
			this.setData({ loading: false });
		}
	},

	// 检查技师在预约时段的可用性
	async checkStaffAvailability() {
		try {
			const { date, startTime, project, _id: editingReservationId } = this.data.reserveForm;
			if (!date || !startTime) return;

			this.setData({ loading: true, loadingText: '检查技师可用性...' });

			const projectDuration = parseProjectDuration(project) || 60;

			// 编辑模式下，排除当前正在编辑的预约ID，使其原技师可选
			const currentReservationIds = editingReservationId ? [editingReservationId] : [];

			const res = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date: date,
					currentTime: startTime,
					projectDuration: projectDuration,
					currentReservationIds
				}
			});

			if (!res.result || typeof res.result !== 'object') {
				throw new Error('获取技师列表失败');
			}

			if (res.result.code === 0) {
				const list = res.result.data as StaffAvailability[];

				const selectedTechnicianIds = this.data.reserveForm.selectedTechnicians.map(t => t._id);

				const selectedTechniciansMap = new Map(this.data.reserveForm.selectedTechnicians.map(t => [t._id, t]));

				const staffAvailability = list.map(staff => {
					const selectedTech = selectedTechniciansMap.get(staff._id);
					return {
						...staff,
						isSelected: selectedTechnicianIds.includes(staff._id),
						isClockIn: selectedTech?.isClockIn || false
					};
				});

				// 计算可用男技师和女技师数量
				const availableMaleCount = list.filter(s => !s.isOccupied && s.gender === 'male').length;
				const availableFemaleCount = list.filter(s => !s.isOccupied && s.gender === 'female').length;

				this.setData({
					staffAvailability,
					availableMaleCount,
					availableFemaleCount
				});
			} else {
				wx.showToast({
					title: res.result.message || '获取技师列表失败',
					icon: 'none'
				});
			}
		} catch (error) {
			wx.showToast({
				title: '获取技师列表失败',
				icon: 'none'
			});
		} finally {
			this.setData({ loading: false });
		}
	},

	closeReserveModal() {
		this.setData({ showReserveModal: false });
		this.loadTimelineData();
	},

	stopBubble() { },

	// 切换技师需求类型
	onRequirementTypeChange(e: WechatMiniprogram.CustomEvent) {
		const { value } = e.detail;
		const { reserveForm } = this.data;
		reserveForm.requirementType = value as 'specific' | 'gender';

		// 切换时清空选择
		if (value === 'gender') {
			reserveForm.selectedTechnicians = [];
			reserveForm.genderRequirement = { male: 1, female: 0 };
		} else {
			reserveForm.genderRequirement = { male: 0, female: 0 };
		}

		this.setData({ reserveForm });
	},

	// 调整性别数量
	onChangeGenderCount(e: WechatMiniprogram.CustomEvent) {
		const { gender, action } = e.currentTarget.dataset;
		const { reserveForm } = this.data;
		const currentCount = reserveForm.genderRequirement[gender as 'male' | 'female'];

		if (action === 'increase') {
			if (currentCount < 2) {
				reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount + 1;
			}
		} else if (action === 'decrease') {
			if (currentCount > 0) {
				reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount - 1;
			}
		}

		this.setData({ reserveForm });
		this.checkStaffAvailability();
	},

	onReserveFieldChange(e: WechatMiniprogram.CustomEvent) {
		const { field } = e.currentTarget.dataset;
		const val = e.detail.value;
		const { reserveForm } = this.data;

		if (field === 'startTime' || field === 'date') {
			reserveForm[field as 'startTime' | 'date'] = val;
			this.setData({ reserveForm });
			this.checkStaffAvailability();
		} else {
			reserveForm[field as 'customerName' | 'phone'] = val;
			this.setData({ reserveForm });
			// 触发顾客匹配
			if (field === 'customerName' || field === 'phone') {
				this.searchCustomer();
			}
		}
	},

	selectReserveTechnician(e: WechatMiniprogram.CustomEvent) {
		const { _id, technician: name, occupied, reason, phone } = e.detail;
		if (occupied) {
			wx.showToast({ title: reason || '该技师在此时段已有安排', icon: 'none', duration: 2500 });
			return;
		}

		// 多选逻辑：切换选中状态
		const selectedTechnicians = [...this.data.reserveForm.selectedTechnicians];
		const existingIndex = selectedTechnicians.findIndex(t => t._id === _id);

		if (existingIndex !== -1) {
			// 已选中，取消选择
			selectedTechnicians.splice(existingIndex, 1);
		} else {
			// 未选中，添加
			selectedTechnicians.push({ _id, name, phone, isClockIn: false });
		}

		// 更新 staffAvailability 的 isSelected 状态
		const staffAvailability = this.data.staffAvailability.map(staff => ({
			...staff,
			isSelected: selectedTechnicians.some(t => t._id === staff._id)
		}));

		this.setData({
			'reserveForm.selectedTechnicians': selectedTechnicians,
			staffAvailability
		});
	},

	toggleReserveClockIn(e: WechatMiniprogram.CustomEvent) {
		const { _id } = e.detail;
		const selectedTechnicians = [...this.data.reserveForm.selectedTechnicians];
		const tech = selectedTechnicians.find(t => t._id === _id);
		if (tech) {
			tech.isClockIn = !tech.isClockIn;
			this.setData({ 'reserveForm.selectedTechnicians': selectedTechnicians });
		}

		const staffAvailability = this.data.staffAvailability.map(staff => {
			if (staff._id === _id) {
				return { ...staff, isClockIn: !staff.isClockIn };
			}
			return staff;
		});
		this.setData({ staffAvailability });
	},

	// 选择项目（平铺版）
	async selectReserveProject(e: WechatMiniprogram.CustomEvent) {
		const { project } = e.detail;
		const currentProject = this.data.reserveForm.project;
		// 切换选中状态
		this.setData({
			'reserveForm.project': currentProject === project ? '' : project
		});
		await this.checkStaffAvailability();
	},

	onReserveGenderChange(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'reserveForm.gender': e.detail.value });
		// 触发顾客匹配
		this.searchCustomer();
	},

	// 搜索匹配顾客
	async searchCustomer() {
		const { reserveForm } = this.data;

		const currentSurname = reserveForm.customerName;
		const currentGender = reserveForm.gender;
		const currentPhone = reserveForm.phone;

		// 如果没有输入任何信息，清除匹配
		if (!currentSurname && !currentPhone) {
			this.setData({
				matchedCustomer: null,
				matchedCustomerApplied: false
			});
			return;
		}

		try {
			const res = await wx.cloud.callFunction({
				name: 'matchCustomer',
				data: {
					surname: currentSurname,
					gender: currentGender,
					phone: currentPhone
				}
			});
			if (!res.result || typeof res.result !== 'object') {
				throw new Error('匹配顾客失败');
			}
			if (res.result.code === 0 && res.result.data) {
				this.setData({
					matchedCustomer: res.result.data,
					matchedCustomerApplied: false
				});
			} else {
				this.setData({
					matchedCustomer: null,
					matchedCustomerApplied: false
				});
			}
		} catch (error) {
			this.setData({
				matchedCustomer: null,
				matchedCustomerApplied: false
			});
		}
	},

	// 应用匹配的顾客信息
	applyMatchedCustomer() {
		const { matchedCustomer } = this.data;

		if (!matchedCustomer) return;

		const updates: Record<string, any> = {
			'reserveForm.customerName': matchedCustomer.name.replace(/先生|女士/g, ''),
			'reserveForm.gender': matchedCustomer.name.endsWith('女士') ? 'female' : 'male',
		};

		if (matchedCustomer.phone) {
			updates['reserveForm.phone'] = matchedCustomer.phone;
		}

		if (matchedCustomer.responsibleTechnician) {
			const technicianName = matchedCustomer.responsibleTechnician;
			const staffAvailability = this.data.staffAvailability;
			if (staffAvailability && staffAvailability.length > 0) {
				const matchedStaff = staffAvailability.find(s => s.name === technicianName);
				if (matchedStaff) {
					updates['reserveForm.selectedTechnicians'] = [{ _id: matchedStaff._id, name: matchedStaff.name }];
					const updatedStaffAvailability = staffAvailability.map(s => ({
						...s,
						isSelected: s._id === matchedStaff._id
					}));
					updates['staffAvailability'] = updatedStaffAvailability;
				}
			}
		}

		this.setData({
			...updates,
			matchedCustomerApplied: true
		});

		wx.showToast({
			title: '已应用顾客信息',
			icon: 'success'
		});
	},

	// 清除匹配的顾客信息
	clearMatchedCustomer() {
		this.setData({
			matchedCustomer: null,
			matchedCustomerApplied: false
		});
	},

	async confirmReserve() {
		const { reserveForm, availableMaleCount, availableFemaleCount } = this.data;

		if (!reserveForm.startTime) {
			wx.showToast({ title: '开始时间必填', icon: 'none' });
			return;
		}

		// 验证技师需求
		if (reserveForm.requirementType === 'specific') {
			if (reserveForm.selectedTechnicians.length === 0) {
				wx.showToast({ title: '请选择技师', icon: 'none' });
				return;
			}
		} else if (reserveForm.requirementType === 'gender') {
			const totalRequired = reserveForm.genderRequirement.male + reserveForm.genderRequirement.female;
			if (totalRequired === 0) {
				wx.showToast({ title: '请选择技师需求', icon: 'none' });
				return;
			}
			if (reserveForm.genderRequirement.male > availableMaleCount) {
				wx.showToast({ title: `可用男技师不足（仅${availableMaleCount}位）`, icon: 'none' });
				return;
			}
			if (reserveForm.genderRequirement.female > availableFemaleCount) {
				wx.showToast({ title: `可用女技师不足（仅${availableFemaleCount}位）`, icon: 'none' });
				return;
			}
			if (totalRequired > 2) {
				wx.showToast({ title: '最多只能预约2位技师', icon: 'none' });
				return;
			}
		}

		this.setData({ loading: true, loadingText: '保存中...' });
		try {
			// 计算结束时间
			const [h, m] = reserveForm.startTime.split(':').map(Number);
			const startTotal = h * 60 + m;
			let duration = 90;
			if (reserveForm.project) {
				duration = parseProjectDuration(reserveForm.project);
				if (duration === 0) duration = 60;
			}

			const endTotal = startTotal + duration + 20;
			const endH = Math.floor(endTotal / 60);
			const endM = endTotal % 60;
			const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

			// 如果是编辑模式
			if (reserveForm._id) {
				const originalReservation = this.data.originalReservation;

				let record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>;

				if (reserveForm.requirementType === 'gender') {
					// 性别需求模式：更新性别需求
					const { male, female } = reserveForm.genderRequirement;
					record = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: '',
						technicianName: '',
						startTime: reserveForm.startTime,
						endTime: endTime,
						isClockIn: false,
						status: "active",
						genderRequirement: male > 0 ? 'male' : (female > 0 ? 'female' : undefined)
					};
				} else {
					// 点钟模式：更新指定技师
					const firstTech = reserveForm.selectedTechnicians[0];
					record = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: firstTech?._id || '',
						technicianName: firstTech?.name || '',
						startTime: reserveForm.startTime,
						endTime: endTime,
						isClockIn: firstTech?.isClockIn || false,
						status: "active"
					};
				}

				const success = await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, reserveForm._id, record);
				if (success) {
					await this.sendReservationModificationNotification(originalReservation, record);
					wx.showToast({ title: '更新成功', icon: 'success' });
					this.closeReserveModal();
					await this.loadTimelineData();
				} else {
					wx.showToast({ title: '保存失败', icon: 'none' });
				}
				return;
			}

			// 新增模式
			if (reserveForm.requirementType === 'specific') {
				// 点钟模式：为每位选中的技师创建一条预约
				const technicians = reserveForm.selectedTechnicians;
				if (technicians.length === 0) {
					const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: '',
						technicianName: '',
						startTime: reserveForm.startTime,
						endTime: endTime,
						isClockIn: false,
						status: "active"
					};
					const success = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
					if (success) {
						wx.showToast({ title: '预约成功', icon: 'success' });
						this.closeReserveModal();
						await this.loadTimelineData();
					} else {
						wx.showToast({ title: '保存失败', icon: 'none' });
					}
					return;
				}

				let successCount = 0;
				for (const tech of technicians) {
					const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: tech._id,
						technicianName: tech.name,
						startTime: reserveForm.startTime,
						endTime: endTime,
						isClockIn: tech.isClockIn || false,
						status: "active"
					};
					const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
					if (insertResult) {
						successCount++;
					}
				}

				if (successCount === technicians.length) {
					await app.loadGlobalData();

					const staffList = await app.getActiveStaffs();
					const staffMap = new Map(staffList.map(s => [s._id, s]));

					const techniciansWithPhone = technicians.map(t => ({
						_id: t._id,
						name: t.name,
						phone: staffMap.get(t._id)?.phone || '',
						isClockIn: t.isClockIn || false
					}));

					// 显示推送确认弹窗
					this.setData({
						'pushModal.show': true,
						'pushModal.type': 'create',
						'pushModal.reservationData': {
							customerName: reserveForm.customerName || '',
							gender: reserveForm.gender,
							date: reserveForm.date,
							startTime: reserveForm.startTime,
							endTime: endTime,
							project: reserveForm.project || '待定',
							technicians: techniciansWithPhone
						}
					});
				} else {
					wx.showToast({ title: `成功创建${successCount}/${technicians.length}条预约`, icon: 'none' });
					this.closeReserveModal();
					await this.loadTimelineData();
				}
			} else if (reserveForm.requirementType === 'gender') {
				// 性别需求模式：自动按轮牌顺序分配技师
				const { male, female } = reserveForm.genderRequirement;
				const totalRequired = male + female;

				// 获取轮牌数据
				const rotationData = await app.getRotationQueue(reserveForm.date);
				if (!rotationData || !rotationData.staffList || rotationData.staffList.length === 0) {
					wx.showToast({ title: '无法获取轮牌数据', icon: 'none' });
					return;
				}

				// 获取所有员工信息
				const allStaff = await app.getStaffs();
				const staffMap = new Map(allStaff.map(s => [s._id, s]));

				// 按轮牌顺序排序的员工列表
				const rotationStaffList = rotationData.staffList.map(item => ({
					staffId: item.staffId,
					position: item.position,
					staff: staffMap.get(item.staffId)
				})).filter(item => item.staff && item.staff!.status === 'active');

				// 获取该时间段已有的预约和服务记录
				const projectDuration = parseProjectDuration(reserveForm.project) || 60;
				const technicianRes = await wx.cloud.callFunction({
					name: 'getAvailableTechnicians',
					data: {
						date: reserveForm.date,
						currentTime: reserveForm.startTime,
						projectDuration: projectDuration,
						currentReservationIds: []
					}
				});

				let availableTechnicians: StaffAvailability[] = [];
				if (technicianRes.result && typeof technicianRes.result === 'object') {
					const result = technicianRes.result as { code: number; data: StaffAvailability[] };
					if (result.code === 0 && result.data) {
						availableTechnicians = result.data;
					}
				}

				// 构建可用技师的ID集合
				const availableTechnicianIds = new Set(availableTechnicians.map(t => t._id));

				// 按轮牌顺序选择可用技师
				const selectedMaleStaff: Array<{ _id: string; name: string; isClockIn: boolean }> = [];
				const selectedFemaleStaff: Array<{ _id: string; name: string; isClockIn: boolean }> = [];

				for (const rotationItem of rotationStaffList) {
					const staff = rotationItem.staff!;
					const staffId = rotationItem.staffId;

					// 检查技师是否可用
					if (!availableTechnicianIds.has(staffId)) {
						continue;
					}

					// 按性别分配
					if (staff.gender === 'male' && selectedMaleStaff.length < male) {
						selectedMaleStaff.push({
							_id: staffId,
							name: staff.name,
							isClockIn: false
						});
					} else if (staff.gender === 'female' && selectedFemaleStaff.length < female) {
						selectedFemaleStaff.push({
							_id: staffId,
							name: staff.name,
							isClockIn: false
						});
					}

					// 已满足需求，退出循环
					if (selectedMaleStaff.length === male && selectedFemaleStaff.length === female) {
						break;
					}
				}

				// 检查是否成功分配
				if (selectedMaleStaff.length < male || selectedFemaleStaff.length < female) {
					wx.showToast({
						title: `可用技师不足（男${selectedMaleStaff.length}/${male}，女${selectedFemaleStaff.length}/${female}）`,
						icon: 'none'
					});
					return;
				}

				// 合并选中的技师（先生后女）
				const selectedTechnicians = [...selectedMaleStaff, ...selectedFemaleStaff];

				// 为每个选中的技师创建预约
				let successCount = 0;
				for (const tech of selectedTechnicians) {
					const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: tech._id,
						technicianName: tech.name,
						startTime: reserveForm.startTime,
						endTime: endTime,
						isClockIn: false,
						status: 'active'
					};
					const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
					if (insertResult) {
						successCount++;
					}
				}

				if (successCount === totalRequired) {
					await app.loadGlobalData();

					const staffList = await app.getActiveStaffs();
					const staffMap = new Map(staffList.map(s => [s._id, s]));

					const techniciansWithPhone = selectedTechnicians.map(t => ({
						_id: t._id,
						name: t.name,
						phone: staffMap.get(t._id)?.phone || '',
						isClockIn: t.isClockIn || false
					}));

					// 显示推送确认弹窗
					this.setData({
						'pushModal.show': true,
						'pushModal.type': 'create',
						'pushModal.reservationData': {
							customerName: reserveForm.customerName || '',
							gender: reserveForm.gender,
							date: reserveForm.date,
							startTime: reserveForm.startTime,
							endTime: endTime,
							project: reserveForm.project || '待定',
							technicians: techniciansWithPhone
						}
					});
				} else {
					wx.showToast({ title: `成功创建${successCount}/${totalRequired}条预约`, icon: 'none' });
					this.closeReserveModal();
					await this.loadTimelineData();
				}
			}
		} catch (error) {
			wx.showToast({ title: '保存失败', icon: 'none' });
		} finally {
			this.setData({ loading: false });
		}
	},

	// 取消预约
	async cancelReservation(_id: string) {
		wx.showModal({
			title: '确认取消',
			content: '确定要取消此预约吗？',
			confirmText: '确定',
			cancelText: '再想想',
			success: async (res) => {
				if (res.confirm) {
					this.setData({ loading: true, loadingText: '取消中...' });
					try {
						const reservation = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id);

						if (!reservation) {
							wx.showToast({ title: '预约不存在', icon: 'none' });
							return;
						}

						// 查找同一顾客同一时段的所有关联预约（含双技师情况）
						const relatedReservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
							date: reservation.date,
							customerName: reservation.customerName,
							startTime: reservation.startTime,
							project: reservation.project,
							status: 'active',
						});

						// 若关联预约为空（可能被并发取消），至少保留当前这条
						const toCancel = relatedReservations.length > 0 ? relatedReservations : [reservation];

						const cancelledAt = new Date().toISOString();
						let allSuccess = true;
						for (const r of toCancel) {
							const ok = await cloudDb.updateById(Collections.RESERVATIONS, r._id, {
								status: 'cancelled',
								cancelledAt
							});
							if (!ok) allSuccess = false;
						}

						if (!allSuccess) {
							wx.showToast({ title: '部分取消失败', icon: 'none' });
							return;
						}

						await this.loadTimelineData();

						// 收集所有有手机号的技师，用于推送通知
						const staffList = await app.getActiveStaffs();
						const staffMap = new Map(staffList.map(s => [s._id, s]));

						const techniciansForPush: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }> = [];
						for (const r of toCancel) {
							if (r.technicianId) {
								const staff = staffMap.get(r.technicianId);
								if (staff && staff.phone) {
									techniciansForPush.push({
										_id: r.technicianId,
										name: r.technicianName || '',
										phone: staff.phone,
										isClockIn: r.isClockIn || false
									});
								}
							}
						}

						if (techniciansForPush.length > 0) {
							this.setData({
								'pushModal.show': true,
								'pushModal.type': 'cancel',
								'pushModal.reservationData': {
									customerName: reservation.customerName,
									gender: reservation.gender,
									date: reservation.date,
									startTime: reservation.startTime,
									endTime: reservation.endTime,
									project: reservation.project,
									technicians: techniciansForPush
								}
							});
							return;
						}

						wx.showToast({ title: '已取消预约', icon: 'success' });
					} catch (error) {
						wx.showToast({ title: '取消失败', icon: 'none' });
					} finally {
						this.setData({ loading: false });
					}
				}
			}
		});
	},

	// 打开结算弹窗
	async openSettlement(_id: string) {
		this.setData({ loading: true, loadingText: '加载中...' });

		try {
			const today = this.data.selectedDate || getCurrentDate();
			const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
			const record = records.find(r => r._id === _id) || null;

			if (!record) {
				wx.showToast({ title: '未找到该单据', icon: 'none' });
				this.setData({ loading: false });
				return;
			}

			if (record.settlement) {
				this.setData({ loading: false });

				wx.showModal({
					title: '已结算',
					content: '该单据已经结算，是否重新结算？',
					success: (res) => {
						if (res.confirm) {
							this.loadSettlement(_id, record);
						}
					}
				});
			} else {
				this.loadSettlement(_id, record);
			}
		} catch (error) {
			wx.showToast({ title: '加载失败', icon: 'none' });
			this.setData({ loading: false });
		}
	},

	// 加载结算信息
	loadSettlement(_id: string, record: ConsultationRecord) {
		const app = getApp<IAppOption>();
		const projects = app.globalData.projects || [];
		const currentProject = projects.find((p: Project) => p.name === record.project);

		let originalPrice = 0;
		if (currentProject && currentProject.price) {
			originalPrice = currentProject.price;
		}

		const paymentMethods = this.data.paymentMethods.map(m => ({
			...m,
			selected: false,
			amount: '',
			couponCode: ''
		}));

		if (record.settlement) {
			record.settlement.payments.forEach(payment => {
				const methodIndex = paymentMethods.findIndex(m => m.key === payment.method);
				if (methodIndex !== -1) {
					paymentMethods[methodIndex].selected = true;
					paymentMethods[methodIndex].amount = payment.amount.toString();
					paymentMethods[methodIndex].couponCode = payment.couponCode || '';
				}
			});
			this.calculateTotalAmount(paymentMethods);
		} else if (record.couponPlatform === 'membership') {
			const membershipIndex = paymentMethods.findIndex(m => m.key === 'membership');
			if (membershipIndex !== -1) {
				paymentMethods[membershipIndex].selected = true;
				paymentMethods[membershipIndex].amount = '1';
			}
			this.calculateTotalAmount(paymentMethods);
		}

		this.setData({
			showSettlementModal: true,
			settlementRecordId: _id,
			settlementCouponCode: record.settlement?.couponCode || record.couponCode || '',
			projectOriginalPrice: originalPrice,
			paymentMethods
		});
	},

	// 关闭结算弹窗
	closeSettlementModal() {
		this.setData({ showSettlementModal: false });
	},

	// 计算组合支付总额
	calculateTotalAmount(paymentMethods: PaymentMethodItem[]) {
		let total = 0;
		paymentMethods.forEach(method => {
			if (method.selected && method.key !== 'membership' && method.key !== 'free') {
				const amount = parseFloat(method.amount);
				if (!isNaN(amount) && amount > 0) {
					total += amount;
				}
			}
		});
		this.setData({ totalSettlementAmount: total });
	},

	// 切换支付方式
	togglePaymentMethod(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const paymentMethods = this.data.paymentMethods;
		paymentMethods[index].selected = !paymentMethods[index].selected;

		// 如果是免单，取消其他所有选项
		if (paymentMethods[index].key === 'free' && paymentMethods[index].selected) {
			paymentMethods.forEach((m, i) => {
				if (i !== index) {
					m.selected = false;
					m.amount = '';
				}
			});
		}
		// 如果选择其他方式，取消免单
		else if (paymentMethods[index].key !== 'free' && paymentMethods[index].selected) {
			const freeIndex = paymentMethods.findIndex(m => m.key === 'free');
			if (freeIndex !== -1) {
				paymentMethods[freeIndex].selected = false;
				paymentMethods[freeIndex].amount = '';
			}
		}

		// 如果取消选择，清空金额
		if (!paymentMethods[index].selected) {
			paymentMethods[index].amount = '';
		}

		this.setData({ paymentMethods });
		this.calculateTotalAmount(paymentMethods);
	},

	// 输入支付金额
	onPaymentAmountInput(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const { value } = e.detail;
		const paymentMethods = this.data.paymentMethods;
		paymentMethods[index].amount = value;
		this.setData({ paymentMethods });
		this.calculateTotalAmount(paymentMethods);
	},

	// 输入支付方式券码
	onPaymentCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const { value } = e.detail;
		const paymentMethods = this.data.paymentMethods;
		paymentMethods[index].couponCode = value;
		this.setData({ paymentMethods });
	},

	// 输入券码
	onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ settlementCouponCode: e.detail.value });
	},

	// 确认结算
	async confirmSettlement() {
		const { settlementRecordId, paymentMethods, settlementCouponCode } = this.data;

		const selectedPayments = paymentMethods.filter(m => m.selected);

		if (selectedPayments.length === 0) {
			wx.showToast({ title: '请选择支付方式', icon: 'none' });
			return;
		}

		this.setData({ loading: true, loadingText: '结算中...' });
		try {
			const today = this.data.selectedDate || getCurrentDate();
			const allRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
			const target = allRecords.find(r => r._id === settlementRecordId);

			if (!target) {
				wx.showToast({ title: '未找到该单据', icon: 'none' });
				return;
			}

			const payments: PaymentItem[] = [];
			let totalAmount = 0;

			for (const method of selectedPayments) {
				if (method.key === 'free') {
					payments.push({ method: method.key as PaymentMethod, amount: 0, couponCode: method.couponCode || settlementCouponCode });
					continue;
				}

				const amount = parseFloat(method.amount);
				if (!method.amount || isNaN(amount) || amount <= 0) {
					wx.showToast({ title: `请输入${method.label}的有效${method.key === 'membership' ? '次数' : '金额'}`, icon: 'none' });
					return;
				}

				payments.push({ method: method.key as PaymentMethod, amount, couponCode: method.couponCode || settlementCouponCode });
				if (method.key !== 'membership') {
					totalAmount += amount;
				}
			}

			const now = new Date();
			const settlement: SettlementInfo = {
				payments,
				totalAmount,
				couponCode: settlementCouponCode,
				settledAt: now.toISOString()
			};

			const membershipPayment = payments.find(p => p.method === 'membership');
			if (membershipPayment) {
				const allMemberships = await cloudDb.getAll<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP);
				const customerMembership = allMemberships.find(m => {
					return (m.customerPhone === target.phone || m.customerName === target.surname) &&
						m.remainingTimes > 0 && m.status === 'active';
				}) || null;

				if (!customerMembership) {
					wx.showToast({ title: '未找到有效会员卡或余额不足', icon: 'none' });
					return;
				}

				const deduction = membershipPayment.amount || 1;
				const newRemaining = customerMembership.remainingTimes - deduction;
				if (newRemaining < 0) {
					wx.showToast({ title: '会员卡余额不足', icon: 'none' });
					return;
				}

				await cloudDb.updateById<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP, customerMembership._id, {
					remainingTimes: newRemaining
				});

				await cloudDb.insert<MembershipUsageRecord>(Collections.MEMBERSHIP_USAGE, {
					cardId: customerMembership.cardId,
					cardName: customerMembership.cardName,
					date: today,
					customerName: target.surname,
					project: target.project,
					technician: target.technician,
					room: target.room,
					consultationId: target._id
				});
			}

			await cloudDb.updateById(Collections.CONSULTATION, settlementRecordId, {
				settlement: settlement,
				updatedAt: now.toISOString()
			});

			wx.showToast({ title: '结算成功', icon: 'success' });
			this.closeSettlementModal();
			await this.loadTimelineData();
		} catch (error) {
			wx.showToast({ title: '结算失败', icon: 'none' });
		} finally {
			this.setData({ loading: false });
		}
	},

	// 推送弹窗 - 取消
	onPushModalCancel() {
		this.setData({
			'pushModal.show': false,
			'pushModal.reservationData': null
		});
		this.closeReserveModal();
		this.loadTimelineData();
	},

	// 获取预约类型文本
	getReservationTypeText(technicians: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }>): string {
		if (technicians.length === 0) {
			return '排钟';
		}
		const hasClockIn = technicians.some(t => t.isClockIn);
		const hasNonClockIn = technicians.some(t => !t.isClockIn);
		if (hasClockIn && hasNonClockIn) {
			return '混合（点钟+排钟）';
		} else if (hasClockIn) {
			return '点钟';
		} else {
			return '排钟';
		}
	},

	// 推送弹窗 - 确认推送
	async onPushModalConfirm() {
		const { pushModal } = this.data;
		const { reservationData, type } = pushModal;

		if (!reservationData) {
			return;
		}

		this.setData({ 'pushModal.loading': true });

		try {
			const genderLabel = reservationData.gender === 'male' ? '先生' : '女士';
			const customerInfo = `${reservationData.customerName}${genderLabel}`;
			const technicianMentions = reservationData.technicians
				.map(t => t.phone ? `<@${t.phone}>` : t.name)
				.join(' ');
			const technicianNames = reservationData.technicians
				.map(t => t.name)
				.join('、');

			const reservationType = this.getReservationTypeText(reservationData.technicians);

			let message: string;

			if (type === 'cancel') {
				message = `【🚫 预约**取消**提醒】

顾客：${customerInfo}
日期：${reservationData.date}
时间：${reservationData.startTime} - ${reservationData.endTime}
项目：${reservationData.project}
类型：${reservationType}
技师：${technicianNames}

${technicianMentions}`;
			} else {
				message = `【⏰ 新预约提醒】

顾客：${customerInfo}
日期：${reservationData.date}
时间：**${reservationData.startTime} - ${reservationData.endTime}**
项目：${reservationData.project}
类型：${reservationType}
技师：**${technicianNames}**

${technicianMentions}`;
			}


			const res = await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; message?: string };
				if (result.code === 0) {
					wx.showToast({ title: '推送成功', icon: 'success', duration: 2000 });
					setTimeout(() => {
						this.onPushModalCancel();
					}, 1500);
				} else {
					wx.showToast({ title: '推送失败，请重试', icon: 'none' });
				}
			} else {
				wx.showToast({ title: '推送失败，请重试', icon: 'none' });
			}
		} catch (error) {
			wx.showToast({ title: '推送失败，请重试', icon: 'none' });
		} finally {
			this.setData({ 'pushModal.loading': false });
		}
	},

	// 打开轮牌推送弹窗
	openRotationPushModal() {
		if (!hasButtonPermission('pushRotation')) {
			wx.showToast({ title: '您没有权限推送轮牌', icon: 'none' });
			return;
		}

		this.setData({ 'rotationPushModal.show': true });
	},

	// 轮牌推送弹窗 - 取消
	onRotationPushModalCancel() {
		this.setData({ 'rotationPushModal.show': false });
	},

	// 轮牌推送弹窗 - 确认推送
	async onRotationPushModalConfirm() {
		const { rotationList, selectedDate } = this.data;

		if (rotationList.length === 0) {
			wx.showToast({ title: '暂无轮牌数据', icon: 'none' });
			return;
		}

		this.setData({ 'rotationPushModal.loading': true });

		try {
			const rotationLines = rotationList.map((staff, index) =>
				`${index + 1}. ${staff.name} (${staff.shift === 'morning' ? '早班' : '晚班'})`
			).join('\n');

			const message = `【📋 今日轮牌】

日期：${selectedDate}

${rotationLines}

请各位同事确认今日轮牌顺序，有问题与店长沟通！`;

			const res = await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; message?: string };
				if (result.code === 0) {
					wx.showToast({ title: '推送成功', icon: 'success', duration: 2000 });
					setTimeout(() => {
						this.onRotationPushModalCancel();
					}, 1500);
				} else {
					wx.showToast({ title: '推送失败，请重试', icon: 'none' });
				}
			} else {
				wx.showToast({ title: '推送失败，请重试', icon: 'none' });
			}
		} catch (error) {
			wx.showToast({ title: '推送失败，请重试', icon: 'none' });
		} finally {
			this.setData({ 'rotationPushModal.loading': false });
		}
	}
});

