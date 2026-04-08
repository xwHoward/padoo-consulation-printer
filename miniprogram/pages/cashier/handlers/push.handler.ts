// push.handler.ts - 推送消息处理器
import { hasButtonPermission } from '../../../utils/permission';
import { formatMention } from '../../../utils/wechat-work';
import { cloudDb, Collections } from '../../../utils/cloud-db';
import type { CashierPage } from '../cashier.types';

const BODY_PART_LABELS: Record<string, string> = {
	head: '头部',
	neck: '颈部',
	shoulder: '肩部',
	back: '后背',
	arm: '手臂',
	abdomen: '腹部',
	waist: '腰部',
	thigh: '大腿',
	calf: '小腿'
};

const app = getApp<IAppOption>();

export class PushHandler {
	private page: CashierPage;

	constructor(page: CashierPage) {
		this.page = page;
	}

	/**
	 * 获取预约类型文本
	 */
	getReservationTypeText(technicians: Array<{ _id: string; name: string; phone: string; wechatWorkId?: string; isClockIn: boolean }>): string {
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
	}

	/**
	 * 推送弹窗 - 取消
	 */
	onPushModalCancel(): void {
		this.page.setData({
			'pushModal.show': false,
			'pushModal.reservationData': null,
			'pushModal.loading': false,
			pushModalLocked: false
		});
	}

	/**
	 * 推送弹窗 - 消息内容变更
	 */
	onPushMessageChange(e: WechatMiniprogram.CustomEvent): void {
		const value = e.detail.value;
		this.page.setData({
			'pushModal.message': value
		});
	}

	/**
	 * 推送弹窗 - 确认推送
	 */
	async onPushModalConfirm(): Promise<void> {
		const { pushModal } = this.page.data;
		const { message, reservationData } = pushModal;

		if (!reservationData || !message) {
			return;
		}

		this.page.setData({ 'pushModal.loading': true });

		try {
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
			this.page.setData({ 'pushModal.loading': false });
		}
	}

	/**
	 * 打开轮牌推送弹窗
	 */
	openRotationPushModal(): void {
		if (!hasButtonPermission('pushRotation')) {
			wx.showToast({ title: '您没有权限推送轮牌', icon: 'none' });
			return;
		}

		this.page.setData({ 'rotationPushModal.show': true });
	}

	/**
	 * 轮牌推送弹窗 - 取消
	 */
	onRotationPushModalCancel(): void {
		this.page.setData({ 'rotationPushModal.show': false });
	}

