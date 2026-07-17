import { cloudDb, Collections } from '../../utils/cloud-db';
import { SHIFT_END_TIME, SHIFT_START_TIME, ShiftType } from '../../utils/constants';
import { loadingService, LockKeys } from '../../utils/loading-service';
import { getCurrentDate } from '../../utils/util';
import { authManager } from '../../utils/auth';

const app = getApp<IAppOption>();

const TIMELINE_HOUR_WIDTH = 90;
const SPARE_TIME = 20; // 20休息时间;

interface TimelineData {
	timeLabels: string[]
	staffTimeline: StaffTimelineItem[]
	showCurrentTimeLine: boolean
	currentTimePosition: string
	scrollLeft: number
	loading: boolean
	loadingText: string
	_lastLoadKey: string
}

interface StaffTimelineItem {
	_id: string
	name: string
	gender: 'male' | 'female';
	shift: ShiftType
	blocks: TimeBlock[]
	availableSlots: AvailableSlot[]
	highlighted?: boolean
	rotationCount: number // 当日轮钟数量
	rotationRank: number // 轮牌序号（1-based）
	rotationOrderSize: number // 轮牌总人数
}

interface TimeBlock {
	_id: string
	startTime: string
	endTime: string
	left: string
	width: string
	customerName: string
	phone: string
	gender: 'male' | 'female';
	room: string
	project: string
	isReservation: boolean
	isSettled: boolean
	isInProgress: boolean
	isClockIn: boolean
	isExtraTime: boolean
	extraTime: number
	technician: string
	requirement: string;
	rearrangeConflict?: boolean
	isCancelled?: boolean
	groupKey: string
	groupColorIndex: number
	groupSize: number
}

function parseGenderRequirement(rsv: Partial<ReservationRecord>): string {
	let res = '';
	if(rsv.requirementType !== 'gender'){
		return res;
	}
	if (rsv.requiredMaleCount) res += `${rsv.requiredMaleCount}男`;
	if (rsv.requiredFemaleCount) res += `${rsv.requiredFemaleCount}女`;
	return res;
}

