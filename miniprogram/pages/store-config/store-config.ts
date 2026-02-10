// store-config.ts
Component({
	data: {},

	methods: {
		// 模块点击事件
		onModuleTap(e: WechatMiniprogram.TouchEvent) {
			const module = e.currentTarget.dataset.module as string;

			// 根据模块类型跳转到对应页面（后续添加）
			switch (module) {
				case 'staff':
					wx.navigateTo({ url: '/pages/staff/staff' });
					break;
				case 'cashier':
					wx.navigateTo({ url: '/pages/cashier/cashier' });
					break;
				case 'customer':
					wx.navigateTo({ url: '/pages/customers/customers' });
					break;
				case 'membership':
					wx.navigateTo({ url: '/pages/membership-cards/membership-cards' });
					break;
				case 'orders':
					wx.navigateTo({ url: '/pages/history/history' });
					break;
				case 'reports':
					wx.navigateTo({ url: '/pages/analytics/analytics' });
					break;
				case 'data':
					wx.navigateTo({ url: '/pages/data-management/data-management' });
					break;
				case 'calculator':
					wx.navigateTo({ url: '/pages/calculator/index' });
					break;
				default:
					wx.showToast({ title: '功能开发中', icon: 'none' });
			}
		}
	}
});
