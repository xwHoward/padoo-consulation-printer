Component({
	properties: {
		selectedTechnician: {
			type: String,
			value: ''
		},
		selectedIds: {
			type: Array,
			value: []
		},
		technicianList: {
			type: Array,
			value: []
		},
		multi: {
			type: Boolean,
			value: false
		}
	},
	methods: {
		onTechnicianTap(e: WechatMiniprogram.CustomEvent) {
			const {technician, id, occupied, reason} = e.currentTarget.dataset;
			this.triggerEvent('change', {technician, id, occupied, reason});
		}
	}
});