Component({
	properties: {
		selectedDate: {
			type: String,
			value: ''
		},
		staffId: {
			type: String,
			value: ''
		},
		refreshTrigger: {
			type: Number,
			value: 0,
			observer: function (newVal: number) {
				if (newVal > 0) {
					this.loadAllStaffTimelineData(this.properties.staffId);
				}
			}
		},
		readonly: {
			type: Boolean,
			value: false
		},
		rotationOrder: {
			type: Array,
			value: [] as string[]  // 轮牌顺序的 staffId 数组
		},
		canAdjustRotation: {
			type: Boolean,
			value: false  // 是否允许调整轮牌
		}
	},

	data: {
		timeLabels: ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '00', '01'],
		staffTimeline: [],
		showCurrentTimeLine: false,
		currentTimePosition: '0%',
		scrollLeft: 0,
		loading: false,
		loadingText: '加载数据...',
		TIMELINE_HOUR_WIDTH,
		_lastLoadKey: '' // 用于防止重复加载
	} as TimelineData,

	observers: {
		'selectedDate, staffId': function (selectedDate: string, staffId: string) {
			if (!selectedDate) return;
			// 防止与pageLifetimes.show重复触发
			const loadKey = `${selectedDate}-${staffId || ''}`;
			if (this.data._lastLoadKey === loadKey) return;
			this.loadAllStaffTimelineData(staffId);
		}
	},
	pageLifetimes: {
		show: function () {
			const selectedDate = this.properties.selectedDate;
			const staffId = this.properties.staffId || '';
			const loadKey = `${selectedDate}-${staffId}`;
			// 防止与observers重复触发
			if (this.data._lastLoadKey === loadKey) return;
			this.loadAllStaffTimelineData();
		}
	},

	methods: {
		toMinutesFromTimelineStart(h: number, m: number): number {
			const timelineStartHour = parseInt(this.data.timeLabels[0]);
			return h >= timelineStartHour
				? (h - timelineStartHour) * 60 + m
				: (h + 24 - timelineStartHour) * 60 + m;
		},

		timelineMinutesToTime(timelineMinutes: number): string {
			const timelineStartHour = parseInt(this.data.timeLabels[0]);
			const totalMinutes = timelineStartHour * 60 + timelineMinutes;
			const h = totalMinutes >= 24 * 60 ? (totalMinutes - 24 * 60) : totalMinutes;
			const hh = String(Math.floor(h / 60)).padStart(2, '0');
			const mm = String(Math.floor(h % 60)).padStart(2, '0');
			return `${hh}:${mm}`;
		},

		loadAllStaffTimelineData(highlightStaffId?: string) {
			// 更新加载标识，防止重复请求
			const selectedDate = this.properties.selectedDate || getCurrentDate();
			const loadKey = `${selectedDate}-${highlightStaffId || ''}`;
			this.setData({ _lastLoadKey: loadKey });

			loadingService.withLoading(this, async () => {
				const today = selectedDate;
				const todayStr = getCurrentDate();
				const isToday = today === todayStr;

				const todayRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
				const activeRecords = todayRecords.filter(r => !r.isVoided);
				const reservations = (await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, { date: today, status: 'active' }));

				let cancelledReservations: ReservationRecord[] = [];
				if (authManager.isAdmin()) {
					cancelledReservations = (await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, { date: today, status: 'cancelled' }));
				}

				const allSchedules = await cloudDb.getAll<ScheduleRecord>(Collections.SCHEDULE);
				const allStaff = await app.getStaffs();
				const activeStaff = allStaff.filter(s => s.status === 'active'&&(s.role === 'technician'||s.role === 'cashier'));
				const scheduledStaff = allSchedules.map(s => s.staffId);
				const activeStaffList = activeStaff.filter(s => scheduledStaff.includes(s._id));

				const staffTimeline: StaffTimelineItem[] = [];

				for (const staff of activeStaffList) {
					const schedule = allSchedules.find(s => s.date === today && s.staffId === staff._id);
					const shift = schedule ? schedule.shift : 'morning';

					if (shift !== 'morning' && shift !== 'evening' && shift !== 'overtime') {
						continue;
					}

					const staffRecords = activeRecords.filter(r => r.technician === staff.name);
					const staffReservations = reservations.filter(r => r.technicianName === staff.name || r.technicianId === staff._id);
					const staffCancelledReservations = cancelledReservations.filter(r => r.technicianName === staff.name || r.technicianId === staff._id);

					const rawBlocks = [
						...staffRecords.map(r => ({ ...r, isReservation: false })),
						...staffReservations.map(r => ({
							_id: r._id,
							surname: r.customerName,
							phone: r.phone || '',
							gender: r.gender,
							project: r.project,
							room: '预约',
							date: r.date,
							customerName: r.customerName,
							status: r.status,
							startTime: r.startTime,
							endTime: r.endTime,
							extraTime: 0,
							isClockIn: r.isClockIn || false,
							isReservation: true,
							technician: r.technicianName,
							requirementType: r.requirementType,
							requiredMaleCount: r.requiredMaleCount,
							requiredFemaleCount: r.requiredFemaleCount,
							groupKey: r.groupKey || ''
						})),
						...staffCancelledReservations.map(r => ({
							_id: r._id,
							surname: r.customerName,
							phone: r.phone || '',
							gender: r.gender,
							project: r.project,
							room: '已取消',
							date: r.date,
							customerName: r.customerName,
							status: r.status,
							startTime: r.startTime,
							endTime: r.endTime,
							extraTime: 0,
							isClockIn: r.isClockIn || false,
							isReservation: true,
							isCancelled: true,
							technician: r.technicianName,
							requirementType: r.requirementType,
							requiredMaleCount: r.requiredMaleCount,
							requiredFemaleCount: r.requiredFemaleCount,
							groupKey: r.groupKey || ''
						}))
					];

					rawBlocks.sort((a, b) => {
						const [aH, aM] = a.startTime.split(':').map(Number);
						const [bH, bM] = b.startTime.split(':').map(Number);
						return (aH * 60 + aM) - (bH * 60 + bM);
					});

					const blocks: TimeBlock[] = rawBlocks.map(r => {
						const [startH, startM] = r.startTime.split(':').map(Number);
						const [endH, endM] = r.endTime.split(':').map(Number);

						const startMinutes = this.toMinutesFromTimelineStart(startH, startM);
						const endMinutes = this.toMinutesFromTimelineStart(endH, endM);
						const duration = endMinutes - startMinutes;

						const isSettled = !r.isReservation && (r as ConsultationRecord).settlement && Object.keys((r as ConsultationRecord).settlement!).length > 0 || false;

						const now = new Date();
						const nowMinutes = this.toMinutesFromTimelineStart(now.getHours(), now.getMinutes());
						const isInProgress = isToday && nowMinutes >= startMinutes && nowMinutes < endMinutes;
						return {
							_id: r._id,
							customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
							phone: r.phone || '',
							gender: r.gender,
							startTime: r.startTime,
							endTime: r.endTime,
							project: r.project,
							room: r.room,
							left: (startMinutes / this.data.timeLabels.length / 60 * 100) + '%',
							width: (duration / this.data.timeLabels.length / 60 * 100) + '%',
							isReservation: r.isReservation,
							isSettled,
							isInProgress,
							isClockIn: r.isClockIn || false,
							extraTime: (r as ConsultationRecord).extraTime || 0,
							isExtraTime: (r as ConsultationRecord).isExtraTime || false,
							technician: r.technician!,
							requirement: parseGenderRequirement(r as Update<ReservationRecord>),
							rearrangeConflict: (r as Update<ReservationRecord>).rearrangeConflict || false,
							isCancelled: (r as any).isCancelled || false,
							groupKey: r.isReservation ? (r as any).groupKey || '' : '',
							groupColorIndex: 0,
							groupSize: 1,
						};
					});

					const activeBlocks = blocks.filter(b => !b.isCancelled);
					const availableSlots = this.calculateAvailableSlotsBetweenBlocks(activeBlocks, shift);
					
					// 计算当日轮钟数量（非点钟且非预约的记录）
					const rotationCount = blocks.filter(b => !b.isClockIn && !b.isReservation && !b.isCancelled&&!b.isExtraTime).length;
					
					staffTimeline.push({
						_id: staff._id,
						name: staff.name,
						gender: staff.gender,
						shift,
						blocks,
						availableSlots,
						highlighted: highlightStaffId === staff._id,
						rotationCount,
						rotationRank: 0,
						rotationOrderSize: 0
					});
				}
				// 分配关联预约组颜色
				const groupKeyColorMap = new Map<string, { colorIndex: number; size: number }>();
				let colorIdx = 0;
				for (const staffItem of staffTimeline) {
					for (const block of staffItem.blocks) {
						if (block.groupKey) {
							if (!groupKeyColorMap.has(block.groupKey)) {
								groupKeyColorMap.set(block.groupKey, { colorIndex: colorIdx % 6, size: 0 });
								colorIdx++;
							}
							groupKeyColorMap.get(block.groupKey)!.size++;
						}
					}
				}
				for (const staffItem of staffTimeline) {
					for (const block of staffItem.blocks) {
						if (block.groupKey && groupKeyColorMap.has(block.groupKey)) {
							const groupInfo = groupKeyColorMap.get(block.groupKey)!;
							block.groupColorIndex = groupInfo.colorIndex;
							block.groupSize = groupInfo.size;
						}
					}
				}
				staffTimeline.sort((a) => a.gender === 'male' ? 1 : -1);

				// 按轮牌顺序重排
				const rotationOrder = this.properties.rotationOrder as string[];
				if (rotationOrder.length > 0) {
					const orderMap = new Map(rotationOrder.map((id, i) => [id, i]));
					staffTimeline.sort((a, b) => {
						const posA = orderMap.has(a._id) ? orderMap.get(a._id)! : 999;
						const posB = orderMap.has(b._id) ? orderMap.get(b._id)! : 999;
						return posA - posB;
					});
				}

				// 分配轮牌序号
				const totalSize = staffTimeline.length;
				staffTimeline.forEach((item, i) => {
					item.rotationRank = i + 1;
					item.rotationOrderSize = totalSize;
				});

				let currentTimePosition = '0%';
				let showCurrentTimeLine = false;
				if (isToday) {
					const now = new Date();
					const timeInTimeline = this.toMinutesFromTimelineStart(now.getHours(), now.getMinutes());
					const totalTimelineMinutes = this.data.timeLabels.length * 60;
					if (timeInTimeline >= 0 && timeInTimeline <= totalTimelineMinutes) {
						currentTimePosition = (timeInTimeline / totalTimelineMinutes * 100) + '%';
						showCurrentTimeLine = true;
						this.setData({ scrollLeft: timeInTimeline * (TIMELINE_HOUR_WIDTH / 60) });
					} else {
						// 当前时间不在时间轴范围内，显示在起始位置
						currentTimePosition = '0%';
						showCurrentTimeLine = true;
						this.setData({ scrollLeft: 0 });
					}
				}

				this.setData({
					staffTimeline,
					showCurrentTimeLine,
					currentTimePosition,
				});
			}, {
				loadingText: '加载数据...',
				lockKey: LockKeys.LOAD_TIMELINE_DATA,
				errorText: '加载数据失败'
			});
		},

		calculateAvailableSlotsBetweenBlocks(blocks: TimeBlock[], shift: ShiftType): AvailableSlot[] {
			const availableSlots: AvailableSlot[] = [];
			const RESERVE_GAP_MINUTES = 60; // 可预约时段与下一个预约之间至少保留60分钟（用于排钟）

			/**
			 * 记录一个可预约时段
			 * @param startTimelineMinutes 时段起点（timeline 分钟）
			 * @param rawEndTimelineMinutes 时段原始结束点（下一个 block 起点或班次结束）
			 * @param isShiftEnd 时段结束是否为班次结束（是则不扣减间隔）
			 */
			const pushSlot = (startTimelineMinutes: number, rawEndTimelineMinutes: number, isShiftEnd: boolean): void => {
				// 非班次结束：为下一个预约留出排钟间隔
				const effectiveEnd = isShiftEnd
					? rawEndTimelineMinutes
					: rawEndTimelineMinutes - RESERVE_GAP_MINUTES;

				const gapMinutes = effectiveEnd - startTimelineMinutes;
				if (gapMinutes <= 45) return;

				const startTime = this.timelineMinutesToTime(startTimelineMinutes);
				const endTime = this.timelineMinutesToTime(effectiveEnd);
				const left = (startTimelineMinutes / this.data.timeLabels.length / 60 * 100) + '%';
				const width = (gapMinutes / this.data.timeLabels.length / 60 * 100) + '%';
				availableSlots.push({
					left,
					width,
					startTime,
					endTime,
					displayText: `${startTime}-${endTime}`,
					durationMinutes: gapMinutes
				});
			};

			const now = new Date();
			const todayStr = getCurrentDate();
			const selectedDate = this.properties.selectedDate;
			const isToday = selectedDate === todayStr;

			const nowTimelineMinutes = this.toMinutesFromTimelineStart(now.getHours(), now.getMinutes());

			const shiftStartTime = SHIFT_START_TIME[shift];
			const shiftEndTime = SHIFT_END_TIME[shift];

			if (!shiftStartTime || !shiftEndTime) {
				return availableSlots;
			}

			const [shiftStartH, shiftStartM] = shiftStartTime.split(':').map(Number);
			const [shiftEndH, shiftEndM] = shiftEndTime.split(':').map(Number);
			const shiftStartTimelineMinutes = this.toMinutesFromTimelineStart(shiftStartH, shiftStartM);
			const shiftEndTimelineMinutes = this.toMinutesFromTimelineStart(shiftEndH, shiftEndM);

			// --- 统一算法：收集所有时间点，划分区间，过滤占用区间 ---
			// 1. 收集所有 block 的 start/end + 班次起止
			const timePointsSet = new Set<number>([shiftStartTimelineMinutes, shiftEndTimelineMinutes]);
			for (const block of blocks) {
				const [sH, sM] = block.startTime.split(':').map(Number);
				const [eH, eM] = block.endTime.split(':').map(Number);
				const sTM = this.toMinutesFromTimelineStart(sH, sM);
				const eTM = this.toMinutesFromTimelineStart(eH, eM);
				// clamp 到班次范围
				if (sTM >= shiftStartTimelineMinutes && sTM <= shiftEndTimelineMinutes) timePointsSet.add(sTM);
				if (eTM >= shiftStartTimelineMinutes && eTM <= shiftEndTimelineMinutes) timePointsSet.add(eTM);
			}
			const sortedPoints = [...timePointsSet].sort((a, b) => a - b);

			// 2. 遍历区间，标记被占用区间
			for (let i = 1; i < sortedPoints.length; i++) {
				const segStart = sortedPoints[i - 1];
				const segEnd = sortedPoints[i];
				let occupied = false;
				for (const block of blocks) {
					const [sH, sM] = block.startTime.split(':').map(Number);
					const [eH, eM] = block.endTime.split(':').map(Number);
					const bStart = this.toMinutesFromTimelineStart(sH, sM);
					const bEnd = this.toMinutesFromTimelineStart(eH, eM);
					// 区间完全在 block 内则为占用
					if (segStart >= bStart && segEnd <= bEnd) { occupied = true; break; }
				}

				if (occupied) continue;
				const gapMinutes = segEnd - segStart;
				if (gapMinutes <= 0) continue;

				// 今天：跳过已结束的区间
				if (isToday && segEnd <= nowTimelineMinutes) continue;

				// 今天：区间起点修正为 now（不晚于 now）
				const effectiveStart = isToday ? Math.max(segStart, nowTimelineMinutes) : segStart;

				// 判断是否是班次结束（最后一个点 = 下班时间）
				const isShiftEnd = segEnd === shiftEndTimelineMinutes;
				pushSlot(effectiveStart+SPARE_TIME, segEnd, isShiftEnd);
			}

			return availableSlots;
		},

		onBlockClick(e: WechatMiniprogram.CustomEvent) {
			if (this.data.readonly) return;

			const { id, reservation, settled, inprogress, cancelled } = e.currentTarget.dataset;
			if (cancelled) return;

			this.triggerEvent('blockclick', {
				id,
				reservation,
				settled,
				inprogress
			});
		},

		onSlotClick(e: WechatMiniprogram.CustomEvent) {
			const { staffname, slots, staffid } = e.currentTarget.dataset;
			this.triggerEvent('copyslot', {
				staffName: staffname,
				slots,
				staffId: staffid
			});
		},

		onAdjustRotation(e: WechatMiniprogram.CustomEvent) {
			const { index, direction } = e.currentTarget.dataset;
			this.triggerEvent('adjustrotation', {
				index,
				direction
			});
		},

		onResetRotation() {
			this.triggerEvent('resetrotation');
		},

		onPushRotation() {
			this.triggerEvent('pushrotation');
		}
	}
});
