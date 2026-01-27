import {cloudDb} from './utils/cloud-db';
import {Collections} from './utils/db';
import {AppConfig} from './config/index';

App<IAppOption<AppGlobalData>>({
	globalData: {
		projects: [],
		rooms: [],
		essentialOils: [],
		isDataLoaded: false
	},
	async onLaunch() {
		try {
			await this.loadGlobalData();
		} catch (error) {
			console.error('加载全局数据失败:', error);
		}
	},

	async loadGlobalData() {
		if (this.globalData.isDataLoaded) {
			return;
		}

		try {
			if (AppConfig.useCloudDatabase) {
				const database = cloudDb;
				const [projects, rooms, essentialOils] = await Promise.all([
					database.getAll(Collections.PROJECTS),
					database.getAll(Collections.ROOMS),
					database.getAll(Collections.ESSENTIAL_OILS)
				]);

				this.globalData.projects = (projects || []) as AppProject[];
				this.globalData.rooms = (rooms || []) as AppRoom[];
				this.globalData.essentialOils = (essentialOils || []) as AppEssentialOil[];
			} else {
				const {PROJECTS, ROOMS, ESSENTIAL_OILS} = require('./utils/constants');
				this.globalData.projects = PROJECTS as AppProject[];
				this.globalData.rooms = ROOMS as AppRoom[];
				this.globalData.essentialOils = ESSENTIAL_OILS as AppEssentialOil[];
			}
			this.globalData.isDataLoaded = true;
		} catch (error) {
			console.error('加载全局数据失败:', error);
		}
	},

	getProjects() {
		return this.globalData.projects;
	},

	getRooms() {
		return this.globalData.rooms;
	},

	getEssentialOils() {
		return this.globalData.essentialOils;
	}
});
