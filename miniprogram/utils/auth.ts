const STORAGE_KEY_USER = 'currentUser';
const STORAGE_KEY_TOKEN = 'authToken';

export class AuthManager {
	private static instance: AuthManager;
	private currentUser: UserRecord | null = null;
	private token: string | null = null;
	private loginPromise: Promise<UserRecord> | null = null;

	private constructor() {
		this.loadFromStorage();
	}

	static getInstance(): AuthManager {
		if (!AuthManager.instance) {
			AuthManager.instance = new AuthManager();
		}
		return AuthManager.instance;
	}

	private loadFromStorage() {
		try {
			const userStr = wx.getStorageSync(STORAGE_KEY_USER);
			const tokenStr = wx.getStorageSync(STORAGE_KEY_TOKEN);
			if (userStr) {
				this.currentUser = JSON.parse(userStr);
			}
			if (tokenStr) {
				this.token = tokenStr;
			}
		} catch (error) {
		}
	}

	private saveToStorage() {
		try {
			if (this.currentUser) {
				wx.setStorageSync(STORAGE_KEY_USER, JSON.stringify(this.currentUser));
			} else {
				wx.removeStorageSync(STORAGE_KEY_USER);
			}
			if (this.token) {
				wx.setStorageSync(STORAGE_KEY_TOKEN, this.token);
			} else {
				wx.removeStorageSync(STORAGE_KEY_TOKEN);
			}
		} catch (error) {
		}
	}

	getCurrentUser(): UserRecord | null {
		return this.currentUser;
	}

	getToken(): string | null {
		return this.token;
	}

	isLoggedIn(): boolean {
		return !!this.currentUser && !!this.token;
	}

	getUserRole(): UserRecord['role'] | null {
		return this.currentUser?.role || null;
	}

	isAdmin(): boolean {
		return this.getUserRole() === 'admin';
	}

	updateUserInfo(userInfo: Partial<UserRecord>) {
		if (this.currentUser) {
			this.currentUser = { ...this.currentUser, ...userInfo };
			this.saveToStorage();
		}
	}

	async silentLogin(): Promise<UserRecord | null> {
		if (this.isLoggedIn()) {
			return this.currentUser;
		}

		if (this.loginPromise) {
			return this.loginPromise;
		}

		this.loginPromise = this.doSilentLogin();

		try {
			const user = await this.loginPromise;
			return user;
		} finally {
			this.loginPromise = null;
		}
	}

	private async doSilentLogin(): Promise<UserRecord> {
		try {
			const { code } = await wx.login();

			const res = await wx.cloud.callFunction({
				name: 'login',
				data: { code }
			});

			if (!res.result || typeof res.result !== 'object') {
				throw new Error('登录响应格式错误');
			}

			const { code: resultCode, data, message } = res.result as any;

			if (resultCode !== 0) {
				throw new Error(message || '登录失败');
			}

			const loginResponse = data as LoginResponse;

			this.currentUser = loginResponse.user;
			this.token = loginResponse.token;
			this.saveToStorage();

			return this.currentUser;
		} catch (error) {
			throw error;
		}
	}

	async authorizePhone(): Promise<UserRecord> {
		try {
			const res = await wx.cloud.callFunction({
				name: 'login',
				data: { action: 'authorizePhone' }
			});

			if (!res.result || typeof res.result !== 'object') {
				throw new Error('授权响应格式错误');
			}

			const { code: resultCode, data, message } = res.result as any;

			if (resultCode !== 0) {
				throw new Error(message || '授权失败');
			}

			const loginResponse = data as LoginResponse;

			this.currentUser = loginResponse.user;
			this.token = loginResponse.token;
			this.saveToStorage();

			return this.currentUser;
		} catch (error) {
			throw error;
		}
	}

	async logout() {
		this.currentUser = null;
		this.token = null;
		this.saveToStorage();

		wx.reLaunch({
			url: '/pages/login/login'
		});
	}

	async refreshUserInfo(): Promise<UserRecord> {
		if (!this.currentUser) {
			throw new Error('用户未登录');
		}

		const res = await wx.cloud.callFunction({
			name: 'login',
			data: { action: 'refresh' }
		});

		if (!res.result || typeof res.result !== 'object') {
			throw new Error('刷新用户信息响应格式错误');
		}

		const { code: resultCode, data, message } = res.result as any;

		if (resultCode !== 0) {
			throw new Error(message || '刷新用户信息失败');
		}

		const loginResponse = data as LoginResponse;

		this.currentUser = loginResponse.user;
		this.saveToStorage();

		return this.currentUser;
	}

	async updateStaffId(staffId: string): Promise<void> {
		if (!this.currentUser) {
			throw new Error('用户未登录');
		}

		const res = await wx.cloud.callFunction({
			name: 'login',
			data: { action: 'updateStaffId', staffId }
		});

		if (!res.result || typeof res.result !== 'object') {
			throw new Error('更新staffId响应格式错误');
		}

		const { code: resultCode, data, message } = res.result as any;

		if (resultCode !== 0) {
			throw new Error(message || '更新staffId失败');
		}

		const loginResponse = data as LoginResponse;

		this.currentUser = loginResponse.user;
		this.saveToStorage();
	}
}

export const authManager = AuthManager.getInstance();

export const checkLogin = async (): Promise<boolean> => {
	const user = await authManager.silentLogin();
	if (!user) {
		wx.reLaunch({
			url: '/pages/login/login'
		});
		return false;
	}
	return true;
};

export const requireLogin = async (action?: string): Promise<UserRecord> => {
	const user = await authManager.silentLogin();
	if (!user) {
		wx.reLaunch({
			url: '/pages/login/login'
		});
		throw new Error('用户未登录');
	}
	return user;
};
