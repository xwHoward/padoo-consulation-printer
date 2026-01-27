Component({
	properties: {
		selectedParts: {
			type: Object,
			value: {}
		}
	},
	data: {
		parts: [
			{id: 'head', name: '头部'},
			{id: 'neck', name: '颈部'},
			{id: 'shoulder', name: '肩部'},
			{id: 'back', name: '后背'},
			{id: 'arm', name: '手臂'},
			{id: 'abdomen', name: '腹部'},
			{id: 'waist', name: '腰部'},
			{id: 'thigh', name: '大腿'},
			{id: 'calf', name: '小腿'}
		]
	},
	methods: {
		onPartTap(e: any) {
			const part = e.currentTarget.dataset.part;
			this.triggerEvent('change', {part});
		}
	}
});