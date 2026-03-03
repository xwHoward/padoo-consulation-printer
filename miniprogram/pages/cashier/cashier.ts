import { checkLogin } from '../../utils/auth';
import { requirePagePermission, hasButtonPermission } from '../../utils/permission';
import { getCurrentDate, formatTime, formatDate } from '../../utils/util';
import { cloudDb, Collections } from '../../utils/cloud-db';
import { CashierHandler } from './handlers/cashier.handler';

const app = getApp<IAppOption>();

Page({
	data: {
		isLandscape: false,
		selectedDate: '',
		rooms: [] as Room[],
		rotationList: [] as RotationItem[],
		timelineRefreshTrigger: 0,
		dateSelector: {
			selectedDate: '',
			previousDate: '',
			nextDate: '',
			isToday: false
		},
		canCreateReservation: false,
		canPushRotation: false,
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
		loading: false,
		loadingText: '加载中...',
		matchedCustomer: null as CustomerRecord | null,
		matchedCustomerApplied: false,
		pushModal: {
			show: false,
			loading: false,
			type: 'create' as 'create' | 'cancel',
			reservationData: null as any
		},
		rotationPushModal: {
			show: false,
			loading: false
		}
	},

	handler: null as CashierHandler | null,

	async onLoad() {
		const isLoggedIn = await checkLogin();
		if (!isLoggedIn) return;

		if (!requirePagePermission('cashier')) return;

		const today = getCurrentDate();
		this.setData({ selectedDate: today });

		this.handler = new CashierHandler(this);
		await this.handler.loadProjects();
	},

	async onShow() {
		const isLoggedIn = await checkLogin();
		if (!isLoggedIn) return;

		if (!requirePagePermission('cashier')) return;

		this.setData({
			canCreateReservation: hasButtonPermission('createReservation'),
			canPushRotation: hasButtonPermission('pushRotation')
		});

		if (this.handler) {
			await this.handler.timelineHandler.loadInitialData();
		}
	},

	toggleLandscape() {
		const isLandscape = !this.data.isLandscape;
		this.setData({ isLandscape });

		try {
			if (isLandscape) {
				wx.setPageOrientation({ pageOrientation: 'landscape' });
			} else {
				wx.setPageOrientation({ pageOrientation: 'portrait' });
			}
		} catch (error) {
			wx.showToast({ title: '设置失败', icon: 'none' });
		}
	},

	async onDateChange(e: WechatMiniprogram.CustomEvent) {
		const selectedDate = e.detail.value;
		this.setData({ selectedDate });
		if (this.handler) {
			await this.handler.timelineHandler.loadTimelineData();
		}
	},

	onDatePickerChange(e: WechatMiniprogram.CustomEvent) {
		const selectedDate = e.detail.date;
		this.setData({ selectedDate });
		if (this.handler) {
			this.handler.timelineHandler.loadTimelineData();
		}
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
					this.handler?.handleArrival(_id);
				} else if (action === '取消预约') {
					this.handler?.cancelReservation(_id);
				} else if (action === '结算' || action === '修改结算') {
					this.handler?.settlementHandler.openSettlement(_id);
				} else if (action === '提前下钟') {
					this.handleEarlyFinish(_id);
				}
			}
		});
	},

	async handleEarlyFinish(recordId: string) {
		this.setData({ loading: true, loadingText: '处理中...' });

		try {
			const record = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, recordId);
			if (!record) {
				wx.showToast({ title: '记录不存在', icon: 'none' });
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
				wx.showToast({ title: '下钟成功', icon: 'success' });
				if (this.handler) {
					await this.handler.timelineHandler.loadTimelineData();
				}
			} else {
				wx.showToast({ title: '更新失败', icon: 'none' });
			}
		} catch (error) {
			wx.showToast({ title: '操作失败', icon: 'none' });
		} finally {
			this.setData({ loading: false });
		}
	},

	async openReserveModal() {
		if (!hasButtonPermission('createReservation')) {
			wx.showToast({ title: '您没有权限新增预约', icon: 'none' });
			return;
		}

		if (this.handler) {
			await this.handler.openReserveModal();
		}
	},

	async editReservation(reservationId: string) {
		try {
			const reservation = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reservationId);
			if (reservation && this.handler) {
				await this.handler.openReserveModal(reservation);
			}
		} catch (error) {
			wx.showToast({ title: '加载失败', icon: 'none' });
		}
	},

	async saveReservation() {
		const { reserveForm } = this.data;

		if (reserveForm._id) {
			if (this.handler) {
				await this.handler.updateReservation();
			}
		} else {
			if (this.handler) {
				await this.handler.createReservation();
			}
		}
	},

	onCustomerNameInput(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.onCustomerNameInput(e);
	},

	onGenderChange(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.onGenderChange(e);
	},

	onPhoneInput(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.onPhoneInput(e);
	},

	onProjectChange(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.onProjectChange(e);
	},

	onStartTimeChange(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.onStartTimeChange(e);
	},

	onRequirementTypeChange(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.onRequirementTypeChange(e);
	},

	onChangeGenderCount(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.onChangeGenderCount(e);
	},

	selectReserveTechnician(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.selectReserveTechnician(e);
	},

	toggleReserveClockIn(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.toggleReserveClockIn(e);
	},

	removeReserveTechnician(e: WechatMiniprogram.CustomEvent) {
		this.handler?.reservationFormHandler.removeReserveTechnician(e);
	},

	closeReserveModal() {
		this.handler?.reservationFormHandler.closeReserveModal();
	},

	stopBubble() {
		this.handler?.reservationFormHandler.stopBubble();
	},

	applyMatchedCustomer() {
		this.handler?.reservationFormHandler.applyMatchedCustomer();
	},

	clearMatchedCustomer() {
		this.handler?.reservationFormHandler.clearMatchedCustomer();
	},

	togglePaymentMethod(e: WechatMiniprogram.CustomEvent) {
		this.handler?.settlementHandler.togglePaymentMethod(e);
	},

	onPaymentAmountInput(e: WechatMiniprogram.CustomEvent) {
		this.handler?.settlementHandler.onPaymentAmountInput(e);
	},

	onPaymentCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
		this.handler?.settlementHandler.onPaymentCouponCodeInput(e);
	},

	onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
		this.handler?.settlementHandler.onCouponCodeInput(e);
	},

	closeSettlementModal() {
		this.handler?.settlementHandler.closeSettlementModal();
	},

	saveSettlement() {
		this.handler?.saveSettlement();
	},

	onPushModalConfirm() {
		this.handler?.onPushModalConfirm();
	},

	onPushModalCancel() {
		this.handler?.onPushModalCancel();
	},

	openRotationPushModal() {
		this.setData({ 'rotationPushModal.show': true });
	},

	onRotationPushModalCancel() {
		this.setData({ 'rotationPushModal.show': false });
	},

	async onRotationPushModalConfirm() {
		this.setData({ 'rotationPushModal.show': false });
		if (this.handler) {
			await this.handler.pushRotation();
		}
	},

	async resetRotation() {
		try {
			const today = formatDate(new Date());
			await wx.cloud.callFunction({
				name: 'manageRotation',
				data: {
					action: 'init',
					date: today
				}
			});
			app.getRotationQueue(today);
		} catch (error) {

		}
	},

	checkStaffAvailability() {
		return this.handler?.checkStaffAvailability();
	},
});
