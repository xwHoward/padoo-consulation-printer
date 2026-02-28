

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
				const app = getApp<IAppOption>();
				const allRooms = await app.getRooms();
				const normalRooms = allRooms.filter((r: any) => r.status === 'normal' || !r.status);
				const roomNames = normalRooms.map((r: any) => r.name);
				this.setData({ rooms: roomNames });
			} catch (error) {
				this.setData({ rooms: [] });
			}
		},

		onRoomTap(e: WechatMiniprogram.CustomEvent) {
			if (this.properties.disabled) return;
			const room = e.currentTarget.dataset.room;
			this.triggerEvent('change', { room });
		}
	},

	lifetimes: {
		attached() {
			this.loadRooms();
		}
	}
});
