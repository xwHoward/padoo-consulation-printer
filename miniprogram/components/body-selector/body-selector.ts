Component({
	properties: {
		selectedParts: {
			type: Object,
			value: {}
		}
	},
	data: {
		parts: [
			{ _id: 'head', name: '头部' },
			{ _id: 'neck', name: '颈部' },
			{ _id: 'shoulder', name: '肩部' },
			{ _id: 'back', name: '后背' },
			{ _id: 'arm', name: '手臂' },
			{ _id: 'abdomen', name: '腹部' },
			{ _id: 'waist', name: '腰部' },
			{ _id: 'thigh', name: '大腿' },
			{ _id: 'calf', name: '小腿' }
		]
	},
	methods: {
		onPartTap(e: WechatMiniprogram.CustomEvent) {
			const part = e.currentTarget.dataset.part;
			this.triggerEvent('change', { part });
		}
	}
});