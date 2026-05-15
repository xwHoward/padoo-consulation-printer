import { checkLogin } from '../../utils/auth';
import { cloudDb, Collections } from '../../utils/cloud-db';
import { earlierThan, getCurrentDate, laterOrEqualTo, parseProjectDuration } from '../../utils/util';
import {
	ReservationService,
	DEFAULT_RESERVE_FORM,
	DEFAULT_PUSH_MODAL,
	getNextHalfHourTime,
	calculateEndTime,
} from '../../services/reservation.service';
import type { ReserveForm, PushModalState } from '../../types/reservation.types';

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
		guashaCount: number
		projectStats: Array<{ project: string; count: number; amount: number }>
	}
	paymentPlatformLabels: Record<string, string>
	// 预约功能
	canCreateReservation: boolean
	showReservationModal: boolean
	reserveForm: ReserveForm
	originalReservation: ReservationRecord | null
	projects: Project[]
	staffAvailability: StaffAvailability[]
	availableMaleCount: number
	availableFemaleCount: number
	matchedCustomer: CustomerRecord | null
	matchedCustomerApplied: boolean
	pushModal: PushModalState
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
			guashaCount: 0,
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
		// 预约功能
		canCreateReservation: false,
		showReservationModal: false,
		reserveForm: { ...DEFAULT_RESERVE_FORM },
		originalReservation: null,
		projects: [],
		staffAvailability: [],
		availableMaleCount: 0,
		availableFemaleCount: 0,
		matchedCustomer: null,
		matchedCustomerApplied: false,
		pushModal: { ...DEFAULT_PUSH_MODAL }
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
			isToday: true,
			canCreateReservation: ReservationService.canCreateReservation()
		});

		this.loadStaffInfo();
		this.loadRoomData();
		this.loadRotationData();
		this.loadPerformanceData();
		this.loadProjects();
	},

	async loadStaffInfo() {
		try {
			const staff = await cloudDb.findById<StaffInfo>(Collections.STAFF, this.data.staffId);
			this.setData({ staffInfo: staff });
		} catch (error) {
			console.error('[Profile] loadStaffInfo 失败:', error);
		}
	},

	async loadProjects() {
		try {
			const projects = await app.getProjects();
			this.setData({ projects });
		} catch (error) {
			console.error('[Profile] loadProjects 失败:', error);
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
			let guashaCount = 0;

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

				if (record.guasha) {
					guashaCount += 1;
					totalCommission += 10;
				}

				projectStats[project].amount += commission;
				totalCommission += commission;
				totalAmount += record.settlement?.totalAmount || 0;
			});

			if (guashaCount > 0) {
				projectStats['刮痧'] = { count: guashaCount, amount: guashaCount * 10 };
			}

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
					guashaCount: guashaCount,
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
				gender: '' as 'male' | 'female',
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

	// ============ 预约功能 ============

	/** 打开预约弹窗 */
	async openReservationModal() {
		if (!this.data.canCreateReservation) {
			wx.showToast({ title: '您没有权限新增预约', icon: 'none' });
			return;
		}

		const startTime = getNextHalfHourTime();
		this.setData({
			showReservationModal: true,
			reserveForm: {
				...DEFAULT_RESERVE_FORM,
				date: this.data.selectedDate || getCurrentDate(),
				startTime,
			},
			originalReservation: null,
		});
		await this.checkStaffAvailability();
	},

	/** 关闭预约弹窗 */
	closeReservationModal() {
		this.setData({ showReservationModal: false });
	},

	/** 检查技师可用性 */
	async checkStaffAvailability() {
		const { reserveForm } = this.data;
		if (!reserveForm.date || !reserveForm.startTime) return;

		this.setData({ loading: true, loadingText: '检查技师可用性...' });

		const result = await ReservationService.checkStaffAvailability(
			reserveForm.date,
			reserveForm.startTime,
			reserveForm.project,
			reserveForm._id
		);

		if (result.success && result.data) {
			const selectedIds = this.data.reserveForm.selectedTechnicians.map(t => t._id);
			const staffAvailability = result.data.map(staff => ({
				...staff,
				isSelected: selectedIds.includes(staff._id),
				isClockIn: this.data.reserveForm.selectedTechnicians.find(t => t._id === staff._id)?.isClockIn || false,
			}));
			this.setData({
				staffAvailability,
				availableMaleCount: result.maleCount || 0,
				availableFemaleCount: result.femaleCount || 0,
			});
		}

		this.setData({ loading: false });
	},

	/** 预约弹窗字段变更 */
	onReservationFieldChange(e: WechatMiniprogram.CustomEvent) {
		const { field, value } = e.detail;
		this.setData({ [`reserveForm.${field}`]: value as string });
		if (field === 'startTime' || field === 'date') {
			this.checkStaffAvailability();
		}
	},

	/** 预约弹窗性别变更 */
	onReservationGenderChange(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'reserveForm.gender': e.detail.gender });
	},

	/** 预约弹窗项目选择 */
	async onReservationProjectSelect(e: WechatMiniprogram.CustomEvent) {
		const currentProject = this.data.reserveForm.project;
		this.setData({ 'reserveForm.project': currentProject === e.detail.project ? '' : e.detail.project });
		await this.checkStaffAvailability();
	},

	/** 预约弹窗需求类型变更 */
	onRequirementTypeChange(e: WechatMiniprogram.CustomEvent) {
		const { type } = e.detail;
		const reserveForm = { ...this.data.reserveForm, requirementType: type };
		if (type === 'gender') {
			reserveForm.selectedTechnicians = [];
			reserveForm.genderRequirement = { male: 0, female: 0 };
		} else {
			reserveForm.genderRequirement = { male: 0, female: 0 };
		}
		this.setData({ reserveForm });
	},

	/** 预约弹窗技师选择 */
	onTechnicianSelect(e: WechatMiniprogram.CustomEvent) {
		const { _id, technician: name, occupied, reason, phone, hasNonClockInConflict } = e.detail;

		if (occupied) {
			wx.showToast({ title: reason || '该技师在此时段已有安排', icon: 'none', duration: 2500 });
		} else if (hasNonClockInConflict) {
			wx.showToast({ title: '该技师有非点钟预约冲突', icon: 'none', duration: 2500 });
		}

		const selectedTechnicians = [...this.data.reserveForm.selectedTechnicians];
		const existingIndex = selectedTechnicians.findIndex(t => t._id === _id);

		if (existingIndex !== -1) {
			selectedTechnicians.splice(existingIndex, 1);
		} else {
			const staff = this.data.staffAvailability.find(s => s._id === _id);
			selectedTechnicians.push({ _id, name, phone, wechatWorkId: staff?.wechatWorkId, isClockIn: false });
		}

		const staffAvailability = this.data.staffAvailability.map(staff => ({
			...staff,
			isSelected: selectedTechnicians.some(t => t._id === staff._id),
		}));

		this.setData({ 'reserveForm.selectedTechnicians': selectedTechnicians, staffAvailability });
	},

	/** 预约弹窗点钟切换 */
	onClockInToggle(e: WechatMiniprogram.CustomEvent) {
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

	/** 预约弹窗性别数量调整 */
	onChangeGenderCount(e: WechatMiniprogram.CustomEvent) {
		const { gender, action } = e.detail;
		const reserveForm = { ...this.data.reserveForm };
		const currentCount = reserveForm.genderRequirement[gender as 'male' | 'female'];

		if (action === 'increase' && currentCount < 2) {
			reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount + 1;
		} else if (action === 'decrease' && currentCount > 0) {
			reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount - 1;
		}

		this.setData({ reserveForm });
		this.checkStaffAvailability();
	},

	/** 确认预约 */
	async confirmReservation(e: WechatMiniprogram.CustomEvent) {
		const { reserveForm, availableMaleCount, availableFemaleCount } = this.data;
		const validation = ReservationService.validateForm(reserveForm, reserveForm.requirementType, availableMaleCount, availableFemaleCount);
		if (!validation.valid) {
			wx.showToast({ title: validation.message || '验证失败', icon: 'none' });
			return;
		}

		this.setData({ loading: true, loadingText: '保存中...' });

		try {
			const endTime = calculateEndTime(reserveForm.startTime, reserveForm.project);

			if (reserveForm._id) {
				// 编辑模式
				const result = await ReservationService.updateReservation(reserveForm._id, reserveForm, endTime);
				if (result.success) {
					wx.showToast({ title: '保存成功', icon: 'success' });
					this.closeReservationModal();
				} else {
					wx.showToast({ title: result.message || '保存失败', icon: 'none' });
				}
			} else {
				// 新建模式
				if (reserveForm.requirementType === 'specific') {
					await this.handleSpecificReservation(reserveForm, endTime);
				} else {
					await this.handleGenderReservation(reserveForm, endTime);
				}
			}
		} catch (error) {
			wx.showToast({ title: '保存失败', icon: 'none' });
		} finally {
			this.setData({ loading: false });
		}
	},

	/** 处理点钟模式预约 */
	async handleSpecificReservation(form: ReserveForm, endTime: string) {
		const technicians = form.selectedTechnicians;
		if (technicians.length === 0) {
			wx.showToast({ title: '请至少选择一位技师', icon: 'none' });
			return;
		}

		const result = await ReservationService.createReservations(form, technicians, endTime);
		if (result.successCount === result.totalCount) {
			wx.showToast({ title: '预约成功', icon: 'success' });
			this.closeReservationModal();
		} else {
			wx.showToast({ title: `成功创建${result.successCount}/${result.totalCount}条预约`, icon: 'none' });
			this.closeReservationModal();
		}
	},

	/** 处理轮钟模式预约 */
	async handleGenderReservation(form: ReserveForm, endTime: string) {
		const { male, female } = form.genderRequirement;
		const result = await ReservationService.allocateTechniciansByGender(
			form.date,
			form.startTime,
			form.project,
			male,
			female
		);

		if (!result.success || !result.technicians) {
			wx.showToast({ title: result.message || '分配技师失败', icon: 'none' });
			return;
		}

		const createResult = await ReservationService.createReservations(form, result.technicians, endTime);
		if (createResult.successCount === createResult.totalCount) {
			wx.showToast({ title: '预约成功', icon: 'success' });
			this.closeReservationModal();
		} else {
			wx.showToast({ title: `成功创建${createResult.successCount}/${createResult.totalCount}条预约`, icon: 'none' });
			this.closeReservationModal();
		}
	},

	/** 推送弹窗取消 */
	onPushModalCancel() {
		this.setData({
			'pushModal.show': false,
			'pushModal.loading': false,
		});
	},

	/** 推送弹窗确认 */
	async onPushModalConfirm() {
		const { pushModal } = this.data;
		if (!pushModal.message) return;

		this.setData({ 'pushModal.loading': true });

		try {
			await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: { content: pushModal.message },
			});
			wx.showToast({ title: '推送成功', icon: 'success', duration: 2000 });
			setTimeout(() => this.onPushModalCancel(), 1500);
		} catch (error) {
			wx.showToast({ title: '推送失败', icon: 'none' });
		} finally {
			this.setData({ 'pushModal.loading': false });
		}
	},

	/** 推送消息变更 */
	onPushMessageChange(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'pushModal.message': e.detail.value });
	},
});
