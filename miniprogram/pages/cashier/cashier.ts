// cashier.ts
import {db, Collections} from '../../utils/db';

const FIXED_ROOMS = ['西西里', '巴厘', '大溪地', '苏梅', '帕劳', '法罗'];

interface RotationItem {
	id: string;
	name: string;
	shift: ShiftType;
	shiftLabel: string;
}

Component({
	data: {
		rooms: [] as any[],
		rotationList: [] as RotationItem[],
	},

	lifetimes: {
		attached() {
			this.loadData();
		}
	},

	pageLifetimes: {
		show() {
			this.loadData();
		}
	},

	methods: {
		// 加载数据
		loadData() {
			const today = this.getTodayStr();

			// 1. 获取房间状态
			// 获取今日所有单据（排除已作废）
			const history = (wx.getStorageSync('consultationHistory') as any) || {};
			const todayRecords = (history[today] || []) as ConsultationRecord[];
			const activeRecords = todayRecords.filter(r => !r.isVoided);

			const rooms = FIXED_ROOMS.map(name => {
				// 查找占用该房间的最晚结束的单据
				const occupiedRecord = activeRecords
					.filter(r => r.room === name)
					.sort((a, b) => b.endTime.localeCompare(a.endTime))[0];

				// 简单逻辑：如果有一个结束时间在当前时间之后，或者还没过多久，就认为占用
				// 这里为了演示，只要今天在该房间有单据，就显示最后一条的信息，实际上可能需要比较当前时间
				const isOccupied = !!occupiedRecord;

				return {
					name,
					isOccupied,
					technician: occupiedRecord?.technician || '',
					endTime: occupiedRecord?.endTime || ''
				};
			});

			// 2. 获取员工轮排
			// 获取今日排班
			const allSchedules = db.getAll<ScheduleRecord>(Collections.SCHEDULE);

			// 获取所有正常状态的员工
			const activeStaff = db.getAll<StaffInfo>(Collections.STAFF).filter(s => s.status === 'active');

			// 获取保存的轮排顺序
			const savedRotation = wx.getStorageSync(`rotation_${ today }`) as string[]; // 存储 staffId 的数组

			let rotationList: RotationItem[] = activeStaff.map(staff => {
				const schedule = allSchedules.find(s => s.date === today && s.staffId === staff.id);

				// 无指定班次，默认为晚班
				const shift = schedule ? schedule.shift : 'evening';

				return {
					id: staff.id,
					name: staff.name,
					shift: shift as ShiftType,
					shiftLabel: shift === 'morning' ? '早班' : '晚班'
				};
			}).filter(item => item.shift === 'morning' || item.shift === 'evening');

			// 按保存的顺序排序
			if (savedRotation && savedRotation.length > 0) {
				rotationList.sort((a, b) => {
					const idxA = savedRotation.indexOf(a.id);
					const idxB = savedRotation.indexOf(b.id);
					if (idxA === -1) return 1;
					if (idxB === -1) return -1;
					return idxA - idxB;
				});
			}

			this.setData({rooms, rotationList});
		},

		getTodayStr() {
			const now = new Date();
			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			return `${ year }-${ month }-${ day }`;
		},

		// 调整轮排顺序
		moveRotation(e: WechatMiniprogram.TouchEvent) {
			const {index, direction} = e.currentTarget.dataset;
			const list = [...this.data.rotationList];

			if (direction === 'up' && index > 0) {
				[list[index - 1], list[index]] = [list[index], list[index - 1]];
			} else if (direction === 'down' && index < list.length - 1) {
				[list[index + 1], list[index]] = [list[index], list[index + 1]];
			} else {
				return;
			}

			this.setData({rotationList: list});

			// 持久化顺序
			const today = this.getTodayStr();
			wx.setStorageSync(`rotation_${ today }`, list.map(item => item.id));
		}
	}
});

