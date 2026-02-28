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
		this.initLogin();
		this.loadGlobalData();
	},

	async initLogin() {
		try {
			const user = await authManager.silentLogin();
			this.globalData.currentUser = user;
			this.globalData.token = authManager.getToken();
		} catch (error) {
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
			return null;
		}
	}
});
