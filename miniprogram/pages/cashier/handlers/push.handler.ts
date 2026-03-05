// push.handler.ts - 推送消息处理器
import { hasButtonPermission } from '../../../utils/permission';
import { formatMention } from '../../../utils/wechat-work';
import type { CashierPage } from '../cashier.types';

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
			'pushModal.reservationData': null
		});
		this.page.closeReserveModal();
		this.page.loadTimelineData();
	}

	/**
	 * 推送弹窗 - 确认推送
	 */
	async onPushModalConfirm(): Promise<void> {
		const { pushModal } = this.page.data;
		const { reservationData, type } = pushModal;

		if (!reservationData) {
			return;
		}

		this.page.setData({ 'pushModal.loading': true });

		try {
			const genderLabel = reservationData.gender === 'male' ? '先生' : '女士';
			const customerInfo = `${reservationData.customerName}${genderLabel}`;
			const technicianMentions = reservationData.technicians
				.map(t => formatMention(t))
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
			const uniqueTechnicians = new Map<string, Pick<StaffInfo, 'name'|'phone'|'wechatWorkId'>>();
			reservations.forEach(r => {
				const staff = r.technicianId ? staffMap.get(r.technicianId) : null;
				const key = r.technicianId || r.technicianName;
				if (staff&&key && !uniqueTechnicians.has(key)) {
					uniqueTechnicians.set(key, { ...staff });
				}
			});

			const technicianMentions = Array.from(uniqueTechnicians.values())
				.map(t => formatMention(t))
				.join(' ');

			const message = `【🏃 到店通知】

${customerInfo} 已到店
项目：${firstReservation.project}
请${technicianMentions}准备上钟，工服、口罩穿戴整齐，准备茶点（${teaCount}份）`;

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

请${technicianName}${technicianMention || technicianName}知悉，做好准备`;

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
}
