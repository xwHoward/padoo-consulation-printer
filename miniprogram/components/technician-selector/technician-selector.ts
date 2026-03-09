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
		},
		showClockInBadge: {
			type: Boolean,
			value: false
		}
	},
	methods: {
		onTechnicianTap(e: WechatMiniprogram.CustomEvent) {
			const { technician, id, occupied, reason, phone, isClockIn, hasNonClockInConflict } = e.currentTarget.dataset;
			this.triggerEvent('change', { technician, _id: id, occupied, reason, phone, isClockIn, hasNonClockInConflict });
		},

		toggleClockIn(e: WechatMiniprogram.CustomEvent) {
			const { id, isClockIn } = e.currentTarget.dataset;
			this.triggerEvent('toggleClockIn', { _id: id, isClockIn: !isClockIn });
		}
	}
});