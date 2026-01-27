import {AppConfig} from '../../config/index';

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
		loadRooms() {
			try {
				const app = getApp<IAppOption>();
				let allRooms = [];

				if (AppConfig.useCloudDatabase && app.getRooms) {
					allRooms = app.getRooms();
				} else {
					const {ROOMS} = require('../../utils/constants');
					allRooms = ROOMS;
				}

				const normalRooms = allRooms.filter((r: any) => r.status === 'normal' || !r.status);
				const roomNames = normalRooms.map((r: any) => r.name);
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
