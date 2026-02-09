import { authManager } from './auth';

export type PagePermission = 'index' | 'cashier' | 'history' | 'staff' | 'rooms' | 'customers';

export type ButtonPermission = 
	'voidConsultation' | 
	'editConsultation' | 
	'deleteConsultation' | 
	'editReservation' | 
	'cancelReservation' | 
	'manageStaff' | 
	'manageSchedule' | 
	'manageRooms' | 
	'settleConsultation' | 
	'exportData';

export type DataPermission = 'viewAllHistory' | 'editOwnOnly' | 'dataScope';

const PAGE_PERMISSION_MAP: Record<PagePermission, keyof UserRecord['permissions']> = {
	index: 'canAccessIndex',
	cashier: 'canAccessCashier',
	history: 'canAccessHistory',
	staff: 'canAccessStaff',
	rooms: 'canAccessRooms',
	customers: 'canAccessCustomers'
};

const BUTTON_PERMISSION_MAP: Record<ButtonPermission, keyof UserRecord['permissions']> = {
	voidConsultation: 'canVoidConsultation',
	editConsultation: 'canEditConsultation',
	deleteConsultation: 'canDeleteConsultation',
	editReservation: 'canEditReservation',
	cancelReservation: 'canCancelReservation',
	manageStaff: 'canManageStaff',
	manageSchedule: 'canManageSchedule',
	manageRooms: 'canManageRooms',
	settleConsultation: 'canSettleConsultation',
	exportData: 'canExportData'
};

export const hasPagePermission = (page: PagePermission): boolean => {
	const user = authManager.getCurrentUser();
	if (!user) return false;
	const permissionKey = PAGE_PERMISSION_MAP[page];
	return user.permissions[permissionKey] === true;
};

export const hasButtonPermission = (permission: ButtonPermission): boolean => {
	const user = authManager.getCurrentUser();
	if (!user) return false;
	const permissionKey = BUTTON_PERMISSION_MAP[permission];
	console.log('permissionKey', permissionKey,user.permissions[permissionKey]);
	return user.permissions[permissionKey] === true;
};

export const hasDataPermission = (permission: DataPermission, scope?: string): boolean => {
	const user = authManager.getCurrentUser();
	if (!user) return false;

	switch (permission) {
		case 'viewAllHistory':
			return user.permissions.canViewAllHistory === true;
		case 'editOwnOnly':
			return user.permissions.canEditOwnOnly === true;
		case 'dataScope':
			if (!scope) return true;
			if (user.permissions.dataScope === 'all') return true;
			if (user.permissions.dataScope === 'own' && scope === 'own') return true;
			if (user.permissions.dataScope === 'department' && scope === 'department') return true;
			return false;
		default:
			return false;
	}
};

export const hasAnyPagePermission = (pages: PagePermission[]): boolean => {
	return pages.some(page => hasPagePermission(page));
};

export const hasAnyButtonPermission = (permissions: ButtonPermission[]): boolean => {
	return permissions.some(permission => hasButtonPermission(permission));
};

export const requirePagePermission = (page: PagePermission): boolean => {
	if (!hasPagePermission(page)) {
		wx.showToast({
			title: '您没有权限访问此页面',
			icon: 'none'
		});
		wx.navigateBack();
		return false;
	}
	return true;
};

export const requireButtonPermission = (permission: ButtonPermission): boolean => {
	if (!hasButtonPermission(permission)) {
		wx.showToast({
			title: '您没有权限执行此操作',
			icon: 'none'
		});
		return false;
	}
	return true;
};

export const getVisibleButtons = (buttons: ButtonPermission[]): ButtonPermission[] => {
	return buttons.filter(button => hasButtonPermission(button));
};

export const canAccessPage = (pagePath: string): boolean => {
	const pageMap: Record<string, PagePermission> = {
		'/pages/index/index': 'index',
		'/pages/cashier/cashier': 'cashier',
		'/pages/history/history': 'history',
		'/pages/staff/staff': 'staff',
		'/pages/rooms/rooms': 'rooms',
		'/pages/customers/customers': 'customers'
	};

	const pageKey = pageMap[pagePath];
	if (!pageKey) return true;
	return hasPagePermission(pageKey);
};
