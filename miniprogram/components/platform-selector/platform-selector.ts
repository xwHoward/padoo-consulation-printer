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
		onSelect(e: WechatMiniprogram.CustomEvent) {
			const {id} = e.currentTarget.dataset;
			this.triggerEvent('change', {value: id});
		}
	}
});
