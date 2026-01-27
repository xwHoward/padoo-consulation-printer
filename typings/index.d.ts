/// <reference path="./types/index.d.ts" />

interface AppProject {
	id: string;
	name: string;
	duration: number;
	price?: number;
	isEssentialOilOnly?: boolean;
	status: 'normal' | 'disabled';
	createdAt?: string;
	updatedAt?: string;
}

interface AppRoom {
	id: string;
	name: string;
	status: 'normal' | 'disabled';
	createdAt?: string;
	updatedAt?: string;
}

interface AppEssentialOil {
	id: string;
	name: string;
	effect: string;
	status: 'normal' | 'disabled';
	createdAt?: string;
	updatedAt?: string;
}

interface AppRoom {
	id: string;
	name: string;
	status: 'normal' | 'disabled';
	createdAt?: string;
	updatedAt?: string;
}

interface AppEssentialOil {
	id: string;
	name: string;
	effect: string;
	status: 'normal' | 'disabled';
	createdAt?: string;
	updatedAt?: string;
}

interface AppGlobalData {
	userInfo?: WechatMiniprogram.UserInfo;
	projects: AppProject[];
	rooms: AppRoom[];
	essentialOils: AppEssentialOil[];
	isDataLoaded: boolean;
}

interface IAppOption<T extends Record<string, any> = AppGlobalData> {
	globalData: T;
	userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback;
	onLaunch?: () => void | Promise<void>;
	onShow?: (options: WechatMiniprogram.App.LaunchShowOption) => void;
	onHide?: () => void;
	onError?: (error: string) => void;
	loadGlobalData: () => Promise<void>;
	getProjects: () => AppProject[];
	getRooms: () => AppRoom[];
	getEssentialOils: () => AppEssentialOil[];
}