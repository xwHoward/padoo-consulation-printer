import {COUPON_PLATFORMS} from '../../utils/constants';

Component({
	properties: {
		selectedPlatform: {
			type: String,
			value: ''
		}
	},

	data: {
		platforms: COUPON_PLATFORMS
	},

	methods: {
		onSelect(e: any) {
			const {id} = e.currentTarget.dataset;
			this.triggerEvent('change', {value: id});
		}
	}
});
