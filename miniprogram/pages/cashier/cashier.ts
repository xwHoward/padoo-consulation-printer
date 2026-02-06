// cashier.ts
import { cloudDb, Collections } from '../../utils/cloud-db';
import { DEFAULT_SHIFT, ShiftType, SHIFT_START_TIME, SHIFT_END_TIME } from '../../utils/constants';
import { checkLogin } from '../../utils/auth';
import { requirePagePermission } from '../../utils/permission';
import { formatDate, formatDuration, getMinutesDiff, parseProjectDuration } from '../../utils/util';

interface RotationItem {
	_id: string;
	name: string;
	shift: ShiftType;
	shiftLabel: string;
	availableSlots?: string; // 可约时段
}

interface TimelineBlock {
	_id: string;
	customerName: string;
	startTime: string;
	endTime: string;
	project: string;
	room: string;
	left: string; // 距离左侧百分比
	width: string; // 宽度百分比
	isReservation?: boolean;
	isSettled?: boolean; // 是否已结算
}

interface StaffTimeline {
	_id: string;
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
	selectedTechnicians: Array<{ _id: string; name: string; }>;
	startTime: string;
	// 编辑时用
	_id?: string;
	technicianId?: string;
	technicianName?: string;
}

interface PaymentMethodItem {
	key: string;
	label: string;
	selected: boolean;
	amount: string;
	couponCode?: string;
}



