import {GENDERS} from '../../utils/constants';

Component({
	properties: {
		selectedGender: {
			type: String,
			value: ''
		}
	},

	data: {
		genders: GENDERS
	},

	methods: {
		onSelect(e: WechatMiniprogram.CustomEvent) {
			const {id} = e.currentTarget.dataset;
			this.triggerEvent('change', {value: id});
		}
	}
});
