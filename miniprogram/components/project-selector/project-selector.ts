import {cloudDb} from '../../utils/cloud-db';
import {Collections} from '../../utils/db';

type ItemStatus = 'normal' | 'disabled';

interface Project {
	id: string;
	name: string;
	duration: number;
	price?: number;
	isEssentialOilOnly?: boolean;
	status: ItemStatus;
	createdAt?: string;
	updatedAt?: string;
}

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
				const database = cloudDb;
				const allProjects = await database.getAll<Project>(Collections.PROJECTS);
				const normalProjects = allProjects.filter(p => p.status === 'normal' || !p.status);
				const projectNames = normalProjects.map(p => p.name);
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
