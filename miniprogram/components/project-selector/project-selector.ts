
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
		async loadProjects() {
			try {
				const app = getApp<IAppOption>();
				const allProjects = await app.getProjects();
				const normalProjects = allProjects.filter((p) => p.status === 'normal' || !p.status);
				const projectNames = normalProjects.map((p) => p.name);
				this.setData({projects: projectNames});
			} catch (error) {
				console.error('加载项目失败:', error);
				this.setData({projects: []});
			}
		},

		onProjectTap(e: WechatMiniprogram.CustomEvent) {
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
