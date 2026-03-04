// settlement.handler.ts - 结算处理器
import { cloudDb, Collections } from '../../../utils/cloud-db';
import { getCurrentDate } from '../../../utils/util';
import type { CashierPage, PaymentMethodItem } from '../cashier.types';

const app = getApp<IAppOption>();

export class SettlementHandler {
	private page: CashierPage;

	constructor(page: CashierPage) {
		this.page = page;
	}

	/**
	 * 打开结算弹窗
	 */
	async openSettlement(_id: string): Promise<void> {
		this.page.setData({ loading: true, loadingText: '加载中...' });

		try {
			const today = this.page.data.selectedDate || getCurrentDate();
			const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
			const record = records.find(r => r._id === _id) || null;

			if (!record) {
				wx.showToast({ title: '未找到该单据', icon: 'none' });
				this.page.setData({ loading: false });
				return;
			}

			if (record.settlement) {
				this.page.setData({ loading: false });

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
			this.page.setData({ loading: false });
		}
	}

	/**
	 * 加载结算信息
	 */
	loadSettlement(_id: string, record: ConsultationRecord): void {
		const projects = app.globalData.projects || [];
		const currentProject = projects.find((p: Project) => p.name === record.project);

		let originalPrice = 0;
		if (currentProject && currentProject.price) {
			originalPrice = currentProject.price;
		}

		const paymentMethods = this.page.data.paymentMethods.map(m => ({
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

		this.page.setData({
			showSettlementModal: true,
			settlementRecordId: _id,
			settlementCouponCode: record.settlement?.couponCode || record.couponCode || '',
			projectOriginalPrice: originalPrice,
			paymentMethods,
			loading: false
		});
	}

	/**
	 * 关闭结算弹窗
	 */
	closeSettlementModal(): void {
		this.page.setData({ showSettlementModal: false });
	}

	/**
	 * 计算组合支付总额
	 */
	calculateTotalAmount(paymentMethods: PaymentMethodItem[]): void {
		let total = 0;
		paymentMethods.forEach(method => {
			if (method.selected && method.key !== 'membership' && method.key !== 'free') {
				const amount = parseFloat(method.amount);
				if (!isNaN(amount) && amount > 0) {
					total += amount;
				}
			}
		});
		this.page.setData({ totalSettlementAmount: total });
	}

	/**
	 * 切换支付方式
	 */
	togglePaymentMethod(e: WechatMiniprogram.CustomEvent): void {
		const { index } = e.currentTarget.dataset;
		const paymentMethods = this.page.data.paymentMethods;
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

		this.page.setData({ paymentMethods });
		this.calculateTotalAmount(paymentMethods);
	}

	/**
	 * 输入支付金额
	 */
	onPaymentAmountInput(e: WechatMiniprogram.CustomEvent): void {
		const { index } = e.currentTarget.dataset;
		const { value } = e.detail;
		const paymentMethods = this.page.data.paymentMethods;
		paymentMethods[index].amount = value;
		this.page.setData({ paymentMethods });
		this.calculateTotalAmount(paymentMethods);
	}

	/**
	 * 输入支付方式券码
	 */
	onPaymentCouponCodeInput(e: WechatMiniprogram.CustomEvent): void {
		const { index } = e.currentTarget.dataset;
		const { value } = e.detail;
		const paymentMethods = this.page.data.paymentMethods;
		paymentMethods[index].couponCode = value;
		this.page.setData({ paymentMethods });
	}

	/**
	 * 输入券码
	 */
	onCouponCodeInput(e: WechatMiniprogram.CustomEvent): void {
		this.page.setData({ settlementCouponCode: e.detail.value });
	}

	/**
	 * 确认结算
	 */
	async confirmSettlement(): Promise<void> {
		const { settlementRecordId, paymentMethods, settlementCouponCode } = this.page.data;

		const selectedPayments = paymentMethods.filter(m => m.selected);

		if (selectedPayments.length === 0) {
			wx.showToast({ title: '请选择支付方式', icon: 'none' });
			return;
		}

		this.page.setData({ loading: true, loadingText: '结算中...' });
		try {
			const today = this.page.data.selectedDate || getCurrentDate();
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
			await this.page.loadTimelineData();
		} catch (error) {
			wx.showToast({ title: '结算失败', icon: 'none' });
		} finally {
			this.page.setData({ loading: false });
		}
	}
}
