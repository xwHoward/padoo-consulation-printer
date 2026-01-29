// staff.ts
import { cloudDb as cloudDbService, Collections } from '../../utils/cloud-db';
import { DEFAULT_SHIFT, SHIFT_NAMES, SHIFT_TYPES } from '../../utils/constants';
import { formatDate } from '../../utils/util';

interface DateInfo {
	date: string; dayNum: number; weekDay: string; isToday: boolean;
}

Component({
	data: {
		loading: false,
		staffList: [] as StaffInfo[],
		showModal: false,
		editingStaff: null as StaffInfo | null,
		inputName: '',
		inputStatus: 'active' as StaffStatus,
		// 排班相关
		today: '',
		dates: [] as DateInfo[],
		scheduleMap: {} as Record<string, Record<string, { label: string; type: ShiftType; index: number }>>,
		shiftNames: Object.values(SHIFT_NAMES),
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
			this.initSchedule();
		},
	},

	methods: {
		// 获取数据库实例
		getDb() {
			return cloudDbService;
		},

		// 初始化排班表
		async initSchedule() {
			try {
				const database = this.getDb();
				const now = new Date();
				const todayStr = formatDate(now);
				const dates = this.generateDateRange(now);

				this.setData({ loading: true });

				const staffList = await (database.find<StaffInfo>(Collections.STAFF, { status: 'active' }));

				const startDate = dates[0].date;
				const endDate = dates[dates.length - 1].date;
				const allSchedules = await (database.find<ScheduleRecord>(Collections.SCHEDULE, (item) => {
					return item.date >= startDate && item.date <= endDate;
				}));

				// 构造渲染用的 Map
				const scheduleMap: Record<string, Record<string, { label: string; type: ShiftType; index: number }>> = {};
				staffList.forEach((staff) => {
					scheduleMap[staff.id] = {};
					dates.forEach((d) => {
						// 查找是否存在排班
						const record = allSchedules.find((s) => s.staffId === staff.id && s.date === d.date);
						if (record) {
							const index = SHIFT_TYPES.indexOf(record.shift);
							scheduleMap[staff.id][d.date] = {
								label: SHIFT_NAMES[record.shift],
								type: record.shift,
								index: index,
							};
						} else {
							// 使用系统默认班次
							const index = SHIFT_TYPES.indexOf(DEFAULT_SHIFT);
							scheduleMap[staff.id][d.date] = {
								label: SHIFT_NAMES[DEFAULT_SHIFT],
								type: DEFAULT_SHIFT,
								index: index,
							};
						}
					});
				});

				this.setData({
					today: todayStr,
					dates,
					scheduleMap,
					loading: false
				});
			} catch (error) {
				this.setData({ loading: false });
				wx.showToast({
					title: '排班表加载失败',
					icon: 'none'
				});
			}
		},

		// 生成前后7天的日期
		generateDateRange(centerDate: Date) {
			const dates = [];
			const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
			const todayStr = formatDate(new Date());

			for (let i = -7; i <= 7; i++) {
				const d = new Date(centerDate);
				d.setDate(centerDate.getDate() + i);
				const dateStr = formatDate(d);
				dates.push({
					date: dateStr,
					dayNum: d.getDate(),
					weekDay: weekDays[d.getDay()],
					isToday: dateStr === todayStr,
				});
			}
			return dates;
		},

		// 排班变更
		async onShiftChange(e: WechatMiniprogram.CustomEvent) {
			try {
				const { staffId, date } = e.currentTarget.dataset;
				const index = parseInt(e.detail.value);
				const shiftType = SHIFT_TYPES[index];
				const database = this.getDb();
				const today = this.data.today;
				const dates = this.data.dates;

				// 检查是否为今日之前的日期
				if (date < today) {
					wx.showToast({
						title: '不允许修改今日之前的排班',
						icon: 'none',
						duration: 2000
					});
					return;
				}

				wx.showLoading({ title: '更新中...' });

				// 更新当前日期的排班
				const existing = await (database.findOne<ScheduleRecord>(Collections.SCHEDULE, { staffId, date }));

				if (existing) {
					await database.updateById<ScheduleRecord>(Collections.SCHEDULE, existing.id, { shift: shiftType });
				} else {
					await database.insert<ScheduleRecord>(Collections.SCHEDULE, {
						date,
						staffId,
						shift: shiftType,
					});
				}

				// 获取所有员工和已有的排班数据
				const allStaff = await (database.getAll<StaffInfo>(Collections.STAFF));
				const allSchedules = await (database.getAll<ScheduleRecord>(Collections.SCHEDULE));

				// 获取今日及之后的所有可见日期
				const futureDates = dates.filter(d => d.date >= today);

				// 批量准备排班数据
				const newSchedules: Add<ScheduleRecord>[] = [];

				for (const staff of allStaff) {
					for (const d of futureDates) {
						const exists = allSchedules.find(s => s.staffId === staff.id && s.date === d.date);
						if (!exists) {
							newSchedules.push({
								date: d.date,
								staffId: staff.id,
								shift: DEFAULT_SHIFT,
							});
						}
					}
				}

				// 一次性批量插入所有缺失的排班
				if (newSchedules.length > 0) {
					await database.insertMany<ScheduleRecord>(Collections.SCHEDULE, newSchedules);
				}

				wx.hideLoading();

				// 更新界面
				const scheduleMap = this.data.scheduleMap;
				scheduleMap[staffId][date] = {
					label: SHIFT_NAMES[shiftType],
					type: shiftType,
					index: index,
				};

				this.setData({ scheduleMap });

				wx.showToast({
					title: '已更新',
					icon: 'none',
				});
			} catch (error) {
				console.error('排班变更失败:', error);
				wx.hideLoading();
				wx.showToast({
					title: '更新失败',
					icon: 'none'
				});
			}
		},

		// 加载员工列表
		async loadStaffList() {
			try {
				this.setData({ loading: true });
				const database = this.getDb();
				const staffList = await (database.getAll<StaffInfo>(Collections.STAFF));

				// 按创建时间倒序排列，增加兼容性处理
				staffList.sort((a, b) => {
					const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
					const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
					return timeB - timeA;
				});
				this.setData({ staffList, loading: false });
			} catch (error) {
				console.error('加载员工列表失败:', error);
				this.setData({ loading: false });
				wx.showToast({
					title: '加载失败',
					icon: 'none'
				});
			}
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
		async onEditStaff(e: WechatMiniprogram.TouchEvent) {
			try {
				const id = e.currentTarget.dataset.id as string;
				this.setData({ loading: true });
				const database = this.getDb();
				const staff = await (database.findById<StaffInfo>(Collections.STAFF, id));

				if (staff) {
					this.setData({
						showModal: true,
						editingStaff: staff,
						inputName: staff.name,
						inputStatus: staff.status,
						loading: false
					});
				} else {
					this.setData({ loading: false });
				}
			} catch (error) {
				console.error('编辑员工失败:', error);
				this.setData({ loading: false });
				wx.showToast({
					title: '加载失败',
					icon: 'none'
				});
			}
		},

		// 切换员工状态
		async onToggleStatus(e: WechatMiniprogram.TouchEvent) {
			try {
				const id = e.currentTarget.dataset.id as string;
				this.setData({ loading: true });
				const database = this.getDb();
				const staff = await (database.findById<StaffInfo>(Collections.STAFF, id));

				if (staff) {
					const newStatus: StaffStatus = staff.status === 'active' ? 'disabled' : 'active';

					await database.updateById<StaffInfo>(Collections.STAFF, id, { status: newStatus });

					await this.loadStaffList();

					this.setData({ loading: false });

					wx.showToast({
						title: newStatus === 'active' ? '已启用' : '已禁用',
						icon: 'success',
					});
				} else {
					this.setData({ loading: false });
				}
			} catch (error) {
				console.error('切换员工状态失败:', error);
				this.setData({ loading: false });
				wx.showToast({
					title: '操作失败',
					icon: 'none'
				});
			}
		},

		// 删除员工
		async onDeleteStaff(e: WechatMiniprogram.TouchEvent) {
			try {
				const id = e.currentTarget.dataset.id as string;
				this.setData({ loading: true });
				const database = this.getDb();
				const staff = await (database.findById<StaffInfo>(Collections.STAFF, id));

				if (!staff) {
					this.setData({ loading: false });
					return;
				}

				this.setData({ loading: false });

				wx.showModal({
					title: '确认删除',
					content: `确定要删除员工"${staff.name}"吗？`,
					confirmColor: '#ff4d4f',
					success: async (res) => {
						if (res.confirm) {
							try {
								this.setData({ loading: true });
								await database.deleteById(Collections.STAFF, id);
								await this.loadStaffList();
								wx.showToast({ title: '已删除', icon: 'success' });
							} catch (error) {
								this.setData({ loading: false });
								console.error('删除员工失败:', error);
								wx.showToast({ title: '删除失败', icon: 'none' });
							}
						}
					},
				});
			} catch (error) {
				console.error('删除员工失败:', error);
				this.setData({ loading: false });
				wx.showToast({
					title: '操作失败',
					icon: 'none'
				});
			}
		},

		// 姓名输入
		onNameInput(e: WechatMiniprogram.Input) {
			this.setData({ inputName: e.detail.value });
		},

		// 状态选择
		onStatusSelect(e: WechatMiniprogram.TouchEvent) {
			const status = e.currentTarget.dataset.status as StaffStatus;
			this.setData({ inputStatus: status });
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
		async onConfirmModal() {
			try {
				const { inputName, inputStatus, editingStaff } = this.data;
				const name = inputName.trim();

				if (!name) {
					wx.showToast({ title: '请输入员工姓名', icon: 'none' });
					return;
				}

				const database = this.getDb();
				wx.showLoading({ title: '保存中...' });

				if (editingStaff) {
					await database.updateById<StaffInfo>(Collections.STAFF, editingStaff.id, {
						name,
						status: inputStatus,
					});

					wx.showToast({ title: '修改成功', icon: 'success' });
				} else {
					const exists = await (database.exists<StaffInfo>(Collections.STAFF, { name }));

					if (exists) {
						wx.hideLoading();
						wx.showToast({ title: '员工姓名已存在', icon: 'none' });
						return;
					}

					const inserted = await (database.insert<StaffInfo>(Collections.STAFF, { name, status: 'active' }));

					if (inserted) {
						wx.showToast({ title: '添加成功', icon: 'success' });
					} else {
						wx.showToast({ title: '添加失败', icon: 'none' });
					}
				}

				wx.hideLoading();
				this.onCloseModal();
				await this.loadStaffList();
			} catch (error) {
				console.error('保存员工失败:', error);
				wx.hideLoading();
				wx.showToast({
					title: '保存失败',
					icon: 'none'
				});
			}
		},
	},
});
