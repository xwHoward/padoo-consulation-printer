import { authManager } from './auth';

export type PagePermission = 'index' | 'history' | 'store-config' | 'staff' | 'cashier' | 'customers' | 'membership-cards' | 'data-management' | 'screensaver' | 'analytics' | 'calculator';

export type ButtonPermission =
	'voidConsultation' |
	'editConsultation' |
	'deleteConsultation' |
	'editReservation' |
	'cancelReservation' |
	'createReservation' |
	'pushRotation' |
	'manageStaff' |
	'manageSchedule' |
	'manageRooms' |
	'exportData';

const PAGE_PERMISSION_MAP: Record<PagePermission, keyof UserPermissions> = {
	index: 'canAccessIndex',
	cashier: 'canAccessCashier',
	history: 'canAccessHistory',
	staff: 'canAccessStaff',
	customers: 'canAccessCustomers',
	'membership-cards': 'canAccessMembershipCards',
	'data-management': 'canAccessDataManagement',
	screensaver: 'canAccessScreensaver',
	analytics: 'canAccessAnalytics',
	'store-config': 'canAccessStoreConfig',
	calculator: 'canAccessCalculator'
};

const BUTTON_PERMISSION_MAP: Record<ButtonPermission, keyof UserPermissions> = {
	voidConsultation: 'canVoidConsultation',
	editConsultation: 'canEditConsultation',
	deleteConsultation: 'canDeleteConsultation',
	editReservation: 'canEditReservation',
	cancelReservation: 'canCancelReservation',
	createReservation: 'canCreateReservation',
	pushRotation: 'canPushRotation',
	manageStaff: 'canManageStaff',
	manageSchedule: 'canManageSchedule',
	manageRooms: 'canManageRooms',
	exportData: 'canExportData'
};

const RolePermissions: Record<UserRecord['role'], Record<keyof UserPermissions, boolean>> = {
	admin: {
		canAccessIndex: true,
		canAccessCashier: true,
		canAccessHistory: true,
		canAccessStaff: true,
		canAccessCustomers: true,
		canAccessMembershipCards: true,
		canAccessDataManagement: true,
		canAccessScreensaver: true,
		canAccessAnalytics: true,
		canAccessStoreConfig: true,
		canAccessCalculator: true,
		canVoidConsultation: true,
		canEditConsultation: true,
		canDeleteConsultation: true,
		canEditReservation: true,
		canCancelReservation: true,
		canCreateReservation: true,
		canPushRotation: true,
		canManageStaff: true,
		canManageSchedule: true,
		canManageRooms: true,
		canExportData: true,
		canViewAllHistory: true,
	},
	cashier: {
		canAccessIndex: true,
		canAccessCashier: true,
		canAccessHistory: true,
		canAccessStaff: true,
		canAccessCustomers: true,
		canAccessMembershipCards: false,
		canAccessDataManagement: false,
		canAccessScreensaver: true,
		canAccessAnalytics: false,
		canAccessStoreConfig: false,
		canAccessCalculator: false,
		canVoidConsultation: true,
		canEditConsultation: true,
		canDeleteConsultation: false,
		canEditReservation: true,
		canCancelReservation: true,
		canCreateReservation: true,
		canPushRotation: true,
		canManageStaff: false,
		canManageSchedule: true,
		canManageRooms: false,
		canExportData: false,
		canViewAllHistory: true,
	},
	technician: {
		canAccessIndex: false,
		canAccessCashier: true,
		canAccessHistory: false,
		canAccessStaff: false,
		canAccessCustomers: false,
		canAccessMembershipCards: false,
		canAccessDataManagement: false,
		canAccessScreensaver: false,
		canAccessAnalytics: false,
		canAccessStoreConfig: false,
		canAccessCalculator: false,
		canVoidConsultation: false,
		canEditConsultation: false,
		canDeleteConsultation: false,
		canEditReservation: false,
		canCancelReservation: false,
		canCreateReservation: false,
		canPushRotation: false,
		canManageStaff: false,
		canManageSchedule: false,
		canManageRooms: false,
		canExportData: false,
		canViewAllHistory: false,
	},
	viewer: {
		canAccessIndex: true,
		canAccessCashier: false,
		canAccessHistory: false,
		canAccessStaff: false,
		canAccessCustomers: false,
		canAccessMembershipCards: false,
		canAccessDataManagement: false,
		canAccessScreensaver: false,
		canAccessAnalytics: false,
		canAccessStoreConfig: false,
		canAccessCalculator: false,
		canVoidConsultation: false,
		canEditConsultation: false,
		canDeleteConsultation: false,
		canEditReservation: false,
		canCancelReservation: false,
		canCreateReservation: false,
		canPushRotation: false,
		canManageStaff: false,
		canManageSchedule: false,
		canManageRooms: false,
		canExportData: false,
		canViewAllHistory: false,
	},
}

export const hasPagePermission = (page: PagePermission): boolean => {
	const user = authManager.getCurrentUser();
	if (!user) return false;
	const permissionKey = PAGE_PERMISSION_MAP[page];
	return RolePermissions[user.role as keyof typeof RolePermissions][permissionKey] === true;
};

export const hasButtonPermission = (permission: ButtonPermission): boolean => {
	const user = authManager.getCurrentUser();
	if (!user) return false;
	const permissionKey = BUTTON_PERMISSION_MAP[permission];
	return RolePermissions[user.role][permissionKey] === true;
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

export const canAccessPage = (pagePath: string): boolean => {
	const pageMap: Record<string, PagePermission> = {
		'/pages/index/index': 'index',
		'/pages/cashier/cashier': 'cashier',
		'/pages/history/history': 'history',
		'/pages/staff/staff': 'staff',
		'/pages/customers/customers': 'customers',
		'/pages/membership-cards/membership-cards': 'membership-cards',
		'/pages/data-management/data-management': 'data-management',
		'/pages/screensaver/screensaver': 'screensaver',
		'/pages/analytics/analytics': 'analytics',
		'/pages/store-config/store-config': 'store-config',
		'/pages/calculator/calculator': 'calculator'
	};

	const pageKey = pageMap[pagePath];
	if (!pageKey) return true;
	return hasPagePermission(pageKey);
};
