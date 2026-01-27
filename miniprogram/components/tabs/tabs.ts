Component({
	properties: {
		activeTab: {
			type: String,
			value: ''
		},
		tabs: {
			type: Array,
			value: []
		}
	},

	methods: {
		onTabChange(e: any) {
			const tab = e.currentTarget.dataset.tab;
			this.triggerEvent('change', {value: tab});
		}
	}
});
