import { BaseFormHandler } from "../../common/handlers/base-form.handler";
import { DataLoader } from "../../common/utils/data-loader";
import { cloudDb, Collections } from "../../../utils/cloud-db";

export class SettlementHandler extends BaseFormHandler {
	async openSettlement(recordId: string) {
		this.setLoading(true, '加载中...');

		try {
			const record = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, recordId);

			if (!record) {
				this.showToast('记录不存在', 'none');
				this.setLoading(false);
				return;
			}

			const projects = await DataLoader.loadProjects();
			const project = projects.find((p: any) => p.name === record.project);

			const originalPrice = project?.price || 0;

			this.updateMultipleFields({
				showSettlementModal: true,
				settlementRecordId: recordId,
				settlementCouponCode: record.couponCode || '',
				projectOriginalPrice: originalPrice,
				totalSettlementAmount: originalPrice,
				paymentMethods: [
					{ key: 'meituan', label: '美团', selected: false, amount: '', couponCode: '' },
					{ key: 'dianping', label: '大众点评', selected: false, amount: '', couponCode: '' },
					{ key: 'douyin', label: '抖音', selected: false, amount: '', couponCode: '' },
					{ key: 'wechat', label: '微信', selected: false, amount: '', couponCode: '' },
					{ key: 'alipay', label: '支付宝', selected: false, amount: '', couponCode: '' },
					{ key: 'cash', label: '现金', selected: false, amount: '', couponCode: '' },
					{ key: 'gaode', label: '高德', selected: false, amount: '', couponCode: '' },
					{ key: 'free', label: '免单', selected: false, amount: '', couponCode: '' },
					{ key: 'membership', label: '划卡', selected: false, amount: '', couponCode: '' }
				]
			});

			if (record.settlement && record.settlement.payments) {
				this.updateMultipleFields({
					paymentMethods: record.settlement.payments
				});
			}

			this.setLoading(false);
		} catch (error) {
			this.showToast('加载失败', 'none');
			this.setLoading(false);
		}
	}

	closeSettlementModal() {
		this.updateMultipleFields({
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
				{ key: 'membership', label: '划卡', selected: false, amount: '', couponCode: '' }
			]
		});
	}

	calculateTotalAmount(paymentMethods: any[]) {
		let total = 0;
		for (const method of paymentMethods) {
			if (method.selected && method.amount) {
				const amount = parseFloat(method.amount) || 0;
				total += amount;
			}
		}
		return total;
	}

	togglePaymentMethod(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const { paymentMethods } = this.page.data;

		const newPaymentMethods = [...paymentMethods];
		newPaymentMethods[index].selected = !newPaymentMethods[index].selected;

		this.updateField('paymentMethods', newPaymentMethods);

		const totalAmount = this.calculateTotalAmount(newPaymentMethods);
		this.updateField('totalSettlementAmount', totalAmount);
	}

	onPaymentAmountInput(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const amount = e.detail.value;
		const { paymentMethods } = this.page.data;

		const newPaymentMethods = [...paymentMethods];
		newPaymentMethods[index].amount = amount;

		this.updateField('paymentMethods', newPaymentMethods);

		const totalAmount = this.calculateTotalAmount(newPaymentMethods);
		this.updateField('totalSettlementAmount', totalAmount);
	}

	onPaymentCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const couponCode = e.detail.value;
		const { paymentMethods } = this.page.data;

		const newPaymentMethods = [...paymentMethods];
		newPaymentMethods[index].couponCode = couponCode;

		this.updateField('paymentMethods', newPaymentMethods);
	}

	onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
		const couponCode = e.detail.value;
		this.updateField('settlementCouponCode', couponCode);
	}
}
