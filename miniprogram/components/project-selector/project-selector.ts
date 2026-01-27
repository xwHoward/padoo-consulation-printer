import {PROJECTS} from '../../utils/constants';

Component({
	properties: {
		selectedProject: {
			type: String,
			value: ''
		}
	},
	data: {
		projects: PROJECTS
	},
	methods: {
		onProjectTap(e: any) {
			const project = e.currentTarget.dataset.project;
			this.triggerEvent('change', {project});
		}
	}
});