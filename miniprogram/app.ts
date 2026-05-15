import { authManager } from './utils/auth';
import { cloudDb, Collections } from './utils/cloud-db';

App<IAppOption<AppGlobalData>>({
	globalData: {
		projects: [],
		rooms: [],
		essentialOils: [],
		staffs: [],
		isDataLoaded: false,
		loadPromise: null as Promise<void> | null
	},
	onLaunch() {
		this.checkUpdate();
		this.initLogin();
		this.loadGlobalData();
	},

	async initLogin() {
		try {
			const user = await authManager.silentLogin();
			this.globalData.currentUser = user;
			this.globalData.token = authManager.getToken();
		} catch (error) {
			// 静默登录失败是预期情况（未登录状态），记录日志供调试
			console.debug('[App] 静默登录失败:', error instanceof Error ? error.message : error);
		}
	},

	onShow() {
		const pages = getCurrentPages();
		const currentPage = pages[pages.length - 1];
		if (currentPage?.route !== 'pages/login/login') {
			const user = authManager.getCurrentUser();
			if (!user) {
				wx.reLaunch({
					url: '/pages/login/login'
				});
			}
		}
	},

	/**
	 * 检测小程序版本更新
	 */
	checkUpdate() {
		if (!wx.getUpdateManager) {
			return;
		}

		const updateManager = wx.getUpdateManager();

		updateManager.onCheckForUpdate((res) => {
			if (res.hasUpdate) {
				console.log('检测到新版本');
			}
		});

		updateManager.onUpdateReady(() => {
			wx.showModal({
				title: '更新提示',
				content: '新版本已准备好，是否重启应用？',
				showCancel: true,
				confirmText: '立即重启',
				cancelText: '稍后再说',
				success: (res) => {
					if (res.confirm) {
						updateManager.applyUpdate();
					}
				}
			});
		});

		updateManager.onUpdateFailed(() => {
			wx.showModal({
				title: '更新提示',
				content: '新版本下载失败，请删除当前小程序后重新搜索打开',
				showCancel: false,
				confirmText: '知道了'
			});
		});
	},

	async loadGlobalData() {
		if (this.globalData.loadPromise) {
			return this.globalData.loadPromise;
		}

		this.globalData.loadPromise = (async () => {
			try {
				const database = cloudDb;
				const [projects, rooms, essentialOils, staff] = await Promise.all([
					database.getAll<Project>(Collections.PROJECTS),
					database.getAll<Room>(Collections.ROOMS),
					database.getAll<EssentialOil>(Collections.ESSENTIAL_OILS),
					database.getAll<StaffInfo>(Collections.STAFF)
				]);
				this.globalData.projects = (projects || []) as Project[];
				this.globalData.rooms = (rooms || []) as Room[];
				this.globalData.essentialOils = (essentialOils || []) as EssentialOil[];
				this.globalData.staffs = (staff || []) as StaffInfo[];
				this.globalData.isDataLoaded = true;
			} catch (error) {
				// 全局数据加载失败，记录错误供调试
				console.error('[App] 加载全局数据失败:', error instanceof Error ? error.message : error);
			} finally {
				this.globalData.loadPromise = null;
			}
		})();

		return this.globalData.loadPromise;
	},

	async getProjects(): Promise<Project[]> {
		if (!this.globalData.isDataLoaded) {
			await this.loadGlobalData();
		}
		return this.globalData.projects;
	},

	async getRooms(): Promise<Room[]> {
		if (!this.globalData.isDataLoaded) {
			await this.loadGlobalData();
		}
		return this.globalData.rooms;
	},

	async getEssentialOils(): Promise<EssentialOil[]> {
		if (!this.globalData.isDataLoaded) {
			await this.loadGlobalData();
		}
		return this.globalData.essentialOils;
	},

	async getStaffs(forceReload: boolean = false): Promise<StaffInfo[]> {
		if (forceReload || !this.globalData.isDataLoaded) {
			await this.loadGlobalData();
		}
		return this.globalData.staffs;
	},

	async getStaff(id: string): Promise<StaffInfo | null> {
		if (!this.globalData.isDataLoaded) {
			await this.loadGlobalData();
		}
		return this.globalData.staffs.find(s => s._id === id) || null;
	},

	async getActiveStaffs(): Promise<StaffInfo[]> {
		if (!this.globalData.isDataLoaded) {
			await this.loadGlobalData();
		}
		return this.globalData.staffs.filter(s => s.status === 'active');
	},

	async getRotationQueue(date: string) {
		try {
			const result = await wx.cloud.callFunction({
				name: 'manageRotation',
				data: {
					action: 'getQueue',
					date: date
				}
			});

			if (result.result && typeof result.result === 'object') {
				const rotationData = result.result.data;
				return rotationData as RotationQueue;
			}
			return null;
		} catch (error) {
			console.error('[App] getRotationQueue 失败:', error);
			return null;
		}
	},

	async getNextTechnician(date: string) {
		try {
			const result = await wx.cloud.callFunction({
				name: 'manageRotation',
				data: {
					action: 'getNext',
					date: date
				}
			});

			if (result.result && typeof result.result === 'object') {
				return result.result.data;
			}
			return null;
		} catch (error) {
			console.error('[App] getNextTechnician 失败:', error);
			return null;
		}
	},

	async serveCustomer(date: string, staffId: string, isClockIn: boolean) {
		try {
			const result = await wx.cloud.callFunction({
				name: 'manageRotation',
				data: {
					action: 'serveCustomer',
					date: date,
					staffId: staffId,
					isClockIn: isClockIn
				}
			});

			if (result.result && typeof result.result === 'object') {
				return result.result.data;
			}
			return null;
		} catch (error) {
			console.error('[App] serveCustomer 失败:', error);
			return null;
		}
	},

	async adjustRotationPosition(date: string, fromIndex: number, toIndex: number) {
		try {
			const result = await wx.cloud.callFunction({
				name: 'manageRotation',
				data: {
					action: 'adjustPosition',
					date: date,
					fromIndex: fromIndex,
					toIndex: toIndex
				}
			});

			if (result.result && typeof result.result === 'object') {
				return result.result.data;
			}
			return null;
		} catch (error) {
			console.error('[App] adjustRotationPosition 失败:', error);
			return null;
		}
	}
});
