import {AppConfig} from '../../config/index';

Component({
	properties: {
		selectedOil: {
			type: String,
			value: ''
		}
	},
	data: {
		oils: [] as EssentialOil[]
	},

	methods: {
		async loadOils() {
			try {
				const app = getApp<IAppOption>();
				let allOils = [];

				if (AppConfig.useCloudDatabase && app.getEssentialOils) {
					allOils = await app.getEssentialOils();
				} else {
					const {ESSENTIAL_OILS} = require('../../utils/constants');
					allOils = ESSENTIAL_OILS;
				}

				const normalOils = allOils.filter((o: any) => o.status === 'normal' || !o.status);
				this.setData({oils: normalOils});
			} catch (error) {
				console.error('加载精油失败:', error);
				this.setData({oils: []});
			}
		},

		onOilTap(e: any) {
			const oil = e.currentTarget.dataset.oil;
			this.triggerEvent('change', {oil});
		}
	},

	lifetimes: {
		async attached() {
			await this.loadOils();
		}
	}
});
