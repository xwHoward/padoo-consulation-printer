import { hasPagePermission } from "../../utils/permission";

// store-config.ts
Page({
	data: {
		hasStaffAuth: false,
		hasCashierAuth: false,
		hasCustomerAuth: false,
		hasMembershipAuth: false,
		hasOrdersAuth: false,
		hasReportsAuth: false,
		hasDataAuth: false,
		hasCalculatorAuth: false,
	},

	onLoad(query) {
		this.setData({
			hasStaffAuth: hasPagePermission('staff'),
			hasCashierAuth: hasPagePermission('cashier'),
			hasCustomerAuth: hasPagePermission('customers'),
			hasMembershipAuth: hasPagePermission('membership-cards'),
			hasOrdersAuth: hasPagePermission('history'),
			hasReportsAuth: hasPagePermission('analytics'),
			hasDataAuth: hasPagePermission('data-management'),
			hasCalculatorAuth: hasPagePermission('calculator'),
		});
	},

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
});