Component({
	data: {
		selectedDate: '',
		rooms: [] as Room[],
		rotationList: [] as RotationItem[],
		staffTimeline: [] as StaffTimeline[],
		timeLabels: ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '00', '01', '02'],
		// 当前时间线位置（百分比）
		currentTimePosition: '0%',
		showCurrentTimeLine: false,
		timelineScrollLeft: 0,
		// 预约弹窗相关
		showReserveModal: false,
		projects: [] as Project[],
		activeStaffList: [] as StaffInfo[],
		staffAvailability: [] as StaffAvailability[],
		reserveForm: {
			_id: '', // 新增
			date: '',
			customerName: '',
			gender: 'male' as 'male' | 'female',
			project: '',
			phone: '',
			selectedTechnicians: [] as Array<{ _id: string; name: string; phone: string; }>,
			startTime: '',
			// 兼容编辑模式
			technicianId: '',
			technicianName: '',
		},
		// 结算弹窗相关
		showSettlementModal: false,
		settlementRecordId: '',
		settlementCouponCode: '',
		projectOriginalPrice: 0,
		totalSettlementAmount: 0,
		paymentMethods: [
			{ key: 'meituan', label: '美团', selected: false, amount: '', couponCode: '' },
			{ key: 'dianping', label: '大众点评', selected: false, amount: '', couponCode: '' },
			{ key: 'douyin', label: '抖音', selected: false, amount: '', couponCode: '' },
			{ key: 'wechat', label: '微信', selected: false, amount: '', couponCode: '' },
			{ key: 'alipay', label: '支付宝', selected: false, amount: '', couponCode: '' },
			{ key: 'cash', label: '现金', selected: false, amount: '', couponCode: '' },
			{ key: 'gaode', label: '高德', selected: false, amount: '', couponCode: '' },
			{ key: 'free', label: '免单', selected: false, amount: '', couponCode: '' },
			{ key: 'membership', label: '划卡', selected: false, amount: '', couponCode: '' },
		],
		// loading状态
		loading: false,
		loadingText: '加载中...',
		// 顾客匹配
		matchedCustomer: null as any,
		matchedCustomerApplied: false,
		// 预约推送确认弹窗
		pushModal: {
			show: false,
			loading: false,
			type: 'create' as 'create' | 'cancel',
			reservationData: null as {
				customerName: string;
				gender: 'male' | 'female';
				date: string;
				startTime: string;
				endTime: string;
				project: string;
				technicians: Array<{ _id: string; name: string; phone: string; }>;
			} | null
		}
	},

	lifetimes: {
		async attached() {
			const isLoggedIn = await checkLogin();
			if (!isLoggedIn) return;

			if (!requirePagePermission('cashier')) return;

			const today = formatDate(new Date());
			this.setData({ selectedDate: today });
			this.loadProjects();
			this.loadData();
		}
	},

	pageLifetimes: {
		async show() {
			const isLoggedIn = await checkLogin();
			if (!isLoggedIn) return;

			if (!requirePagePermission('cashier')) return;

			this.loadData();
		}
	},

	methods: {
		async loadProjects() {
			try {
				const app = getApp<IAppOption>();
				const allProjects = await app.getProjects();
				this.setData({ projects: allProjects });
			} catch (error) {
				console.error('加载项目失败:', error);
				this.setData({ projects: [] });
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
				const app = getApp<IAppOption>();
				const today = this.data.selectedDate || formatDate(new Date());
				const allRooms = await app.getRooms();
				const filteredRooms = allRooms.filter((r: Room) => r.status === 'normal');

				const todayRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
				const activeRecords = todayRecords.filter(r => !r.isVoided);

				const reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, { date: today });

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
				const allSchedules = await cloudDb.getAll<ScheduleRecord>(Collections.SCHEDULE);
				const allStaff = await cloudDb.getAll<StaffInfo>(Collections.STAFF);
				const activeStaffList = allStaff.filter(s => s.status === 'active');
				const scheduledStaff = allSchedules.map(s => s.staffId);
				const activeStaff = activeStaffList.filter(s => scheduledStaff.includes(s._id));

				const savedRotation = wx.getStorageSync(`rotation_${today}`) as string[];

				this.setData({
					activeStaffList: activeStaff,
				});

				// 调用云函数获取技师可用列表
				const projectDuration = 60;
				const currentTimeStr = isToday ? currentTime : '12:00';

				const technicianRes = await wx.cloud.callFunction({
					name: 'getAvailableTechnicians',
					data: {
						date: today,
						currentTime: currentTimeStr,
						projectDuration: projectDuration,
						currentReservationIds: []
					}
				});

				let availableTechnicians = [] as StaffAvailability[];
				if (!technicianRes.result || typeof technicianRes.result !== 'object') {
					this.setData({ staffAvailability: availableTechnicians });
					return;
				}
				if (technicianRes.result && technicianRes.result.code === 0) {
					availableTechnicians = technicianRes.result.data as StaffAvailability[];
				}

				this.setData({ staffAvailability: availableTechnicians });

				// 转换排钟数据
				const staffTimeline: StaffTimeline[] = [];
				const rotationList: RotationItem[] = activeStaff.map(staff => {
					const schedule = allSchedules.find(s => s.date === today && s.staffId === staff._id);
					const shift = schedule ? schedule.shift : DEFAULT_SHIFT;

					// 过滤出上钟员工
					if (shift === 'morning' || shift === 'evening') {
						// 处理排钟表数据 (合并实际报钟和预约)
						const staffRecords = activeRecords.filter(r => r.technician === staff.name);
						const staffReservations = reservations.filter(r => r.technicianName === staff.name || r.technicianId === staff._id);

						// 合并并处理块
						const blocks: TimelineBlock[] = [
							...staffRecords.map(r => ({ ...r, isReservation: false })),
							...staffReservations.map(r => ({
								_id: r._id,
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

							const startMinutes = (startH - parseInt(this.data.timeLabels[0])) * 60 + startM;
							const duration = (endH - startH) * 60 + (endM - startM);
							const timelineWidth = (this.data.timeLabels.length) * 60;
							// 检查是否已结算
							const isSettled = !r.isReservation && (r as ConsultationRecord).settlement && Object.keys((r as ConsultationRecord).settlement!).length > 0;

							return {
								_id: r._id,
								customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
								startTime: r.startTime,
								endTime: r.endTime,
								project: r.project,
								room: r.room,
								left: (startMinutes / timelineWidth * 100) + '%',
								width: (duration / timelineWidth * 100) + '%',
								isReservation: (r).isReservation,
								isSettled
							};
						});

						staffTimeline.push({
							_id: staff._id,
							name: staff.name,
							shift: shift as ShiftType,
							blocks
						});
					}

					// 计算可约时段
					const availableSlots = this.calculateAvailableSlots(staff.name, activeRecords, reservations, today, shift);

					return {
						_id: staff._id,
						name: staff.name,
						shift: shift as ShiftType,
						shiftLabel: shift === 'morning' ? '早班' : '晚班',
						availableSlots
					};
				}).filter(item => item.shift === 'morning' || item.shift === 'evening');

				// 按保存的顺序排序
				if (savedRotation && savedRotation.length > 0) {
					const sortFn = (a: any, b: any) => {
						const idxA = savedRotation.indexOf(a._id);
						const idxB = savedRotation.indexOf(b._id);
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
			selectedDate: string,
			shift: ShiftType
		): string {
			const now = new Date();
			const todayStr = formatDate(now);
			const isToday = selectedDate === todayStr;

			const shiftStart = SHIFT_START_TIME[shift];
			const shiftEnd = SHIFT_END_TIME[shift];

			if (!shiftStart || !shiftEnd) {
				return '未排班';
			}

			const nowHour = now.getHours();
			const nowMinute = now.getMinutes();

			if (isToday) {
				const shiftEndHour = parseInt(shiftEnd.substring(0, 2));
				if (nowHour >= shiftEndHour) {
					return '已下班';
				}
			}

			const staffRecords = activeRecords.filter(r => r.technician === staffName);
			const staffReservations = reservations.filter(r => r.technicianName === staffName);

			const occupiedSlots = [...staffRecords, ...staffReservations]
				.map(r => ({
					startTime: r.startTime,
					endTime: r.endTime
				}))
				.filter(slot => slot.startTime < shiftEnd && slot.endTime > shiftStart)
				.sort((a, b) => a.startTime.localeCompare(b.startTime));

			const availableSlots: string[] = [];

			let startTime = shiftStart;
			if (isToday) {
				const shiftStartHour = parseInt(shiftStart.substring(0, 2));
				const shiftStartMinute = parseInt(shiftStart.substring(3));
				if (nowHour > shiftStartHour || (nowHour === shiftStartHour && nowMinute >= shiftStartMinute)) {
					const nextMinute = nowMinute < 30 ? 30 : 60;
					const nextHour = nextMinute === 60 ? nowHour + 1 : nowHour;
					if (nextMinute === 60) {
						startTime = `${String(nextHour).padStart(2, '0')}:00`;
					} else {
						startTime = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
					}
				}
			}

			if (occupiedSlots.length === 0) {
				if (startTime >= shiftEnd) {
					return '已满';
				}
				const duration = getMinutesDiff(startTime, shiftEnd);
				return `${startTime}-${shiftEnd}(${formatDuration(duration)})`;
			}

			for (let i = 0; i <= occupiedSlots.length; i++) {
				const slotEnd = i === 0 ? startTime : occupiedSlots[i - 1].endTime;
				const slotStart = i === occupiedSlots.length ? shiftEnd : occupiedSlots[i].startTime;

				if (slotEnd >= shiftEnd) {
					break;
				}

				const actualStart = slotEnd < startTime ? startTime : slotEnd;
				const actualEnd = slotStart > shiftEnd ? shiftEnd : slotStart;

				if (actualStart >= actualEnd) {
					continue;
				}

				const gap = getMinutesDiff(actualStart, actualEnd);
				if (gap >= 60) {
					availableSlots.push(`${actualStart}-${actualEnd}(${formatDuration(gap)})`);
				}
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
			const totalMinutes = (this.data.timeLabels.length - 2) * 60;
			const position = (currentMinutes / totalMinutes * 100).toFixed(2) + '%';

			// 计算滚动位置：假设每个时间标签占据80px
			// 将当前时间位置转换为滚动距离，使当前时间显示在左侧约20%的位置
			const timeLabelWidth = 80;
			const startHour = parseInt(this.data.timeLabels[0]);
			const currentHourLabelIndex = hours - startHour;
			const scrollLeft = Math.max(0, (currentHourLabelIndex * timeLabelWidth) - (timeLabelWidth * 0.5));

			this.setData({
				showCurrentTimeLine: true,
				currentTimePosition: position,
				timelineScrollLeft: scrollLeft
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
			wx.setStorageSync(`rotation_${today}`, list.map(item => item._id));
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
					_id: '', // 重置 ID
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
			const { id: _id, reservation, settled } = e.currentTarget.dataset;

			let itemList: string[];

			if (reservation) {
				itemList = ['编辑', '到店', '取消预约'];
			} else {
				// 已结算的单据显示"修改结算"，未结算显示"结算"
				itemList = settled ? ['编辑', '修改结算'] : ['编辑', '结算'];
			}

			wx.showActionSheet({
				itemList,
				success: (res) => {
					const action = itemList[res.tapIndex];
					if (action === '编辑') {
						if (reservation) {
							this.editReservation(_id);
						} else {
							wx.navigateTo({ url: `/pages/index/index?editId=${_id}` });
						}
					} else if (action === '到店') {
						this.handleArrival(_id);
					} else if (action === '取消预约') {
						this.cancelReservation(_id);
					} else if (action === '结算' || action === '修改结算') {
						this.openSettlement(_id);
					}
				}
			});
		},

		// 处理到店操作
		async handleArrival(reserveId: string) {
			this.setData({ loading: true, loadingText: '加载中...' });
			try {
				const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
				if (!record) {
					wx.showToast({ title: '预约不存在', icon: 'none' });
					return;
				}

				const reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
					date: record.date,
					customerName: record.customerName,
					startTime: record.startTime,
					project: record.project
				});

				if (reservations.length > 1) {
					const reserveIds = reservations.map(r => r._id).join(',');
					wx.navigateTo({ url: `/pages/index/index?reserveIds=${reserveIds}` });
				} else {
					wx.navigateTo({ url: `/pages/index/index?reserveId=${reserveId}` });
				}
			} catch (error) {
				console.error('加载预约失败:', error);
				wx.showToast({ title: '加载失败', icon: 'none' });
			} finally {
				this.setData({ loading: false });
			}
		},

		// 编辑预约
		async editReservation(_id: string) {
			this.setData({ loading: true, loadingText: '加载中...' });
			try {
				const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id);
				if (record) {
					const selectedTechnicians: Array<{ _id: string; name: string; phone: string; }> = [];
					if (record.technicianId && record.technicianName) {
						const staff = this.data.staffAvailability.find(s => s._id === record.technicianId);
						if (staff) {
							selectedTechnicians.push({ ...staff });
						}
					}
					this.setData({
						showReserveModal: true,
						reserveForm: {
							_id: record._id,
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

				const projectDuration = parseProjectDuration(project) || 60;

				const res = await wx.cloud.callFunction({
					name: 'getAvailableTechnicians',
					data: {
						date: date,
						currentTime: startTime,
						projectDuration: projectDuration,
						currentReservationIds: []
					}
				});

				if (!res.result || typeof res.result !== 'object') {
					throw new Error('获取技师列表失败');
				}

				if (res.result.code === 0) {
					const list = res.result.data as StaffAvailability[];

					const selectedTechnicianIds = this.data.reserveForm.selectedTechnicians.map(t => t._id);

					const staffAvailability = list.map(staff => ({
						...staff,
						isSelected: selectedTechnicianIds.includes(staff._id)
					}));

					this.setData({ staffAvailability });
				} else {
					wx.showToast({
						title: res.result.message || '获取技师列表失败',
						icon: 'none'
					});
				}
			} catch (error) {
				console.error('检查技师可用性失败:', error);
				wx.showToast({
					title: '获取技师列表失败',
					icon: 'none'
				});
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
				this.setData({ reserveForm });
				// 触发顾客匹配
				if (field === 'customerName' || field === 'phone') {
					this.searchCustomer();
				}
			}
		},

		selectReserveTechnician(e: WechatMiniprogram.CustomEvent) {
			const { _id, technician: name, occupied, reason, phone } = e.detail;
			if (occupied) {
				wx.showToast({ title: reason || '该技师在此时段已有安排', icon: 'none', duration: 2500 });
				return;
			}

			// 多选逻辑：切换选中状态
			const selectedTechnicians = [...this.data.reserveForm.selectedTechnicians];
			const existingIndex = selectedTechnicians.findIndex(t => t._id === _id);

			if (existingIndex !== -1) {
				// 已选中，取消选择
				selectedTechnicians.splice(existingIndex, 1);
			} else {
				// 未选中，添加
				selectedTechnicians.push({ _id, name, phone });
			}

			// 更新 staffAvailability 的 isSelected 状态
			const staffAvailability = this.data.staffAvailability.map(staff => ({
				...staff,
				isSelected: selectedTechnicians.some(t => t._id === staff._id)
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
			// 触发顾客匹配
			this.searchCustomer();
		},

		// 搜索匹配顾客
		async searchCustomer() {
			const { reserveForm } = this.data;

			const currentSurname = reserveForm.customerName;
			const currentGender = reserveForm.gender;
			const currentPhone = reserveForm.phone;

			// 如果没有输入任何信息，清除匹配
			if (!currentSurname && !currentPhone) {
				this.setData({
					matchedCustomer: null,
					matchedCustomerApplied: false
				});
				return;
			}

			try {
				const res = await wx.cloud.callFunction({
					name: 'matchCustomer',
					data: {
						surname: currentSurname,
						gender: currentGender,
						phone: currentPhone
					}
				});
				if (!res.result || typeof res.result !== 'object') {
					throw new Error('匹配顾客失败');
				}
				if (res.result.code === 0 && res.result.data) {
					this.setData({
						matchedCustomer: res.result.data,
						matchedCustomerApplied: false
					});
				} else {
					this.setData({
						matchedCustomer: null,
						matchedCustomerApplied: false
					});
				}
			} catch (error) {
				console.error('匹配顾客失败:', error);
				this.setData({
					matchedCustomer: null,
					matchedCustomerApplied: false
				});
			}
		},

		// 应用匹配的顾客信息
		applyMatchedCustomer() {
			const { matchedCustomer } = this.data;

			if (!matchedCustomer) return;

			const updates: any = {
				'reserveForm.customerName': matchedCustomer.name.replace(/先生|女士/g, ''),
				'reserveForm.gender': matchedCustomer.name.endsWith('女士') ? 'female' : 'male',
			};

			if (matchedCustomer.phone) {
				updates['reserveForm.phone'] = matchedCustomer.phone;
			}

			if (matchedCustomer.responsibleTechnician) {
				const technicianName = matchedCustomer.responsibleTechnician;
				const staffAvailability = this.data.staffAvailability;
				if (staffAvailability && staffAvailability.length > 0) {
					const matchedStaff = staffAvailability.find(s => s.name === technicianName);
					if (matchedStaff) {
						updates['reserveForm.selectedTechnicians'] = [{ _id: matchedStaff._id, name: matchedStaff.name }];
						const updatedStaffAvailability = staffAvailability.map(s => ({
							...s,
							isSelected: s._id === matchedStaff._id
						}));
						updates['staffAvailability'] = updatedStaffAvailability;
					}
				}
			}

			this.setData({
				...updates,
				matchedCustomerApplied: true
			});

			wx.showToast({
				title: '已应用顾客信息',
				icon: 'success'
			});
		},

		// 清除匹配的顾客信息
		clearMatchedCustomer() {
			this.setData({
				matchedCustomer: null,
				matchedCustomerApplied: false
			});
		},

		async confirmReserve() {
			const { reserveForm } = this.data;

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
				if (reserveForm._id) {
					const firstTech = reserveForm.selectedTechnicians[0];
					const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: firstTech?._id || '',
						technicianName: firstTech?.name || '',
						startTime: reserveForm.startTime,
						endTime: endTime
					};
					const success = await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, reserveForm._id, record);
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
					const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
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
					const success = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
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
					const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
						date: reserveForm.date,
						customerName: reserveForm.customerName || '',
						gender: reserveForm.gender,
						phone: reserveForm.phone,
						project: reserveForm.project || '待定',
						technicianId: tech._id,
						technicianName: tech.name,
						startTime: reserveForm.startTime,
						endTime: endTime
					};
					const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
					if (insertResult) {
						successCount++;
					}
				}

				if (successCount === technicians.length) {
					// 查询技师手机号信息
					const staffList = await cloudDb.find<StaffInfo>(Collections.STAFF, {
						status: 'active'
					});
					const staffMap = new Map(staffList.map(s => [s._id, s]));

					// 构建技师信息（包含手机号）
					const techniciansWithPhone = technicians.map(t => ({
						_id: t._id,
						name: t.name,
						phone: staffMap.get(t._id)?.phone || ''
					}));

					// 显示推送确认弹窗
					this.setData({
						'pushModal.show': true,
						'pushModal.type': 'create',
						'pushModal.reservationData': {
							customerName: reserveForm.customerName || '',
							gender: reserveForm.gender,
							date: reserveForm.date,
							startTime: reserveForm.startTime,
							endTime: endTime,
							project: reserveForm.project || '待定',
							technicians: techniciansWithPhone
						}
					});

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
		async cancelReservation(_id: string) {
			wx.showModal({
				title: '确认取消',
				content: '确定要取消此预约吗？',
				confirmText: '确定',
				cancelText: '再想想',
				success: async (res) => {
					if (res.confirm) {
						this.setData({ loading: true, loadingText: '取消中...' });
						try {
							const reservation = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id);

							if (reservation) {
								const success = await cloudDb.deleteById(Collections.RESERVATIONS, _id);

								if (success) {
									await this.loadData();

									if (reservation.technicianId) {
										const staff = await cloudDb.findById<StaffInfo>(Collections.STAFF, reservation.technicianId);

										if (staff && staff.phone) {
											this.setData({
												'pushModal.show': true,
												'pushModal.type': 'cancel',
												'pushModal.reservationData': {
													customerName: reservation.customerName,
													gender: reservation.gender,
													date: reservation.date,
													startTime: reservation.startTime,
													endTime: reservation.endTime,
													project: reservation.project,
													technicians: [{
														_id: reservation.technicianId,
														name: reservation.technicianName,
														phone: staff.phone
													}]
												},
												loading: false
											});

											return;
										}
									}

									wx.showToast({ title: '已取消预约', icon: 'success' });
								} else {
									wx.showToast({ title: '取消失败', icon: 'none' });
								}
							} else {
								wx.showToast({ title: '预约不存在', icon: 'none' });
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
		async openSettlement(_id: string) {
			try {
				const today = this.data.selectedDate || formatDate(new Date());
				const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
				const record = records.find(r => r._id === _id) || null;

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
								this.loadSettlement(_id, record);
							}
						}
					});
				} else {
					this.loadSettlement(_id, record);
				}
			} catch (error) {
				console.error('打开结算失败:', error);
				wx.showToast({ title: '加载失败', icon: 'none' });
			}
		},

		// 加载结算信息
		loadSettlement(_id: string, record: ConsultationRecord) {
			const app = getApp<IAppOption>();
			const projects = app.globalData.projects || [];
			const currentProject = projects.find((p: Project) => p.name === record.project);

			let originalPrice = 0;
			if (currentProject && currentProject.price) {
				originalPrice = currentProject.price;
			}

			const paymentMethods = this.data.paymentMethods.map(m => ({
				...m,
				selected: false,
				amount: '',
				couponCode: ''
			}));

			if (record.settlement) {
				record.settlement.payments.forEach(payment => {
					const methodIndex = paymentMethods.findIndex(m => m.key === payment.method);
					if (methodIndex !== -1) {
						paymentMethods[methodIndex].selected = true;
						paymentMethods[methodIndex].amount = payment.amount.toString();
						paymentMethods[methodIndex].couponCode = payment.couponCode || '';
					}
				});
				this.calculateTotalAmount(paymentMethods);
			} else if (record.couponPlatform === 'membership') {
				const membershipIndex = paymentMethods.findIndex(m => m.key === 'membership');
				if (membershipIndex !== -1) {
					paymentMethods[membershipIndex].selected = true;
					paymentMethods[membershipIndex].amount = '1';
				}
				this.calculateTotalAmount(paymentMethods);
			}

			this.setData({
				showSettlementModal: true,
				settlementRecordId: _id,
				settlementCouponCode: record.settlement?.couponCode || record.couponCode || '',
				projectOriginalPrice: originalPrice,
				paymentMethods
			});
		},

		// 关闭结算弹窗
		closeSettlementModal() {
			this.setData({ showSettlementModal: false });
		},

		// 计算组合支付总额
		calculateTotalAmount(paymentMethods: PaymentMethodItem[]) {
			let total = 0;
			paymentMethods.forEach(method => {
				if (method.selected && method.key !== 'membership' && method.key !== 'free') {
					const amount = parseFloat(method.amount);
					if (!isNaN(amount) && amount > 0) {
						total += amount;
					}
				}
			});
			this.setData({ totalSettlementAmount: total });
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
			this.calculateTotalAmount(paymentMethods);
		},

		// 输入支付金额
		onPaymentAmountInput(e: WechatMiniprogram.CustomEvent) {
			const { index } = e.currentTarget.dataset;
			const { value } = e.detail;
			const paymentMethods = this.data.paymentMethods;
			paymentMethods[index].amount = value;
			this.setData({ paymentMethods });
			this.calculateTotalAmount(paymentMethods);
		},

		// 输入支付方式券码
		onPaymentCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
			const { index } = e.currentTarget.dataset;
			const { value } = e.detail;
			const paymentMethods = this.data.paymentMethods;
			paymentMethods[index].couponCode = value;
			this.setData({ paymentMethods });
		},

		// 输入券码
		onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
			this.setData({ settlementCouponCode: e.detail.value });
		},

		// 确认结算
		async confirmSettlement() {
			const { settlementRecordId, paymentMethods, settlementCouponCode } = this.data;

			const selectedPayments = paymentMethods.filter(m => m.selected);

			if (selectedPayments.length === 0) {
				wx.showToast({ title: '请选择支付方式', icon: 'none' });
				return;
			}

			this.setData({ loading: true, loadingText: '结算中...' });
			try {
				const today = this.data.selectedDate || formatDate(new Date());
				const allRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
				const target = allRecords.find(r => r._id === settlementRecordId);

				if (!target) {
					wx.showToast({ title: '未找到该单据', icon: 'none' });
					return;
				}

				const payments: PaymentItem[] = [];
				let totalAmount = 0;

				for (const method of selectedPayments) {
					if (method.key === 'free') {
						payments.push({ method: method.key as PaymentMethod, amount: 0, couponCode: method.couponCode || settlementCouponCode });
						continue;
					}

					const amount = parseFloat(method.amount);
					if (!method.amount || isNaN(amount) || amount <= 0) {
						wx.showToast({ title: `请输入${method.label}的有效${method.key === 'membership' ? '次数' : '金额'}`, icon: 'none' });
						return;
					}

					payments.push({ method: method.key as PaymentMethod, amount, couponCode: method.couponCode || settlementCouponCode });
					if (method.key !== 'membership') {
						totalAmount += amount;
					}
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
					const allMemberships = await cloudDb.getAll<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP);
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

					await cloudDb.updateById<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP, customerMembership._id, {
						remainingTimes: newRemaining
					});

					await cloudDb.insert<MembershipUsageRecord>(Collections.MEMBERSHIP_USAGE, {
						cardId: customerMembership.cardId,
						cardName: customerMembership.cardName,
						date: today,
						customerName: target.surname,
						project: target.project,
						technician: target.technician,
						room: target.room,
						consultationId: target._id
					});
				}

				await cloudDb.updateById(Collections.CONSULTATION, settlementRecordId, {
					settlement: settlement,
					updatedAt: now.toISOString()
				});

				wx.showToast({ title: '结算成功', icon: 'success' });
				this.closeSettlementModal();
				await this.loadData();
			} catch (error) {
				console.error('结算失败:', error);
				wx.showToast({ title: '结算失败', icon: 'none' });
			} finally {
				this.setData({ loading: false });
			}
		},

		// 推送弹窗 - 取消
		onPushModalCancel() {
			this.setData({
				'pushModal.show': false,
				'pushModal.reservationData': null
			});
		},

		// 推送弹窗 - 确认推送
		async onPushModalConfirm() {
			const { pushModal } = this.data;
			const { reservationData, type } = pushModal;

			if (!reservationData) {
				return;
			}

			this.setData({ 'pushModal.loading': true });

			try {
				const genderLabel = reservationData.gender === 'male' ? '先生' : '女士';
				const customerInfo = `${reservationData.customerName}${genderLabel}`;
				const technicianMentions = reservationData.technicians
					.map(t => t.phone ? `<@${t.phone}>` : t.name)
					.join(' ');
				const technicianNames = reservationData.technicians
					.map(t => t.name)
					.join('、');

				let message: string;

				if (type === 'cancel') {
					message = `【🚫 预约**取消**提醒】

顾客：${customerInfo}
日期：${reservationData.date}
时间：${reservationData.startTime} - ${reservationData.endTime}
项目：${reservationData.project}
技师：${technicianNames}

${technicianMentions}`;
				} else {
					message = `【⏰ 新预约提醒】

顾客：${customerInfo}
日期：${reservationData.date}
时间：**${reservationData.startTime} - ${reservationData.endTime}**
项目：${reservationData.project}
技师：**${technicianNames}**

${technicianMentions}`;
				}


				const res = await wx.cloud.callFunction({
					name: 'sendWechatMessage',
					data: {
						content: message
					}
				});

				if (res.result && typeof res.result === 'object') {
					const result = res.result as { code: number; message?: string };
					if (result.code === 0) {
						wx.showToast({ title: '推送成功', icon: 'success', duration: 2000 });
						setTimeout(() => {
							this.onPushModalCancel();
						}, 1500);
					} else {
						wx.showToast({ title: '推送失败，请重试', icon: 'none' });
					}
				} else {
					wx.showToast({ title: '推送失败，请重试', icon: 'none' });
				}
			} catch (error) {
				console.error('推送到企业微信失败:', error);
				wx.showToast({ title: '推送失败，请重试', icon: 'none' });
			} finally {
				this.setData({ 'pushModal.loading': false });
			}
		}
	}
});

