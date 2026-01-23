// cashier.ts
import {db, Collections} from '../../utils/db';
import {parseProjectDuration} from '../../utils/util';

const FIXED_ROOMS = ['西西里', '巴厘', '大溪地', '苏梅', '帕劳', '法罗'];
const PROJECTS = [
	'60min指压', '70min精油', '90min精油', '90min七脉轮彩石',
	'90min深海热贝', '80min推拿+精油', '45min腰臀',
	'120min精油', '120min七脉轮彩石', '120min深海热贝'
];

interface RotationItem {
	id: string;
	name: string;
	shift: ShiftType;
	shiftLabel: string;
}

interface TimelineBlock {
	customerName: string;
	startTime: string;
	endTime: string;
	project: string;
	room: string;
	left: string; // 距离左侧百分比
	width: string; // 宽度百分比
	isReservation?: boolean;
}

interface StaffTimeline {
	id: string;
	name: string;
	shift: ShiftType;
	blocks: TimelineBlock[];
}

interface ReserveForm {
	date: string;
	customerName: string;
	gender: 'male' | 'female';
	project: string;
	phone: string;
	technicianId: string;
	technicianName: string;
	startTime: string;
}

interface StaffAvailability {
	id: string;
	name: string;
	isOccupied: boolean;
}

Component({
	data: {
		selectedDate: '',
		rooms: [] as any[],
		rotationList: [] as RotationItem[],
		staffTimeline: [] as StaffTimeline[],
		timeLabels: ['12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'],
		// 预约弹窗相关
		showReserveModal: false,
		projects: PROJECTS,
		staffNames: [] as string[],
		activeStaffList: [] as StaffInfo[],
		staffAvailability: [] as StaffAvailability[],
		reserveForm: {
			date: '',
			customerName: '',
			gender: 'male' as const,
			project: '',
			phone: '',
			technicianId: '',
			technicianName: '',
			startTime: '',
		},
	},

	lifetimes: {
		attached() {
			const today = this.getTodayStr();
			this.setData({selectedDate: today});
			this.loadData();
		}
	},

	pageLifetimes: {
		show() {
			this.loadData();
		}
	},

	methods: {
		onDateChange(e: any) {
			this.setData({selectedDate: e.detail.value});
			this.loadData();
		},

		// 加载数据
		loadData() {
			const today = this.data.selectedDate || this.getTodayStr();

			// 1. 获取房间状态
			const history = (wx.getStorageSync('consultationHistory') as any) || {};
			const todayRecords = (history[today] || []) as ConsultationRecord[];
			const activeRecords = todayRecords.filter(r => !r.isVoided);

			// 获取预约记录
			const reservations = db.find<ReservationRecord>(Collections.RESERVATIONS, {date: today});

			const rooms = FIXED_ROOMS.map(name => {
				const occupiedRecord = activeRecords
					.filter(r => r.room === name)
					.sort((a, b) => b.endTime.localeCompare(a.endTime))[0];

				const isOccupied = !!occupiedRecord;

				return {
					name,
					isOccupied,
					technician: occupiedRecord?.technician || '',
					endTime: occupiedRecord?.endTime || ''
				};
			});

			// 2. 获取员工轮排与排钟表数据
			const allSchedules = db.getAll<ScheduleRecord>(Collections.SCHEDULE);
			const activeStaff = db.getAll<StaffInfo>(Collections.STAFF).filter(s => s.status === 'active');
			const savedRotation = wx.getStorageSync(`rotation_${ today }`) as string[];

			this.setData({
				activeStaffList: activeStaff,
				staffNames: activeStaff.map(s => s.name)
			});

			// 转换排钟数据
			const staffTimeline: StaffTimeline[] = [];

			let rotationList: RotationItem[] = activeStaff.map(staff => {
				const schedule = allSchedules.find(s => s.date === today && s.staffId === staff.id);
				const shift = schedule ? schedule.shift : 'evening';

				// 过滤出上钟员工
				if (shift === 'morning' || shift === 'evening') {
					// 处理排钟表数据 (合并实际报钟和预约)
					const staffRecords = activeRecords.filter(r => r.technician === staff.name);
					const staffReservations = reservations.filter(r => r.technicianName === staff.name || r.technicianId === staff.id);

					// 合并并处理块
					const blocks: TimelineBlock[] = [
						...staffRecords.map(r => ({...r, isReservation: false})),
						...staffReservations.map(r => ({
							surname: r.customerName,
							gender: r.gender,
							project: r.project,
							room: '预约',
							startTime: r.startTime,
							endTime: r.endTime,
							isReservation: true
						}))
					].map(r => {
						const [startH, startM] = r.startTime.split(':').map(Number);
						const [endH, endM] = r.endTime.split(':').map(Number);

						const startMinutes = (startH - 12) * 60 + startM;
						const duration = (endH - startH) * 60 + (endM - startM);

						return {
							customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
							startTime: r.startTime,
							endTime: r.endTime,
							project: r.project,
							room: r.room,
							left: (startMinutes / 660 * 100) + '%',
							width: (duration / 660 * 100) + '%',
							isReservation: (r as any).isReservation
						};
					});

					staffTimeline.push({
						id: staff.id,
						name: staff.name,
						shift: shift as ShiftType,
						blocks
					});
				}

				return {
					id: staff.id,
					name: staff.name,
					shift: shift as ShiftType,
					shiftLabel: shift === 'morning' ? '早班' : '晚班'
				};
			}).filter(item => item.shift === 'morning' || item.shift === 'evening');

			// 按保存的顺序排序
			if (savedRotation && savedRotation.length > 0) {
				const sortFn = (a: any, b: any) => {
					const idxA = savedRotation.indexOf(a.id);
					const idxB = savedRotation.indexOf(b.id);
					if (idxA === -1) return 1;
					if (idxB === -1) return -1;
					return idxA - idxB;
				};
				rotationList.sort(sortFn);
				staffTimeline.sort(sortFn);
			}

			this.setData({rooms, rotationList, staffTimeline});
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
			const today = this.data.selectedDate || this.getTodayStr();
			wx.setStorageSync(`rotation_${ today }`, list.map(item => item.id));
		},

		// 预约相关
		openReserveModal() {
			const now = new Date();
			// 计算最近的整点或半点
			const minutes = now.getMinutes();
			const roundedMinutes = minutes < 30 ? 30 : 60;
			const startTime = new Date(now);
			if (roundedMinutes === 60) {
				startTime.setHours(now.getHours() + 1);
				startTime.setMinutes(0);
			} else {
				startTime.setMinutes(30);
			}

			const startTimeStr = `${ String(startTime.getHours()).padStart(2, '0') }:${ String(startTime.getMinutes()).padStart(2, '0') }`;

			this.setData({
				showReserveModal: true,
				reserveForm: {
					date: this.data.selectedDate || this.getTodayStr(),
					customerName: '',
					gender: 'male',
					project: '',
					phone: '',
					technicianId: '',
					technicianName: '',
					startTime: startTimeStr,
				}
			}, () => {
				this.checkStaffAvailability();
			});
		},

		// 检查技师在预约时段的可用性
		checkStaffAvailability() {
			const {date, startTime, project} = this.data.reserveForm;
			if (!date || !startTime) return;

			// 计算结束时间 (用于冲突检查)
			const [h, m] = startTime.split(':').map(Number);
			const startTotal = h * 60 + m;
			let duration = 60;
			if (project) {
				duration = parseProjectDuration(project);
				if (duration === 0) duration = 60;
			}
			const endTotal = startTotal + duration + 10;
			const endH = Math.floor(endTotal / 60);
			const endM = endTotal % 60;
			const endTimeStr = `${ String(endH).padStart(2, '0') }:${ String(endM).padStart(2, '0') }`;

			// 获取该日期的所有任务
			const history = (wx.getStorageSync('consultationHistory') as any) || {};
			const activeRecords = (history[date] || []).filter((r: any) => !r.isVoided);
			const reservations = db.find<ReservationRecord>(Collections.RESERVATIONS, {date});

			const allTasks = [...activeRecords, ...reservations];
			const activeStaff = db.getAll<StaffInfo>(Collections.STAFF).filter(s => s.status === 'active');

			const staffAvailability = activeStaff.map(staff => {
				const hasConflict = allTasks.some(r => {
					const rName = (r as any).technician || (r as any).technicianName;
					if (rName !== staff.name) return false;
					return startTime < r.endTime && endTimeStr > r.startTime;
				});

				return {
					id: staff.id,
					name: staff.name,
					isOccupied: hasConflict
				};
			});

			this.setData({staffAvailability});
		},

		closeReserveModal() {
			this.setData({showReserveModal: false});
		},

		stopBubble() { },

		onReserveFieldChange(e: any) {
			const {field} = e.currentTarget.dataset;
			const val = e.detail.value;
			const {reserveForm} = this.data;

			if (field === 'project') {
				reserveForm.project = PROJECTS[val];
				this.setData({reserveForm}, () => this.checkStaffAvailability());
			} else if (field === 'startTime' || field === 'date') {
				reserveForm[field as 'startTime' | 'date'] = val;
				this.setData({reserveForm}, () => this.checkStaffAvailability());
			} else {
				reserveForm[field as keyof ReserveForm] = val;
				this.setData({reserveForm});
			}
		},

		selectReserveTechnician(e: any) {
			const {id, name, occupied} = e.currentTarget.dataset;
			if (occupied) {
				wx.showToast({title: '该技师在此时段已有安排', icon: 'none'});
				return;
			}
			this.setData({
				'reserveForm.technicianId': id,
				'reserveForm.technicianName': name
			});
		},

		setReserveGender(e: any) {
			const {gender} = e.currentTarget.dataset;
			this.setData({'reserveForm.gender': gender});
		},

		confirmReserve() {
			const {reserveForm} = this.data;
			if (!reserveForm.startTime) {
				wx.showToast({title: '开始时间必填', icon: 'none'});
				return;
			}

			// 计算结束时间
			const [h, m] = reserveForm.startTime.split(':').map(Number);
			const startTotal = h * 60 + m;
			let duration = 60; // 默认1小时
			if (reserveForm.project) {
				duration = parseProjectDuration(reserveForm.project);
				if (duration === 0) duration = 60;
			}

			const endTotal = startTotal + duration;
			const endH = Math.floor(endTotal / 60);
			const endM = endTotal % 60;
			const endTime = `${ String(endH).padStart(2, '0') }:${ String(endM).padStart(2, '0') }`;

			const record: Omit<ReservationRecord, 'id' | 'createdAt' | 'updatedAt'> = {
				date: reserveForm.date,
				customerName: reserveForm.customerName || '',
				gender: reserveForm.gender,
				phone: reserveForm.phone,
				project: reserveForm.project || '待定',
				technicianId: reserveForm.technicianId,
				technicianName: reserveForm.technicianName,
				startTime: reserveForm.startTime,
				endTime: endTime
			};

			const success = db.insert<ReservationRecord>(Collections.RESERVATIONS, record);
			if (success) {
				wx.showToast({title: '预约成功', icon: 'success'});
				this.closeReserveModal();
				this.loadData();
			} else {
				wx.showToast({title: '保存失败', icon: 'none'});
			}
		}
	}
});

