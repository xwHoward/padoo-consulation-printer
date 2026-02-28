// bind-staff.ts
import { authManager } from '../../utils/auth';

interface BindStaffData {
	loading: boolean
	phone: string
	staffInfo: StaffInfo | null
	bound: boolean
	unbinding: boolean
}

Page({
	data: {
		loading: false,
		phone: '',
		staffInfo: null,
		bound: false,
		unbinding: false
	} as BindStaffData,

	async onLoad() {
		await this.checkBindingStatus();
	},

	async checkBindingStatus() {
		try {
			this.setData({ loading: true });

			const res = await wx.cloud.callFunction({
				name: 'bindStaff',
				data: {
					action: 'check'
				}
			});

			if (!res.result || typeof res.result !== 'object') {
				throw new Error('响应格式错误');
			}

			const { code, data } = res.result as any;

			if (code === 0 && data.staffInfo) {
				this.setData({
					staffInfo: data.staffInfo,
					bound: true,
					loading: false
				});
			} else {
				this.setData({ loading: false });
			}
		} catch (error) {
			this.setData({ loading: false });
		}
	},

	onPhoneInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({
			phone: e.detail.value
		});
	},

	async onBind() {
		const { phone } = this.data;

		if (!phone) {
			wx.showToast({
				title: '请输入手机号',
				icon: 'none'
			});
			return;
		}

		const phoneReg = /^1[3-9]\d{9}$/;
		if (!phoneReg.test(phone)) {
			wx.showToast({
				title: '手机号格式不正确',
				icon: 'none'
			});
			return;
		}

		this.setData({ loading: true });

		try {
			const res = await wx.cloud.callFunction({
				name: 'bindStaff',
				data: {
					action: 'bind',
					phone: phone
				}
			});

			if (!res.result || typeof res.result !== 'object') {
				throw new Error('响应格式错误');
			}

			const { code, data, message } = res.result as any;

			if (code === 0) {
				wx.showToast({
					title: '绑定成功',
					icon: 'success'
				});

				this.setData({
					staffInfo: data.staffInfo,
					bound: true,
					loading: false
				});

				await authManager.refreshUserInfo();
			} else {
				this.setData({ loading: false });
				wx.showToast({
					title: message || '绑定失败',
					icon: 'none'
				});
			}
		} catch (error) {
			this.setData({ loading: false });
			wx.showToast({
				title: '绑定失败，请重试',
				icon: 'none'
			});
		}
	},

	async onUnbind() {
		wx.showModal({
			title: '确认解绑',
			content: '解绑后将无法使用技师功能，是否继续？',
			success: async (res) => {
				if (res.confirm) {
					this.performUnbind();
				}
			}
		});
	},

	async performUnbind() {
		this.setData({ loading: true, unbinding: true });

		try {
			const res = await wx.cloud.callFunction({
				name: 'bindStaff',
				data: {
					action: 'unbind'
				}
			});

			if (!res.result || typeof res.result !== 'object') {
				throw new Error('响应格式错误');
			}

			const { code, message } = res.result as any;

			if (code === 0) {
				wx.showToast({
					title: '解绑成功',
					icon: 'success'
				});

				this.setData({
					staffInfo: null,
					bound: false,
					loading: false,
					unbinding: false,
					phone: ''
				});

				await authManager.refreshUserInfo();
			} else {
				this.setData({ loading: false, unbinding: false });
				wx.showToast({
					title: message || '解绑失败',
					icon: 'none'
				});
			}
		} catch (error) {
			this.setData({ loading: false, unbinding: false });
			wx.showToast({
				title: '解绑失败，请重试',
				icon: 'none'
			});
		}
	},

	goToHome() {
		const pages = getCurrentPages();
		if (pages.length > 1) {
			wx.navigateBack();
		} else {
			wx.redirectTo({
				url: '/pages/cashier/cashier'
			});
		}
	}
});
