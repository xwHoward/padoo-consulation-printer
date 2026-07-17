// push.handler.ts - 推送消息处理器
import { hasButtonPermission } from '../../../utils/permission';
import type { CashierPage } from '../cashier.types';

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

			const message = `【📋 今日轮牌】\n\n日期：${selectedDate}\n\n${rotationLines}\n\n请各位同事确认今日轮牌顺序，有问题与店长沟通！`;

			await wx.setClipboardData({ data: message });
			wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 2000 });
			setTimeout(() => {
				this.onRotationPushModalCancel();
			}, 1500);
		} catch {
			wx.showToast({ title: '复制失败，请重试', icon: 'none' });
		} finally {
			this.page.setData({ 'rotationPushModal.loading': false });
		}
	}
}
