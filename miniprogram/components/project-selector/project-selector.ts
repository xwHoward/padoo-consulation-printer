
Component({
	properties: {
		selectedProject: {
			type: String,
			value: ''
		},
		selectedProjects: {
			type: Array,
			value: [] as string[]
		},
		multi: {
			type: Boolean,
			value: false
		}
	},
	data: {
		projects: [] as string[],
		selectedMap: {} as Record<string, boolean>
	},

	observers: {
		'selectedProjects'(list: string[]) {
			const map: Record<string, boolean> = {};
			(list || []).forEach(p => { map[p] = true; });
			this.setData({ selectedMap: map });
		}
	},

	methods: {
		async loadProjects() {
			try {
				const app = getApp<IAppOption>();
				const allProjects = await app.getProjects();
				const normalProjects = allProjects.filter((p) => p.status === 'normal');
				const projectNames = normalProjects.map((p) => p.name);
				this.setData({projects: projectNames});
			} catch (error) {
				this.setData({projects: []});
			}
		},

		onProjectTap(e: WechatMiniprogram.CustomEvent) {
			const project = e.currentTarget.dataset.project;
			if (this.properties.multi) {
				const selected = [...(this.properties.selectedProjects || [])];
				const index = selected.indexOf(project);
				if (index !== -1) {
					selected.splice(index, 1);
				} else {
					selected.push(project);
				}
				this.triggerEvent('change', {projects: selected});
			} else {
				this.triggerEvent('change', {project});
			}
		}
	},

	lifetimes: {
		attached() {
			this.loadProjects();
		}
	}
});
