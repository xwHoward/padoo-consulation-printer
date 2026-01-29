// cashier.ts
import { cloudDb as cloudDbService, Collections } from '../../utils/cloud-db';
import { DEFAULT_SHIFT } from '../../utils/constants';
import { formatDate, formatDuration, getMinutesDiff, isTimeOverlapping, parseProjectDuration } from '../../utils/util';

interface RotationItem {
	id: string;
	name: string;
	shift: ShiftType;
	shiftLabel: string;
	availableSlots?: string; // 可约时段
}

interface TimelineBlock {
	id: string;
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
	// 支持多位技师
	selectedTechnicians: Array<{ id: string; name: string; }>;
	startTime: string;
	// 编辑时用
	id?: string;
	technicianId?: string;
	technicianName?: string;
}



Component({
	data: {
		selectedDate: '',
		rooms: [] as Room[],
		rotationList: [] as RotationItem[],
		staffTimeline: [] as StaffTimeline[],
		timeLabels: ['12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'],
		// 当前时间线位置（百分比）
		currentTimePosition: '0%',
		showCurrentTimeLine: false,
		// 预约弹窗相关
		showReserveModal: false,
		projects: [] as Project[],
		staffNames: [] as string[],
		activeStaffList: [] as StaffInfo[],
		staffAvailability: [] as StaffAvailability[],
		reserveForm: {
			id: '', // 新增
			date: '',
			customerName: '',
			gender: 'male' as 'male' | 'female',
			project: '',
			phone: '',
			selectedTechnicians: [] as Array<{ id: string; name: string; }>,
			startTime: '',
			// 兼容编辑模式
			technicianId: '',
			technicianName: '',
		},
		// 结算弹窗相关
		showSettlementModal: false,
		settlementRecordId: '',
		settlementCouponCode: '',
		paymentMethods: [
			{ key: 'meituan', label: '美团', selected: false, amount: '' },
			{ key: 'dianping', label: '大众点评', selected: false, amount: '' },
			{ key: 'douyin', label: '抖音', selected: false, amount: '' },
			{ key: 'wechat', label: '微信', selected: false, amount: '' },
			{ key: 'alipay', label: '支付宝', selected: false, amount: '' },
			{ key: 'cash', label: '现金', selected: false, amount: '' },
			{ key: 'gaode', label: '高德', selected: false, amount: '' },
			{ key: 'free', label: '免单', selected: false, amount: '' },
			{ key: 'membership', label: '划卡', selected: false, amount: '' },
		],
		// loading状态
		loading: false,
		loadingText: '加载中...'
	},

	lifetimes: {
		attached() {
			const today = formatDate(new Date());
			this.setData({ selectedDate: today });
			this.loadProjects();
			this.loadData();
		}
	},

	pageLifetimes: {
		async show() {
			await this.loadData();
		}
	},

	methods: {
		getDb() {
			return cloudDbService;
		},

		async loadProjects() {
			this.setData({ loading: true, loadingText: '加载项目...' });
			try {
				const app = getApp<IAppOption>();
				const allProjects = await app.getProjects();
				this.setData({ projects: allProjects });
			} catch (error) {
				console.error('加载项目失败:', error);
				this.setData({ projects: [] });
			} finally {
				this.setData({ loading: false });
			}
		},

		async onDateChange(e: WechatMiniprogram.CustomEvent) {
			this.setData({ selectedDate: e.detail.value });
			await this.loadData();
		},

		// 加载数据
		async loadData() {
			this.setData({ loading: true, loadingText: '加载数据...' });
			try {
				const database = this.getDb();
				const app = getApp<IAppOption>();
				const today = this.data.selectedDate || formatDate(new Date());
				const allRooms = await app.getRooms();
				const filteredRooms = allRooms.filter((r: Room) => r.status === 'normal');

				const todayRecords = await (database).getConsultationsByDate<ConsultationRecord>(today);
				const activeRecords = todayRecords.filter(r => !r.isVoided);

				const reservations = await (database).find<ReservationRecord>(Collections.RESERVATIONS, { date: today });

				const now = new Date();
				const todayStr = formatDate(now);
				const isToday = today === todayStr;
				let currentTime = '';
				if (isToday) {
					const hours = now.getHours();
					const minutes = now.getMinutes();
					currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
				}

				const rooms = filteredRooms.map((room) => {
					let occupiedRecords = activeRecords
						.filter(r => r.room === room.name)
						.map(r => ({
							customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
							technician: r.technician || '',
							startTime: r.startTime,
							endTime: r.endTime || ''
						}));

					// 只显示当前时间正在占用的记录（对于今天）
					if (isToday && currentTime) {
						occupiedRecords = occupiedRecords.filter(r => {
							return currentTime >= r.startTime && currentTime < r.endTime;
						});
					}

					// 按结束时间降序排列
					occupiedRecords.sort((a, b) => b.endTime.localeCompare(a.endTime));

					const isOccupied = occupiedRecords.length > 0;

					return {
						...room,
						isOccupied,
						occupiedRecords
					};
				});

				// 2. 获取员工轮排与排钟表数据
				const allSchedules = await (database).getAll<ScheduleRecord>(Collections.SCHEDULE);
				const allStaff = await (database).getAll<StaffInfo>(Collections.STAFF);
				const activeStaffList = allStaff.filter(s => s.status === 'active');
				const scheduledStaff = allSchedules.map(s => s.staffId);
				const activeStaff = activeStaffList.filter(s => scheduledStaff.includes(s.id));


				const savedRotation = wx.getStorageSync(`rotation_${today}`) as string[];

				this.setData({
					activeStaffList: activeStaff,
					staffNames: activeStaff.map(s => s.name)
				});

				// 转换排钟数据
				const staffTimeline: StaffTimeline[] = [];
				const rotationList: RotationItem[] = activeStaff.map(staff => {
					const schedule = allSchedules.find(s => s.date === today && s.staffId === staff.id);
					const shift = schedule ? schedule.shift : DEFAULT_SHIFT;

					// 过滤出上钟员工
					if (shift === 'morning' || shift === 'evening') {
						// 处理排钟表数据 (合并实际报钟和预约)
						const staffRecords = activeRecords.filter(r => r.technician === staff.name);
						const staffReservations = reservations.filter(r => r.technicianName === staff.name || r.technicianId === staff.id);

						// 合并并处理块
						const blocks: TimelineBlock[] = [
							...staffRecords.map(r => ({ ...r, isReservation: false })),
							...staffReservations.map(r => ({
								id: r.id,
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
								id: r.id,
								customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
								startTime: r.startTime,
								endTime: r.endTime,
								project: r.project,
								room: r.room,
								left: (startMinutes / 660 * 100) + '%',
								width: (duration / 660 * 100) + '%',
								isReservation: (r).isReservation
							};
						});

						staffTimeline.push({
							id: staff.id,
							name: staff.name,
							shift: shift as ShiftType,
							blocks
						});
					}

					// 计算可约时段
					const availableSlots = this.calculateAvailableSlots(staff.name, activeRecords, reservations, today);

					return {
						id: staff.id,
						name: staff.name,
						shift: shift as ShiftType,
						shiftLabel: shift === 'morning' ? '早班' : '晚班',
						availableSlots
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

				this.setData({ rooms, rotationList, staffTimeline });

				// 计算当前时间线位置
				this.updateCurrentTimeLine();
			} catch (error) {
				console.error('加载数据失败:', error);
				wx.showToast({
					title: '加载数据失败',
					icon: 'none'
				});
			} finally {
				this.setData({ loading: false });
			}
		},

		// 计算技师可约时段
		calculateAvailableSlots(
			staffName: string,
			activeRecords: ConsultationRecord[],
			reservations: ReservationRecord[],
			selectedDate: string
		): string {
			const now = new Date();
			const todayStr = formatDate(now);
			const isToday = selectedDate === todayStr;

			// 获取该技师的所有占用时段
			const staffRecords = activeRecords.filter(r => r.technician === staffName);
			const staffReservations = reservations.filter(r => r.technicianName === staffName);

			// 合并所有占用时段并排序
			const occupiedSlots = [...staffRecords, ...staffReservations]
				.map(r => ({
					startTime: r.startTime,
					endTime: r.endTime
				}))
				.sort((a, b) => a.startTime.localeCompare(b.startTime));

			// 如果没有任何占用，返回全天可约
			if (occupiedSlots.length === 0) {
				if (isToday) {
					const currentHour = now.getHours();
					const currentMinute = now.getMinutes();
					if (currentHour >= 23) {
						return '已下班';
					}
					if (currentHour < 12) {
						const duration = getMinutesDiff('12:00', '23:00');
						return `12:00-23:00(${formatDuration(duration)})`;
					}
					// 从下一个半点或整点开始
					const nextMinute = currentMinute < 30 ? 30 : 0;
					const nextHour = nextMinute === 0 ? currentHour + 1 : currentHour;
					const startTimeStr = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
					const duration = getMinutesDiff(startTimeStr, '23:00');
					return `${startTimeStr}-23:00(${formatDuration(duration)})`;
				}
				const duration = getMinutesDiff('12:00', '23:00');
				return `12:00-23:00(${formatDuration(duration)})`;
			}

			// 查找空闲时段（至少60分钟以上）
			const availableSlots: string[] = [];

			// 检查第一个占用之前的时间
			const firstOccupied = occupiedSlots[0];
			let firstAvailableTime = '12:00';

			if (isToday) {
				const currentHour = now.getHours();
				const currentMinute = now.getMinutes();
				if (currentHour >= 23) {
					return '已下班';
				}
				if (currentHour >= 12) {
					const nextMinute = currentMinute < 30 ? 30 : 0;
					const nextHour = nextMinute === 0 ? currentHour + 1 : currentHour;
					firstAvailableTime = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
				}
			}

			// 计算第一个空闲时段
			const gapMinutes = getMinutesDiff(firstAvailableTime, firstOccupied.startTime);
			if (gapMinutes >= 60) {
				availableSlots.push(`${firstAvailableTime}-${firstOccupied.startTime}(${formatDuration(gapMinutes)})`);
			}

			// 检查占用时段之间的空闲时间
			for (let i = 0; i < occupiedSlots.length - 1; i++) {
				const current = occupiedSlots[i];
				const next = occupiedSlots[i + 1];
				const gap = getMinutesDiff(current.endTime, next.startTime);
				if (gap >= 60) {
					availableSlots.push(`${current.endTime}-${next.startTime}(${formatDuration(gap)})`);
				}
			}

			// 检查最后一个占用之后的时间
			const lastOccupied = occupiedSlots[occupiedSlots.length - 1];
			const lastGap = getMinutesDiff(lastOccupied.endTime, '23:00');
			if (lastGap >= 60) {
				availableSlots.push(`${lastOccupied.endTime}-23:00(${formatDuration(lastGap)})`);
			}

			if (availableSlots.length === 0) {
				return '已满';
			}

			return availableSlots.join(', ');
		},

		// 更新当前时间线位置
		updateCurrentTimeLine() {
			const now = new Date();
			const todayStr = formatDate(now);
			const selectedDate = this.data.selectedDate;

			// 只有当选中的是今天时才显示当前时间线
			if (selectedDate !== todayStr) {
				this.setData({ showCurrentTimeLine: false });
				return;
			}

			const hours = now.getHours();
			const minutes = now.getMinutes();

			// 只在12:00-23:00之间显示时间线
			if (hours < 12 || hours >= 23) {
				this.setData({ showCurrentTimeLine: false });
				return;
			}

			// 计算相对于12:00的分钟数
			const currentMinutes = (hours - 12) * 60 + minutes;
			// 总时间范围：12:00-23:00 = 11小时 = 660分钟
			const totalMinutes = 660;
			const position = (currentMinutes / totalMinutes * 100).toFixed(2) + '%';

			this.setData({
				showCurrentTimeLine: true,
				currentTimePosition: position
			});
		},

		// 调整轮排顺序
		moveRotation(e: WechatMiniprogram.TouchEvent) {
			const { index, direction } = e.currentTarget.dataset;
			const list = [...this.data.rotationList];

			if (direction === 'up' && index > 0) {
				[list[index - 1], list[index]] = [list[index], list[index - 1]];
			} else if (direction === 'down' && index < list.length - 1) {
				[list[index + 1], list[index]] = [list[index], list[index + 1]];
			} else {
				return;
			}

			this.setData({ rotationList: list });

			// 持久化顺序
			const today = this.data.selectedDate || formatDate(new Date());
			wx.setStorageSync(`rotation_${today}`, list.map(item => item.id));
		},

		// 预约相关
		async openReserveModal() {
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

			const startTimeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;

			this.setData({
				showReserveModal: true,
				reserveForm: {
					id: '', // 重置 ID
					date: this.data.selectedDate || formatDate(new Date()),
					customerName: '',
					gender: 'male',
					project: '',
					phone: '',
					selectedTechnicians: [],
					startTime: startTimeStr,
					technicianId: '',
					technicianName: '',
				}
			});
			await this.checkStaffAvailability();
		},

		// 点击排钟项目操作
		onBlockClick(e: WechatMiniprogram.CustomEvent) {
			const { id, reservation } = e.currentTarget.dataset;
			const itemList = reservation ? ['编辑', '到店', '取消预约'] : ['编辑', '结算'];

			wx.showActionSheet({
				itemList,
				success: (res) => {
					const action = itemList[res.tapIndex];
					if (action === '编辑') {
						if (reservation) {
							this.editReservation(id);
						} else {
							wx.navigateTo({ url: `/pages/index/index?editId=${id}` });
						}
					} else if (action === '到店') {
						wx.navigateTo({ url: `/pages/index/index?reserveId=${id}` });
					} else if (action === '取消预约') {
						this.cancelReservation(id);
					} else if (action === '结算') {
						this.openSettlement(id);
					}
				}
			});
		},

		// 编辑预约
		async editReservation(id: string) {
			this.setData({ loading: true, loadingText: '加载中...' });
			try {
				const database = this.getDb();
				const record = await (database).findById<ReservationRecord>(Collections.RESERVATIONS, id);
				if (record) {
					const selectedTechnicians: Array<{ id: string; name: string; }> = [];
					if (record.technicianId && record.technicianName) {
						selectedTechnicians.push({ id: record.technicianId, name: record.technicianName });
					}
					this.setData({
						showReserveModal: true,
						reserveForm: {
							id: record.id,
							date: record.date,
							customerName: record.customerName,
							gender: record.gender,
							project: record.project,
							phone: record.phone,
							selectedTechnicians,
							startTime: record.startTime,
							technicianId: record.technicianId || '',
							technicianName: record.technicianName || '',
						}
					});
					await this.checkStaffAvailability();
				}
			} catch (error) {
				console.error('编辑预约失败:', error);
				wx.showToast({
					title: '加载预约失败',
					icon: 'none'
				});
			} finally {
				this.setData({ loading: false });
			}
		},

		// 检查技师在预约时段的可用性
		async checkStaffAvailability() {
			try {
				const { date, startTime, project } = this.data.reserveForm;
				if (!date || !startTime) return;

				this.setData({ loading: true, loadingText: '检查技师可用性...' });
				const database = this.getDb();

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
				const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

				const activeRecords = (await (database).getConsultationsByDate<ConsultationRecord>(date)).filter(r => !r.isVoided);

				const reservations = await (database).find<ReservationRecord>(Collections.RESERVATIONS, { date });

				const allTasks = [...activeRecords, ...reservations];

				const allStaff = await (database).getAll<StaffInfo>(Collections.STAFF);
				const activeStaff = allStaff.filter(s => s.status === 'active');

				const staffAvailability = activeStaff.map(staff => {
					let occupiedReason = '';
					const conflictTask = allTasks.find(r => {
						const rName = (r as ConsultationRecord).technician || (r as ReservationRecord).technicianName;
						if (rName !== staff.name) return false;
						return isTimeOverlapping(startTime, endTimeStr, r.startTime, r.endTime);
					});

					if (conflictTask) {
						const isReservation = !(conflictTask as ConsultationRecord).technician;
						const customerName = (conflictTask as ConsultationRecord).surname || (conflictTask as ReservationRecord).customerName || '顾客';
						const gender = conflictTask.gender === 'male' ? '先生' : '女士';
						occupiedReason = `${conflictTask.startTime}-${conflictTask.endTime} ${customerName}${gender}${isReservation ? '(预约)' : ''}`;
					}

					// 检查是否已选中
					const isSelected = this.data.reserveForm.selectedTechnicians.some(t => t.id === staff.id);

					return {
						id: staff.id,
						name: staff.name,
						isOccupied: !!conflictTask,
						occupiedReason,
						isSelected
					};
				});

				this.setData({ staffAvailability });
			} catch (error) {
				console.error('检查技师可用性失败:', error);
			} finally {
				this.setData({ loading: false });
			}
		},

		closeReserveModal() {
			this.setData({ showReserveModal: false });
		},

		stopBubble() { },

		onReserveFieldChange(e: WechatMiniprogram.CustomEvent) {
			const { field } = e.currentTarget.dataset;
			const val = e.detail.value;
			const { reserveForm, projects } = this.data;

			if (field === 'project') {
				const project = projects[val];
				reserveForm.project = project ? project.name : '';
				this.setData({ reserveForm });
				this.checkStaffAvailability();
			} else if (field === 'startTime' || field === 'date') {
				reserveForm[field as 'startTime' | 'date'] = val;
				this.setData({ reserveForm });
				this.checkStaffAvailability();
			} else {
				reserveForm[field as keyof ReserveForm] = val;
				console.log('更新后的 reserveForm:', reserveForm);
				this.setData({ reserveForm });
			}
		},

		selectReserveTechnician(e: WechatMiniprogram.CustomEvent) {
			const { id, technician: name, occupied, reason } = e.detail;
			if (occupied) {
				wx.showToast({ title: reason || '该技师在此时段已有安排', icon: 'none', duration: 2500 });
				return;
			}

			// 多选逻辑：切换选中状态
			const selectedTechnicians = [...this.data.reserveForm.selectedTechnicians];
			const existingIndex = selectedTechnicians.findIndex(t => t.id === id);

			if (existingIndex !== -1) {
				// 已选中，取消选择
				selectedTechnicians.splice(existingIndex, 1);
			} else {
				// 未选中，添加
				selectedTechnicians.push({ id, name });
			}

			// 更新 staffAvailability 的 isSelected 状态
			const staffAvailability = this.data.staffAvailability.map(staff => ({
				...staff,
				isSelected: selectedTechnicians.some(t => t.id === staff.id)
			}));

			this.setData({
				'reserveForm.selectedTechnicians': selectedTechnicians,
				staffAvailability
			});
		},

		// 选择项目（平铺版）
		async selectReserveProject(e: WechatMiniprogram.CustomEvent) {
			const { project } = e.detail;
			const currentProject = this.data.reserveForm.project;
			// 切换选中状态
			this.setData({
				'reserveForm.project': currentProject === project ? '' : project
			});
			await this.checkStaffAvailability();
		},

		onReserveGenderChange(e: WechatMiniprogram.CustomEvent) {
			this.setData({ 'reserveForm.gender': e.detail.value });
		},

		async confirmReserve() {
			const { reserveForm } = this.data;
			const database = this.getDb();

			if (!reserveForm.startTime) {
				wx.showToast({ title: '开始时间必填', icon: 'none' });
				return;
			}

			this.setData({ loading: true, loadingText: '保存中...' });
			try {
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
				const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

				// 如果是编辑模式，只更新第一个技师
				if (reserveForm.id) {
					const firstTech = reserveForm.selectedTechnicians[0];
					const record: Omit<ReservationRecord, 'id' | 'createdAt' | 'updatedAt' | '_id'> = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: firstTech?.id || '',
						technicianName: firstTech?.name || '',
						startTime: reserveForm.startTime,
						endTime: endTime
					};
					const success = await (database).updateById<ReservationRecord>(Collections.RESERVATIONS, reserveForm.id, record);
					if (success) {
						wx.showToast({ title: '更新成功', icon: 'success' });
						this.closeReserveModal();
						await this.loadData();
					} else {
						wx.showToast({ title: '保存失败', icon: 'none' });
					}
					return;
				}

				// 新增模式：为每位选中的技师创建一条预约
				const technicians = reserveForm.selectedTechnicians;

				// 如果没有选择技师，也允许创建一条预约（技师待定）
				if (technicians.length === 0) {
					const record: Omit<ReservationRecord, 'id' | 'createdAt' | 'updatedAt' | '_id'> = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: '',
						technicianName: '',
						startTime: reserveForm.startTime,
						endTime: endTime
					};
					const success = await (database).insert<ReservationRecord>(Collections.RESERVATIONS, record);
					if (success) {
						wx.showToast({ title: '预约成功', icon: 'success' });
						this.closeReserveModal();
						await this.loadData();
					} else {
						wx.showToast({ title: '保存失败', icon: 'none' });
					}
					return;
				}

				// 为每位技师创建预约
				let successCount = 0;
				for (const tech of technicians) {
					const record: Omit<ReservationRecord, 'id' | 'createdAt' | 'updatedAt' | '_id'> = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: tech.id,
						technicianName: tech.name,
						startTime: reserveForm.startTime,
						endTime: endTime
					};
					const insertResult = await (database).insert<ReservationRecord>(Collections.RESERVATIONS, record);
					if (insertResult) {
						successCount++;
					}
				}

				if (successCount === technicians.length) {
					const msg = technicians.length > 1 ? `已创建${technicians.length}条预约` : '预约成功';
					wx.showToast({ title: msg, icon: 'success' });
					this.closeReserveModal();
					await this.loadData();
				} else {
					wx.showToast({ title: `部分保存失败(${successCount}/${technicians.length})`, icon: 'none' });
				}
			} catch (error) {
				console.error('保存预约失败:', error);
				wx.showToast({ title: '保存失败', icon: 'none' });
			} finally {
				this.setData({ loading: false });
			}
		},

		// 取消预约
		async cancelReservation(id: string) {
			wx.showModal({
				title: '确认取消',
				content: '确定要取消此预约吗？',
				confirmText: '确定',
				cancelText: '再想想',
				success: async (res) => {
					if (res.confirm) {
						this.setData({ loading: true, loadingText: '取消中...' });
						try {
							const database = this.getDb();
							const success = await (database).deleteById(Collections.RESERVATIONS, id);
							if (success) {
								wx.showToast({ title: '已取消预约', icon: 'success' });
								await this.loadData();
							} else {
								wx.showToast({ title: '取消失败', icon: 'none' });
							}
						} catch (error) {
							console.error('取消预约失败:', error);
							wx.showToast({ title: '取消失败', icon: 'none' });
						} finally {
							this.setData({ loading: false });
						}
					}
				}
			});
		},

		// 打开结算弹窗
		async openSettlement(id: string) {
			try {
				const database = this.getDb();
				const today = this.data.selectedDate || formatDate(new Date());
				const records = await (database).getConsultationsByDate<ConsultationRecord>(today);
				const record = records.find(r => r.id === id) || null;

				if (!record) {
					wx.showToast({ title: '未找到该单据', icon: 'none' });
					return;
				}

				if (record.settlement) {
					wx.showModal({
						title: '已结算',
						content: '该单据已经结算，是否重新结算？',
						success: (res) => {
							if (res.confirm) {
								this.loadSettlement(id, record);
							}
						}
					});
				} else {
					this.loadSettlement(id, record);
				}
			} catch (error) {
				console.error('打开结算失败:', error);
				wx.showToast({ title: '加载失败', icon: 'none' });
			}
		},

		// 加载结算信息
		loadSettlement(id: string, record: ConsultationRecord) {
			// 重置支付方式
			const paymentMethods = this.data.paymentMethods.map(m => ({
				...m,
				selected: false,
				amount: ''
			}));

			// 如果已有结算信息，回显
			if (record.settlement) {
				record.settlement.payments.forEach(payment => {
					const methodIndex = paymentMethods.findIndex(m => m.key === payment.method);
					if (methodIndex !== -1) {
						paymentMethods[methodIndex].selected = true;
						paymentMethods[methodIndex].amount = payment.amount.toString();
					}
				});
			} else if (record.couponPlatform === 'membership') {
				// 如果预约/咨询单选择了“划卡”，预勾选划卡支付
				const membershipIndex = paymentMethods.findIndex(m => m.key === 'membership');
				if (membershipIndex !== -1) {
					paymentMethods[membershipIndex].selected = true;
					paymentMethods[membershipIndex].amount = '1'; // 默认扣1次，虽然这里是金额输入，但划卡逻辑特殊
				}
			}

			this.setData({
				showSettlementModal: true,
				settlementRecordId: id,
				settlementCouponCode: record.settlement?.couponCode || record.couponCode || '',
				paymentMethods
			});
		},

		// 关闭结算弹窗
		closeSettlementModal() {
			this.setData({ showSettlementModal: false });
		},

		// 切换支付方式
		togglePaymentMethod(e: WechatMiniprogram.CustomEvent) {
			const { index } = e.currentTarget.dataset;
			const paymentMethods = this.data.paymentMethods;
			paymentMethods[index].selected = !paymentMethods[index].selected;

			// 如果是免单，取消其他所有选项
			if (paymentMethods[index].key === 'free' && paymentMethods[index].selected) {
				paymentMethods.forEach((m, i) => {
					if (i !== index) {
						m.selected = false;
						m.amount = '';
					}
				});
			}
			// 如果选择其他方式，取消免单
			else if (paymentMethods[index].key !== 'free' && paymentMethods[index].selected) {
				const freeIndex = paymentMethods.findIndex(m => m.key === 'free');
				if (freeIndex !== -1) {
					paymentMethods[freeIndex].selected = false;
					paymentMethods[freeIndex].amount = '';
				}
			}

			// 如果取消选择，清空金额
			if (!paymentMethods[index].selected) {
				paymentMethods[index].amount = '';
			}

			this.setData({ paymentMethods });
		},

		// 输入支付金额
		onPaymentAmountInput(e: WechatMiniprogram.CustomEvent) {
			const { index } = e.currentTarget.dataset;
			const { value } = e.detail;
			const paymentMethods = this.data.paymentMethods;
			paymentMethods[index].amount = value;
			this.setData({ paymentMethods });
		},

		// 输入券码
		onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
			this.setData({ settlementCouponCode: e.detail.value });
		},

		// 确认结算
		async confirmSettlement() {
			const { settlementRecordId, paymentMethods, settlementCouponCode } = this.data;
			const database = this.getDb();

			// 收集所有已选择的支付方式
			const selectedPayments = paymentMethods.filter(m => m.selected);

			if (selectedPayments.length === 0) {
				wx.showToast({ title: '请选择支付方式', icon: 'none' });
				return;
			}

			this.setData({ loading: true, loadingText: '结算中...' });
			try {
				// 验证金额
				const payments: PaymentItem[] = [];
				let totalAmount = 0;

				for (const method of selectedPayments) {
					// 免单不需要输入金额
					if (method.key === 'free') {
						payments.push({ method: method.key as PaymentMethod, amount: 0 });
						continue;
					}

					const amount = parseFloat(method.amount);
					if (!method.amount || isNaN(amount) || amount <= 0) {
						wx.showToast({ title: `请输入${method.label}的有效${method.key === 'membership' ? '次数' : '金额'}`, icon: 'none' });
						return;
					}

					payments.push({ method: method.key as PaymentMethod, amount });
					// 划卡不计入现金总额
					if (method.key !== 'membership') {
						totalAmount += amount;
					}
				}

				// 保存结算信息
				const today = this.data.selectedDate || formatDate(new Date());
				const history = (wx.getStorageSync('consultationHistory') as any) || {};
				const todayRecords = (history[today] || []) as ConsultationRecord[];
				const recordIndex = todayRecords.findIndex(r => r.id === settlementRecordId);

				if (recordIndex === -1) {
					wx.showToast({ title: '未找到该单据', icon: 'none' });
					return;
				}

				const now = new Date();
				const settlement: SettlementInfo = {
					payments,
					totalAmount,
					couponCode: settlementCouponCode,
					settledAt: now.toISOString()
				};

				const membershipPayment = payments.find(p => p.method === 'membership');
				if (membershipPayment) {

					const allMemberships = await (database).getAll<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP);
					const allRecords = await (database).getConsultationsByDate<ConsultationRecord>(today);
					const target = allRecords.find(r => r.id === settlementRecordId);
					if (!target) {
						wx.showToast({ title: '未找到该单据', icon: 'none' });
						return;
					}
					const customerMembership = allMemberships.find(m => {
						return (m.customerPhone === target.phone || m.customerName === target.surname) &&
							m.remainingTimes > 0 && m.status === 'active';
					}) || null;


					if (!customerMembership) {
						wx.showToast({ title: '未找到有效会员卡或余额不足', icon: 'none' });
						return;
					}

					const deduction = membershipPayment.amount || 1;
					const newRemaining = customerMembership.remainingTimes - deduction;
					if (newRemaining < 0) {
						wx.showToast({ title: '会员卡余额不足', icon: 'none' });
						return;
					}

					await (database).updateById<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP, customerMembership.id, {
						remainingTimes: newRemaining
					});


					const records = await (database).getConsultationsByDate<ConsultationRecord>(today);
					const record = records.find(r => r.id === settlementRecordId) || null;

					if (!record) {
						wx.showToast({ title: '未找到该单据', icon: 'none' });
						return;
					}

					await (database).insert<MembershipUsageRecord>(Collections.MEMBERSHIP_USAGE, {
						cardId: customerMembership.cardId,
						cardName: customerMembership.cardName,
						date: today,
						customerName: record.surname,
						project: record.project,
						technician: record.technician,
						room: record.room,
						consultationId: record.id
					});
				}

				const records = await (database).getConsultationsByDate<ConsultationRecord>(today);
				const record = records.find(r => r.id === settlementRecordId);
				if (record) {
					await (database).updateById(Collections.CONSULTATION, settlementRecordId, {
						settlement: settlement,
						updatedAt: now.toISOString()
					});
				}

				wx.showToast({ title: '结算成功', icon: 'success' });
				this.closeSettlementModal();
				await this.loadData();
			} catch (error) {
				console.error('结算失败:', error);
				wx.showToast({ title: '结算失败', icon: 'none' });
			} finally {
				this.setData({ loading: false });
			}
		}
	}
});