	/**
	 * 轮牌推送弹窗 - 确认推送
	 */
	async onRotationPushModalConfirm(): Promise<void> {
		const { rotationList, selectedDate } = this.page.data;

		if (rotationList.length === 0) {
			wx.showToast({ title: '暂无轮牌数据', icon: 'none' });
			return;
		}

		this.page.setData({ 'rotationPushModal.loading': true });

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
			this.page.setData({ 'rotationPushModal.loading': false });
		}
	}

	/**
	 * 推送到店通知
	 */
	async sendArrivalNotification(reservations: ReservationRecord[]): Promise<void> {
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
			const uniqueTechnicians = new Map<string, Pick<StaffInfo, 'name' | 'phone' | 'wechatWorkId'>>();
			reservations.forEach(r => {
				const staff = r.technicianId ? staffMap.get(r.technicianId) : null;
				const key = r.technicianId || r.technicianName;
				if (staff && key && !uniqueTechnicians.has(key)) {
					uniqueTechnicians.set(key, { ...staff });
				}
			});

			const technicianMentions = Array.from(uniqueTechnicians.values())
				.map(t => formatMention(t))
				.join(' ');

			// 查询老客历史记录
			const historyRemark = await this.buildCustomerHistoryRemark(
				firstReservation.phone,
				firstReservation.date
			);

			const message = `【🏃 到店通知】

${customerInfo} 已到店
项目：${firstReservation.project}
请${technicianMentions}准备上钟，工服、口罩穿戴整齐，准备茶点（${teaCount}份）${historyRemark}`;

			await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message
				}
			});
		} catch (error) {
			// 静默失败
		}
	}

	/**
	 * 查询顾客最近一次历史到店记录，返回备注文本
	 * 若无历史记录或无手机号则返回空字符串
	 */
	private async buildCustomerHistoryRemark(phone: string, today: string): Promise<string> {
		try {
			if (!phone) return '';

			// 查询该手机号的所有咨询单（前端 DB 默认最多返回 20 条）
			const records = (await cloudDb.find<ConsultationRecord>(Collections.CONSULTATION, { phone, isVoided: false })).filter(r => r.date < today)
				.sort((a, b) => b.date.localeCompare(a.date));
		

			// 过滤：排除今天、排除作废，按日期降序取最近一次
			const lastRecord = records[0];

			if (!lastRecord) return '';

			// 计算距今天数
			const diffDays = Math.round(
				(new Date(today).getTime() - new Date(lastRecord.date).getTime()) / (1000 * 60 * 60 * 24)
			);

			// 需加强部位（selectedParts 为 true 的部位）
			const parts = Object.entries(lastRecord.selectedParts || {})
				.filter(([, active]) => active)
				.map(([key]) => BODY_PART_LABELS[key] || key)
				.join('、');

			const partsText = parts || '无';
			return `\n备注：老客，第${records.length+1}次消费，上次到店：${diffDays}天前，上次需加强部位：${partsText}，上次服务技师：${lastRecord.technician || '无'}`;
		} catch {
			return '';
		}
	}

	/**
	 * 推送预约变更通知
	 */
	async sendReservationModificationNotification(
		original: ReservationRecord | null,
		updated: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>
	): Promise<void> {
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

			// 获取技师信息
			let staffInfo: StaffInfo | null = null;
			if (updated.technicianId) {
				staffInfo = await app.getStaff(updated.technicianId);
			}
			const technicianMention = staffInfo ? formatMention(staffInfo) : '';
			const technicianName = updated.technicianName || '待定';
			const message = `【📝 预约变更通知】

顾客：${customerInfo}
${changes.join('\n')}

请${technicianMention || technicianName}知悉，做好准备`;

			await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message
				}
			});
		} catch (error) {
			// 静默失败
		}
	}

	/**
	 * 推送结算通知
	 */
	async sendSettlementNotification(record: ConsultationRecord): Promise<void> {
		try {
			if (!record.settlement) {
				return;
			}

			const genderLabel = record.gender === 'male' ? '先生' : '女士';
			const customerPhone = record.phone || '';

			// 构建单据信息行
			const itemLines: string[] = [];

			const projectType = record.isClockIn ? '点钟' : '轮钟';

			// 获取支付方式显示名称
			const getPaymentMethodName = (method: PaymentMethod): string => {
				const methodMap: Record<PaymentMethod, string> = {
					meituan: '美团',
					dianping: '大众点评',
					douyin: '抖音支付',
					gaode: '现金',
					wechat: '现金',
					alipay: '现金',
					cash: '现金',
					free: '免单',
					membership: '会员卡'
				};
				return methodMap[method] || method;
			};

			// 格式化支付信息
			const paymentInfo = record.settlement.payments
				.map(p => {
					const couponCode = p.couponCode || '无';
					const amount = p.method === 'membership' || p.method === 'free' ? '0.00' : p.amount.toFixed(2);
					return `  【支付方式】：${getPaymentMethodName(p.method)} - ${amount} - ${couponCode}`;
				})
				.join('\n');

			// 如果是会员卡支付，计算总次数
			// const membershipPayment = record.settlement.payments.find(p => p.method === 'membership');
			// const actualPayment = membershipPayment ? membershipPayment.amount : record.settlement.totalAmount;

			itemLines.push(`【项目】：${record.project}
【技师】：${record.technician}
【上钟类型】：${projectType}
${paymentInfo}`);

			const message = `<@结算助手><@aibAZLKBDWbYnXLEJmwBpwXTnVlmzVRbSE7>【结算通知】
【顾客名称】：${record.surname || '散客'}
【顾客性别】：${genderLabel}
【顾客电话】：${customerPhone}
【房间】：${record.room || '无'}
${itemLines.join('\n')}`;
			await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message, type: 'markdown'
				}
			});
		} catch (error) {
			// 静默失败
			console.error('sendSettlementNotification error:', error);
		}
	}
}
