// cashier.ts - 收银台主页面（模块化重构版）
import { checkLogin } from '../../utils/auth';
import { loadingService, LockKeys } from '../../utils/loading-service';
import { hasButtonPermission, requirePagePermission } from '../../utils/permission';
import { formatDate, getCurrentDate } from '../../utils/util';
import type { PaymentMethodItem } from './cashier.types';
import { ReservationHandler } from './handlers/reservation.handler';
import { SettlementHandler } from './handlers/settlement.handler';
import { PushHandler } from './handlers/push.handler';
import { CashierDataLoaderService } from './services/data-loader.service';
import { searchCustomer, applyMatchedCustomer, clearMatchedCustomer } from './utils/customer-match';

const app = getApp<IAppOption>();

// 处理器实例（延迟初始化）
let reservationHandler: ReservationHandler | null = null;
let settlementHandler: SettlementHandler | null = null;
let pushHandler: PushHandler | null = null;
let dataLoader: CashierDataLoaderService | null = null;

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
		matchedCustomer: null as CustomerRecord | null,
		matchedCustomerApplied: false,
		// 预约推送确认弹窗
		pushModal: {
			show: false,
			loading: false,
			type: 'create' as 'create' | 'cancel' | 'edit',
			message: '',
			mentions: [] as Array<{ _id: string; name: string; phone: string; wechatWorkId?: string }>,
			reservationData: null as {
				original?: ReservationRecord;
				updated?: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>;
				customerName: string;
				gender: 'male' | 'female';
				date: string;
				startTime: string;
				endTime: string;
				project: string;
				technicians: Array<{ _id: string; name: string; phone: string; wechatWorkId: string; isClockIn: boolean }>;
			} | null
		},
		pushModalLocked: false,
		// 轮牌推送确认弹窗
		rotationPushModal: {
			show: false,
			loading: false
		},
		arrivalConfirmModal: {
			show: false,
			reserveId: '',
			customerName: '',
			project: '',
			technicianName: ''
		}
	},

	// ========== 生命周期 ==========
	async onLoad() {
		const isLoggedIn = await checkLogin();
		if (!isLoggedIn) return;

		if (!requirePagePermission('cashier')) return;

		// 初始化处理器
		this.initHandlers();

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

	// ========== 初始化 ==========
	initHandlers() {
		reservationHandler = new ReservationHandler(this as any);
		settlementHandler = new SettlementHandler(this as any);
		pushHandler = new PushHandler(this as any);
		dataLoader = new CashierDataLoaderService(this as any);
	},

	// ========== 切换横屏/竖屏 ==========
	toggleLandscape() {
		const isLandscape = !this.data.isLandscape;
		this.setData({ isLandscape });

		try {
			wx.setPageOrientation({
				pageOrientation: isLandscape ? 'landscape' : 'portrait'
			});
		} catch (error) {
			wx.showToast({ title: '设置失败', icon: 'none' });
		}
	},

	// ========== 数据加载 ==========
	async loadProjects() {
		const projects = app.globalData.projects || [];
		this.setData({ projects });
	},

	async loadInitialData() {
		if (dataLoader) {
			await dataLoader.loadInitialData();
		}
	},

	async loadTimelineData() {
		if (dataLoader) {
			await dataLoader.loadTimelineData();
		}
	},

	// ========== 日期选择 ==========
	async onDateChange(e: WechatMiniprogram.CustomEvent) {
		const date = e.detail.date;
		this.setData({ selectedDate: date });
	},

	onDatePickerChange(e: WechatMiniprogram.CustomEvent) {
		const date = e.detail.date;
		this.setData({ selectedDate: date });
	},

	// ========== 轮牌相关 ==========
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

		await loadingService.withLoading(this, async () => {
			const result = await app.adjustRotationPosition(this.data.selectedDate, fromIndex, toIndex);

			if (result) {
				[list[fromIndex], list[toIndex]] = [list[toIndex], list[fromIndex]];
				this.setData({ rotationList: list });
				await app.loadGlobalData();
				wx.showToast({ title: '调整成功', icon: 'success' });
			} else {
				throw new Error('调整失败');
			}
		}, {
			loadingText: '调整中...',
			lockKey: LockKeys.ADJUST_ROTATION,
			errorText: '调整失败'
		});
	},

	// ========== 预约相关（委托给 ReservationHandler） ==========
	async openReserveModal() {
		if (reservationHandler) await reservationHandler.openReserveModal();
	},

	closeReserveModal() {
		if (reservationHandler) reservationHandler.closeReserveModal();
	},

	async checkStaffAvailability() {
		if (reservationHandler) await reservationHandler.checkStaffAvailability();
	},

	onRequirementTypeChange(e: WechatMiniprogram.CustomEvent) {
		if (reservationHandler) reservationHandler.onRequirementTypeChange(e);
	},

	onChangeGenderCount(e: WechatMiniprogram.CustomEvent) {
		if (reservationHandler) reservationHandler.onChangeGenderCount(e);
	},

	onReserveFieldChange(e: WechatMiniprogram.CustomEvent) {
		if (reservationHandler) reservationHandler.onReserveFieldChange(e);
	},

	selectReserveTechnician(e: WechatMiniprogram.CustomEvent) {
		if (reservationHandler) reservationHandler.selectReserveTechnician(e);
	},

	toggleReserveClockIn(e: WechatMiniprogram.CustomEvent) {
		if (reservationHandler) reservationHandler.toggleReserveClockIn(e);
	},

	async selectReserveProject(e: WechatMiniprogram.CustomEvent) {
		if (reservationHandler) await reservationHandler.selectReserveProject(e);
	},

	onReserveGenderChange(e: WechatMiniprogram.CustomEvent) {
		if (reservationHandler) reservationHandler.onReserveGenderChange(e);
	},

	async confirmReserve() {
		if (reservationHandler) await reservationHandler.confirmReserve();
	},

	async cancelReservation(_id: string) {
		if (reservationHandler) await reservationHandler.cancelReservation(_id);
	},

	async editReservation(_id: string) {
		if (reservationHandler) await reservationHandler.editReservation(_id);
	},

	async handleArrival(reserveId: string) {
		if (reservationHandler) await reservationHandler.handleArrival(reserveId);
	},

	async handleEarlyFinish(recordId: string) {
		if (reservationHandler) await reservationHandler.handleEarlyFinish(recordId);
	},

	async onArrivalConfirmPush() {
		const { reserveId } = this.data.arrivalConfirmModal;
		this.setData({
			'arrivalConfirmModal.show': false
		});
		if (reservationHandler) await reservationHandler.processArrival(reserveId, true);
	},

	async onArrivalConfirmSkip() {
		const { reserveId } = this.data.arrivalConfirmModal;
		this.setData({
			'arrivalConfirmModal.show': false
		});
		if (reservationHandler) await reservationHandler.processArrival(reserveId, false);
	},

	// ========== 顾客匹配（委托给 utils） ==========
	async searchCustomer() {
		await searchCustomer(this as any);
	},

	applyMatchedCustomer() {
		applyMatchedCustomer(this as any);
	},

	clearMatchedCustomer() {
		clearMatchedCustomer(this as any);
	},

	// ========== 结算相关（委托给 SettlementHandler） ==========
	async openSettlement(_id: string) {
		if (settlementHandler) await settlementHandler.openSettlement(_id);
	},

	loadSettlement(_id: string, record: ConsultationRecord) {
		if (settlementHandler) settlementHandler.loadSettlement(_id, record);
	},

	closeSettlementModal() {
		if (settlementHandler) settlementHandler.closeSettlementModal();
	},

	calculateTotalAmount(paymentMethods: PaymentMethodItem[]) {
		if (settlementHandler) settlementHandler.calculateTotalAmount(paymentMethods);
	},

	togglePaymentMethod(e: WechatMiniprogram.CustomEvent) {
		if (settlementHandler) settlementHandler.togglePaymentMethod(e);
	},

	onPaymentAmountInput(e: WechatMiniprogram.CustomEvent) {
		if (settlementHandler) settlementHandler.onPaymentAmountInput(e);
	},

	onPaymentCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
		if (settlementHandler) settlementHandler.onPaymentCouponCodeInput(e);
	},

	onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
		if (settlementHandler) settlementHandler.onCouponCodeInput(e);
	},

	async confirmSettlement() {
		if (settlementHandler) await settlementHandler.confirmSettlement();
	},

	// ========== 推送相关（委托给 PushHandler） ==========
	getReservationTypeText(technicians: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }>): string {
		if (pushHandler) return pushHandler.getReservationTypeText(technicians);
		return '排钟';
	},

	onPushModalCancel() {
		if (pushHandler) pushHandler.onPushModalCancel();
	},

	async onPushModalConfirm() {
		if (pushHandler) await pushHandler.onPushModalConfirm();
	},

	openRotationPushModal() {
		if (pushHandler) pushHandler.openRotationPushModal();
	},

	async resetRotation() {
		try {
			await loadingService.withLoading(this, async () => {
				await wx.cloud.callFunction({
					name: 'manageRotation',
					data: {
						action: 'init',
						date: formatDate(new Date())
					}
				});
				await app.loadGlobalData();
			}, {
				loadingText: '调整中...',
				lockKey: LockKeys.ADJUST_ROTATION,
				errorText: '调整失败'
			});
		} catch (error) {
			wx.showToast({ title: '重置失败', icon: 'none' });
		}

	},

	onRotationPushModalCancel() {
		if (pushHandler) pushHandler.onRotationPushModalCancel();
	},

	async onRotationPushModalConfirm() {
		if (pushHandler) await pushHandler.onRotationPushModalConfirm();
	},

	async sendArrivalNotification(reservations: ReservationRecord[]) {
		if (pushHandler) await pushHandler.sendArrivalNotification(reservations);
	},

	async sendReservationModificationNotification(original: ReservationRecord | null, updated: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>) {
		if (pushHandler) await pushHandler.sendReservationModificationNotification(original, updated);
	},

	// ========== 时间轴点击操作 ==========
	onBlockClick(e: WechatMiniprogram.CustomEvent) {
		const { id: _id, reservation, settled, inprogress } = e.detail;

		let itemList: string[];

		if (reservation) {
			itemList = ['编辑', '到店', '取消预约'];
		} else {
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

	stopBubble() { }
});
