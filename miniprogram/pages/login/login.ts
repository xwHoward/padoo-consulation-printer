import { authManager } from '../../utils/auth';
import { hasPagePermission } from '../../utils/permission';

Page({
	data: {
		loading: false,
		userInfo: null as any,
		isLoggedIn: false
	},

	onLoad() {
		this.checkLoginStatus();
	},

	async checkLoginStatus() {
		try {
			const user = await authManager.silentLogin();
			if (user) {
				this.setData({
					userInfo: user,
					isLoggedIn: true
				});

				wx.showToast({
					title: '登录成功',
					icon: 'success'
				});

				setTimeout(() => {
					this.navigateAfterLogin();
				}, 1500);
			}
		} catch (error) {
			console.error('自动登录失败:', error);
		}
	},

	async onLogin() {
		this.setData({ loading: true });

		try {
			const user = await authManager.silentLogin();

			if (user) {
				this.setData({
					userInfo: user,
					isLoggedIn: true,
					loading: false
				});

				wx.showToast({
					title: '登录成功',
					icon: 'success'
				});

				setTimeout(() => {
					this.navigateAfterLogin();
				}, 1500);
			}
		} catch (error) {
			console.error('登录失败:', error);
			this.setData({ loading: false });
			wx.showToast({
				title: '登录失败，请重试',
				icon: 'none'
			});
		}
	},

	navigateAfterLogin() {
		const pages = getCurrentPages();
		const hasIndexPermission = hasPagePermission('index');
		const hasCashierPermission = hasPagePermission('cashier');
		if (pages.length > 1) {
			wx.navigateBack();
		} else if (hasIndexPermission) {
			wx.redirectTo({
				url: '/pages/index/index'
			});
		} else if (hasCashierPermission) {
			wx.redirectTo({
				url: '/pages/cashier/cashier'
			});
		} else {
			wx.showToast({
				title: '暂无访问权限',
				icon: 'none'
			});
		}
	},

	onGetPhoneNumber(e: WechatMiniprogram.CustomEvent) {
		if (e.detail.errMsg === 'getPhoneNumber:ok') {
			this.setData({ loading: true });
			authManager.authorizePhone().then(() => {
				this.setData({ loading: false });
				wx.showToast({
					title: '授权成功',
					icon: 'success'
				});
			}).catch((error) => {
				console.error('授权手机号失败:', error);
				this.setData({ loading: false });
				wx.showToast({
					title: '授权失败',
					icon: 'none'
				});
			});
		}
	},

	onLogout() {
		wx.showModal({
			title: '确认退出',
			content: '确定要退出登录吗？',
			success: (res) => {
				if (res.confirm) {
					authManager.logout();
				}
			}
		});
	}
});
