import {MASSAGE_STRENGTHS} from '../../utils/constants';

Component({
	properties: {
		selectedStrength: {
			type: String,
			value: ''
		}
	},
	data: {
		strengths: MASSAGE_STRENGTHS
	},
	methods: {
		onStrengthTap(e: any) {
			const strength = e.currentTarget.dataset.strength;
			this.triggerEvent('change', {strength});
		}
	}
});