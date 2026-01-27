import {ROOMS} from '../../utils/constants';

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
		rooms: ROOMS
	},
	methods: {
		onRoomTap(e: any) {
			if (this.properties.disabled) return;
			const room = e.currentTarget.dataset.room;
			this.triggerEvent('change', {room});
		}
	}
});