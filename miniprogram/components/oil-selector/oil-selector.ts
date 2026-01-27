import {ESSENTIAL_OILS} from '../../utils/constants';

Component({
	properties: {
		selectedOil: {
			type: String,
			value: ''
		}
	},
	data: {
		oils: ESSENTIAL_OILS
	},
	methods: {
		onOilTap(e: any) {
			const oil = e.currentTarget.dataset.oil;
			this.triggerEvent('change', {oil});
		}
	}
});