// staff.ts
import {db, Collections, generateId, getTimestamp} from '../../utils/db';

const SHIFT_MAP: Record<string, {label: string; type: ShiftType;}> = {
	'0': {label: '早班', type: 'morning'},
	'1': {label: '晚班', type: 'evening'},
	'2': {label: '休息', type: 'off'},
	'3': {label: '请假', type: 'leave'},
};

const SHIFT_TYPES: ShiftType[] = ['morning', 'evening', 'off', 'leave'];
const SHIFT_NAMES = ['早班', '晚班', '休息', '请假'];

Component({
	data: {
		staffList: [] as StaffInfo[],
		showModal: false,
		editingStaff: null as StaffInfo | null,
		inputName: '',
		inputStatus: 'active' as StaffStatus,
		// 排班相关
		today: '',
		dates: [] as any[],
		scheduleMap: {} as any,
		shiftNames: SHIFT_NAMES,
	},

	lifetimes: {
		attached() {
			this.loadStaffList();
			this.initSchedule();
		},
	},

	pageLifetimes: {
		show() {
			this.loadStaffList();
		},
	},

	methods: {
		// 初始化排班表
		initSchedule() {
			const now = new Date();
			const todayStr = this.formatDate(now);
			const dates = this.generateDateRange(now);

			// 获取正常状态的员工
			const staffList = db.find<StaffInfo>(Collections.STAFF, {status: 'active'});

			// 获取时间范围内的排班记录
			const startDate = dates[0].date;
			const endDate = dates[dates.length - 1].date;
			const allSchedules = db.find<ScheduleRecord>(Collections.SCHEDULE, (item) => {
				return item.date >= startDate && item.date <= endDate;
			});

			// 构造渲染用的 Map
			const scheduleMap: any = {};
			staffList.forEach((staff) => {
				scheduleMap[staff.id] = {};
				dates.forEach((d) => {
					// 查找是否存在排班
					const record = allSchedules.find((s) => s.staffId === staff.id && s.date === d.date);
					if (record) {
						const index = SHIFT_TYPES.indexOf(record.shift);
						scheduleMap[staff.id][d.date] = {
							label: SHIFT_NAMES[index],
							type: record.shift,
							index: index,
						};
					} else {
						// 默认晚班
						scheduleMap[staff.id][d.date] = {
							label: '晚班',
							type: 'evening',
							index: 1,
						};
					}
				});
			});

			this.setData({
				today: todayStr,
				dates,
				scheduleMap,
			});
		},

		// 生成前后7天的日期
		generateDateRange(centerDate: Date) {
			const dates = [];
			const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
			const todayStr = this.formatDate(new Date());

			for (let i = -7; i <= 7; i++) {
				const d = new Date(centerDate);
				d.setDate(centerDate.getDate() + i);
				const dateStr = this.formatDate(d);
				dates.push({
					date: dateStr,
					dayNum: d.getDate(),
					weekDay: weekDays[d.getDay()],
					isToday: dateStr === todayStr,
				});
			}
			return dates;
		},

		formatDate(date: Date) {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			return `${ year }-${ month }-${ day }`;
		},

		// 排班变更
		onShiftChange(e: any) {
			const {staffId, date} = e.currentTarget.dataset;
			const index = parseInt(e.detail.value);
			const shiftType = SHIFT_TYPES[index];

			// 查找现有记录
			const existing = db.findOne<ScheduleRecord>(Collections.SCHEDULE, {staffId, date});

			if (existing) {
				db.updateById<ScheduleRecord>(Collections.SCHEDULE, existing.id, {shift: shiftType});
			} else {
				db.insert<ScheduleRecord>(Collections.SCHEDULE, {
					date,
					staffId,
					shift: shiftType,
				} as any);
			}

			// 更新界面
			const scheduleMap = this.data.scheduleMap;
			scheduleMap[staffId][date] = {
				label: SHIFT_NAMES[index],
				type: shiftType,
				index: index,
			};

			this.setData({scheduleMap});

			wx.showToast({
				title: '已更新',
				icon: 'none',
			});
		},

		// 加载员工列表
		loadStaffList() {
			const staffList = db.getAll<StaffInfo>(Collections.STAFF);
			// 按创建时间倒序排列
			staffList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
			this.setData({staffList});
		},

		// 添加员工
		onAddStaff() {
			this.setData({
				showModal: true,
				editingStaff: null,
				inputName: '',
				inputStatus: 'active',
			});
		},

		// 编辑员工
		onEditStaff(e: WechatMiniprogram.TouchEvent) {
			const id = e.currentTarget.dataset.id as string;
			const staff = db.findById<StaffInfo>(Collections.STAFF, id);

			if (staff) {
				this.setData({
					showModal: true,
					editingStaff: staff,
					inputName: staff.name,
					inputStatus: staff.status,
				});
			}
		},

		// 切换员工状态
		onToggleStatus(e: WechatMiniprogram.TouchEvent) {
			const id = e.currentTarget.dataset.id as string;
			const staff = db.findById<StaffInfo>(Collections.STAFF, id);

			if (staff) {
				const newStatus: StaffStatus = staff.status === 'active' ? 'disabled' : 'active';
				db.updateById<StaffInfo>(Collections.STAFF, id, {status: newStatus});
				this.loadStaffList();

				wx.showToast({
					title: newStatus === 'active' ? '已启用' : '已禁用',
					icon: 'success',
				});
			}
		},

		// 删除员工
		onDeleteStaff(e: WechatMiniprogram.TouchEvent) {
			const id = e.currentTarget.dataset.id as string;
			const staff = db.findById<StaffInfo>(Collections.STAFF, id);

			if (!staff) return;

			wx.showModal({
				title: '确认删除',
				content: `确定要删除员工"${ staff.name }"吗？`,
				confirmColor: '#ff4d4f',
				success: (res) => {
					if (res.confirm) {
						db.deleteById<StaffInfo>(Collections.STAFF, id);
						this.loadStaffList();
						wx.showToast({title: '已删除', icon: 'success'});
					}
				},
			});
		},

		// 姓名输入
		onNameInput(e: WechatMiniprogram.Input) {
			this.setData({inputName: e.detail.value});
		},

		// 状态选择
		onStatusSelect(e: WechatMiniprogram.TouchEvent) {
			const status = e.currentTarget.dataset.status as StaffStatus;
			this.setData({inputStatus: status});
		},

		// 关闭弹窗
		onCloseModal() {
			this.setData({
				showModal: false,
				editingStaff: null,
				inputName: '',
				inputStatus: 'active',
			});
		},

		// 确认弹窗
		onConfirmModal() {
			const {inputName, inputStatus, editingStaff} = this.data;
			const name = inputName.trim();

			if (!name) {
				wx.showToast({title: '请输入员工姓名', icon: 'none'});
				return;
			}

			if (editingStaff) {
				// 编辑模式
				db.updateById<StaffInfo>(Collections.STAFF, editingStaff.id, {
					name,
					status: inputStatus,
				});
				wx.showToast({title: '修改成功', icon: 'success'});
			} else {
				// 添加模式 - 检查重名
				const exists = db.exists<StaffInfo>(Collections.STAFF, {name});
				if (exists) {
					wx.showToast({title: '员工姓名已存在', icon: 'none'});
					return;
				}

				const now = getTimestamp();
				const newStaff: StaffInfo = {
					id: generateId(),
					name,
					status: 'active',
					createdAt: now,
					updatedAt: now,
				};

				// 直接保存到存储
				const staffList = db.getAll<StaffInfo>(Collections.STAFF);
				staffList.push(newStaff);
				wx.setStorageSync('db_staff', staffList);

				wx.showToast({title: '添加成功', icon: 'success'});
			}

			this.onCloseModal();
			this.loadStaffList();
		},
	},
});
