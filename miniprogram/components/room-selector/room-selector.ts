import {cloudDb} from '../../utils/cloud-db';
import {Collections} from '../../utils/db';

type ItemStatus = 'normal' | 'disabled';

interface Room {
	id: string;
	name: string;
	status: ItemStatus;
	createdAt?: string;
	updatedAt?: string;
}

Component({
	properties: {
		selectedRoom: {
			type: String,
			value: ''
		},
		disabled: {
			type: Boolean,
			value: false
		}
	},
	data: {
		rooms: [] as string[]
	},

	methods: {
		async loadRooms() {
			try {
				const database = cloudDb;
				const allRooms = await database.getAll<Room>(Collections.ROOMS);
				const normalRooms = allRooms.filter(r => r.status === 'normal' || !r.status);
				const roomNames = normalRooms.map(r => r.name);
				this.setData({rooms: roomNames});
			} catch (error) {
				console.error('加载房间失败:', error);
				this.setData({rooms: []});
			}
		},

		onRoomTap(e: any) {
			if (this.properties.disabled) return;
			const room = e.currentTarget.dataset.room;
			this.triggerEvent('change', {room});
		}
	},

	lifetimes: {
		attached() {
			this.loadRooms();
		}
	}
});
