import {cloudDb} from './utils/cloud-db';
import {Collections} from './utils/db';
import {AppConfig} from './config/index';

App<IAppOption<AppGlobalData>>({
	globalData: {
		projects: [],
		rooms: [],
		essentialOils: [],
		isDataLoaded: false,
		loadPromise: null as Promise<void> | null
	},
	 onLaunch() {
		this.loadGlobalData();
	},

	async loadGlobalData() {
		if (this.globalData.loadPromise) {
			return this.globalData.loadPromise;
		}

		this.globalData.loadPromise = (async () => {
			try {
				const database = cloudDb;
				const [projects, rooms, essentialOils] = await Promise.all([
					database.getAll<Project>(Collections.PROJECTS),
					database.getAll<Room>(Collections.ROOMS),
					database.getAll<EssentialOil>(Collections.ESSENTIAL_OILS)
				]);
				this.globalData.projects = (projects || []) as Project[];
				this.globalData.rooms = (rooms || []) as Room[];
				this.globalData.essentialOils = (essentialOils || []) as EssentialOil[];
				this.globalData.isDataLoaded = true;
			} catch (error) {
				console.error('加载全局数据失败:', error);
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
	}
});
