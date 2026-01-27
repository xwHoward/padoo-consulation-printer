import {cloudDb} from '../../utils/cloud-db';
import {Collections} from '../../utils/db';

type ItemStatus = 'normal' | 'disabled';

interface EssentialOil {
	id: string;
	name: string;
	effect: string;
	status: ItemStatus;
	createdAt?: string;
	updatedAt?: string;
}

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
				const database = cloudDb;
				const allOils = await database.getAll<EssentialOil>(Collections.ESSENTIAL_OILS);
				const normalOils = allOils.filter(o => o.status === 'normal' || !o.status);
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
		attached() {
			this.loadOils();
		}
	}
});
