
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
				const allOils = await app.getEssentialOils();
				const normalOils = allOils.filter((o) => o.status === 'normal' || !o.status);
				this.setData({ oils: normalOils });
			} catch (error) {
				console.error('加载精油失败:', error);
				this.setData({ oils: [] });
			}
		},

		onOilTap(e: WechatMiniprogram.CustomEvent) {
			const oil = e.currentTarget.dataset.oil;
			this.triggerEvent('change', { oil });
		}
	},

	lifetimes: {
		attached() {
			this.loadOils();
		}
	}
});
