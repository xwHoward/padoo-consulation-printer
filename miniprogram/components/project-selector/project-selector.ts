import {AppConfig} from '../../config/index';

Component({
	properties: {
		selectedProject: {
			type: String,
			value: ''
		}
	},
	data: {
		projects: [] as string[]
	},

	methods: {
		loadProjects() {
			try {
				const app = getApp<IAppOption>();
				let allProjects = [];

				if (AppConfig.useCloudDatabase && app.getProjects) {
					allProjects = app.getProjects();
				} else {
					const {PROJECTS} = require('../../utils/constants');
					allProjects = PROJECTS;
				}

				const normalProjects = allProjects.filter((p: any) => p.status === 'normal' || !p.status);
				const projectNames = normalProjects.map((p: any) => p.name);
				this.setData({projects: projectNames});
			} catch (error) {
				console.error('加载项目失败:', error);
				this.setData({projects: []});
			}
		},

		onProjectTap(e: any) {
			const project = e.currentTarget.dataset.project;
			this.triggerEvent('change', {project});
		}
	},

	lifetimes: {
		attached() {
			this.loadProjects();
		}
	}
});
