// data-loader.service.ts - Cashier 数据加载服务
import { cloudDb, Collections } from '../../../utils/cloud-db';
import { loadingService, LockKeys } from '../../../utils/loading-service';
import {
	getCurrentDate,
	getNextDate,
	getPreviousDate,
	formatTime,
	getMinutesDiff,
	earlierThan,
	laterOrEqualTo
} from '../../../utils/util';
import { DEFAULT_SHIFT, SHIFT_END_TIME, SHIFT_START_TIME, ShiftType } from '../../../utils/constants';
import type { CashierPage } from '../cashier.types';

const app = getApp<IAppOption>();

export class CashierDataLoaderService {
	private page: CashierPage;

	constructor(page: CashierPage) {
		this.page = page;
	}

	async loadProjects(): Promise<void> {
		const projects = app.globalData.projects || [];
		this.page.setData({ projects });
	}

	async loadInitialData(): Promise<void> {
		await loadingService.withLoading(this.page, async () => {
			const today = this.page.data.selectedDate || getCurrentDate();
			const currentTimeStr = formatTime(new Date(), false);
			const todayStr = getCurrentDate();
			const isToday = today === todayStr;

			// 并行获取所有基础数据
			const [allRooms, todayRecords, allStaff, technicianRes] = await Promise.all([
				app.getRooms(),
				cloudDb.getConsultationsByDate<ConsultationRecord>(today),
				app.getStaffs(),
				wx.cloud.callFunction({
					name: 'getAvailableTechnicians',
					data: {
						date: today,
						currentTime: currentTimeStr,
						projectDuration: 60,
						currentReservationIds: []
					}
				})
			]);

			// 计算房间占用状态
			const filteredRooms = allRooms.filter((r: Room) => r.status === 'normal');

			const rooms = filteredRooms.map((room) => {
				let occupiedRecords = todayRecords
					.filter(r => !r.isVoided && r.room === room.name)
					.map(r => ({
						customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
						technician: r.technician || '',
						startTime: r.startTime,
						endTime: r.endTime || ''
					}));

				// 只显示当前时间正在占用的记录（对于今天）
				if (isToday && currentTimeStr) {
					occupiedRecords = occupiedRecords.filter(r => {
						return laterOrEqualTo(currentTimeStr, r.startTime) && earlierThan(currentTimeStr, r.endTime);
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

			// 构建员工可用性数据
			let staffAvailability: StaffAvailability[] = [];
			if (technicianRes.result && typeof technicianRes.result === 'object') {
				const result = technicianRes.result as { code: number; data: StaffAvailability[] };
				if (result.code === 0 && result.data) {
					staffAvailability = result.data;
				}
			}

			// 准备日期选择器数据
			const dateSelector = {
				selectedDate: today,
				previousDate: getPreviousDate(today),
				nextDate: getNextDate(today),
				isToday: today === getCurrentDate()
			};

			// 获取当前日期的轮牌数据
			const { rotationList, quickReservationSlots } = await this.prepareRotationList(today);

			this.page.setData({
				rooms,
				activeStaffList: allStaff.filter(s => s.status === 'active'),
				staffAvailability,
				dateSelector,
				rotationList,
				quickReservationSlots,
				timelineRefreshTrigger: this.page.data.timelineRefreshTrigger + 1
			});
		}, {
			loadingText: '加载数据...',
			lockKey: LockKeys.LOAD_CASHIER_DATA,
			errorText: '加载数据失败'
		});
	}

	async loadTimelineData(): Promise<void> {
		const { pushModalLocked, pushModal } = this.page.data;
		
		// 只有在非推送确认弹窗状态下才显示loading
		const shouldShowLoading = !pushModalLocked && !pushModal?.show;
		if (shouldShowLoading) {
			this.page.setData({ loading: true, loadingText: '加载中...' });
		}
		
		try {
			const today = this.page.data.selectedDate || getCurrentDate();
			const dateSelector = {
				selectedDate: today,
				previousDate: getPreviousDate(today),
				nextDate: getNextDate(today),
				isToday: today === getCurrentDate()
			};

			// 更新轮牌列表并计算快速预约时段
			const { rotationList, quickReservationSlots } = await this.prepareRotationList(today);

			this.page.setData({
				dateSelector,
				rotationList,
				quickReservationSlots,
				timelineRefreshTrigger: this.page.data.timelineRefreshTrigger + 1
			});
		} finally {
			if (shouldShowLoading) {
				this.page.setData({ loading: false });
			}
		}
	}

	async prepareRotationList(today: string): Promise<{ rotationList: RotationItem[]; quickReservationSlots: { oneMale: Array<QuickReservation>; oneFemale: Array<QuickReservation>; twoMale: Array<QuickReservation>; twoFemale: Array<QuickReservation> } }> {
		const rotation = await app.getRotationQueue(today);
		if (!rotation || !rotation.staffList || rotation.staffList.length === 0) {
			return { rotationList: [], quickReservationSlots: { oneMale: [], oneFemale: [], twoMale: [], twoFemale: [] } };
		}

		const staffList = await app.getStaffs();
		const staffMap = new Map(staffList.map(s => [s._id, s]));

		const schedules = await cloudDb.getAll<ScheduleRecord>(Collections.SCHEDULE);
		const consultations = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
		const reservations = await cloudDb.getAll<ReservationRecord>(Collections.RESERVATIONS);

		const todaySchedules = schedules.filter(s => s.date === today);
		const scheduleMap = new Map(todaySchedules.map(s => [s.staffId, s]));

		const activeReservations = reservations.filter(r => r.date === today && r.status === 'active');

		const rotationList = rotation.staffList.map((item, index) => {
			const staff = staffMap.get(item.staffId);
			if (!staff || staff.status !== 'active') {
				return null;
			}

			const schedule = scheduleMap.get(item.staffId);
			const shift: ShiftType = schedule?.shift || DEFAULT_SHIFT;

			const staffConsultations = consultations.filter(c => c.technician === staff.name);
			const staffReservations = activeReservations.filter(r => r.technicianId === item.staffId || r.technicianName === staff.name);

			// 计算今日已服务时长
			let totalServiceMinutes = 0;
			staffConsultations.forEach(c => {
				totalServiceMinutes += getMinutesDiff(c.startTime, c.endTime);
			});

			const totalServiceHours = (totalServiceMinutes / 60).toFixed(1);

			// 计算下一个可用时间段
			const availableSlots = this.calculateAvailableSlots(
				staff.name,
				staffConsultations,
				staffReservations,
				getCurrentDate(),
				shift
			);

			return {
				_id: item.staffId,
				name: staff.name,
				avatar: staff.avatar,
				gender: staff.gender,
				shift,
				position: index + 1,
				availableSlots,
				totalServiceHours,
				reservationCount: staffReservations.length
			} as RotationItem;
		}).filter(Boolean) as RotationItem[];

		// 计算快速预约时段
		const quickReservationSlots = this.calculateQuickReservationSlots(rotationList, consultations, activeReservations, today);

		return { rotationList, quickReservationSlots };
	}

	private calculateAvailableSlots(
		staffName: string,
		activeRecords: ConsultationRecord[],
		reservations: ReservationRecord[],
		selectedDate: string,
		shift: ShiftType
	): string {
		const now = new Date();
		const todayStr = getCurrentDate();
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
			return `${startTime}-${shiftEnd}(${duration}分钟)`;
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
				availableSlots.push(`${actualStart}-${actualEnd}(${gap}分钟)`);
			}
		}

		if (availableSlots.length === 0) {
			return '已满';
		}

		return availableSlots.join(', ');
	}

	// 预加载技师可用性（供预约弹窗使用）
	async loadTechnicianAvailability(date: string, startTime: string, projectDuration: number, excludeReservationIds: string[] = []): Promise<StaffAvailability[]> {
		try {
			const res = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date,
					currentTime: startTime,
					projectDuration,
					currentReservationIds: excludeReservationIds
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; data: StaffAvailability[] };
				if (result.code === 0 && result.data) {
					return result.data;
				}
			}
			return [];
		} catch (error) {
			return [];
		}
	}

	private calculateQuickReservationSlots(
		rotationList: RotationItem[],
		allConsultations: ConsultationRecord[],
		allReservations: ReservationRecord[],
		selectedDate: string
	): { oneMale: Array<QuickReservation>; oneFemale: Array<QuickReservation>; twoMale: Array<QuickReservation>; twoFemale: Array<QuickReservation> } {
		const now = new Date();
		const currentMinutes = now.getHours() * 60 + now.getMinutes();
		const todayStr = getCurrentDate();
		const isToday = selectedDate === todayStr;

		const defaultProject = this.page.data.projects.length > 0 ? this.page.data.projects[0] : null;
		const defaultDuration = defaultProject ? (defaultProject.duration || 60) : 60;

		const staffByGender: { male: RotationItem[]; female: RotationItem[] } = { male: [], female: [] };
		rotationList.forEach(staff => {
			if (staff.gender === 'male') {
				staffByGender.male.push(staff);
			} else if (staff.gender === 'female') {
				staffByGender.female.push(staff);
			}
		});

		const staffOccupiedSlots = new Map<string, Array<{ start: number; end: number }>>();

		rotationList.forEach(staff => {
			const shift = staff.shift;
			const shiftStart = SHIFT_START_TIME[shift];
			const shiftEnd = SHIFT_END_TIME[shift];

			if (!shiftStart || !shiftEnd) {
				staffOccupiedSlots.set(staff._id, []);
				return;
			}

			const [startHour, startMinute] = shiftStart.split(':').map(Number);
			const [endHour, endMinute] = shiftEnd.split(':').map(Number);
			const shiftStartMinutes = startHour * 60 + startMinute;
			const shiftEndMinutes = endHour * 60 + endMinute;

			const occupiedSlots: Array<{ start: number; end: number }> = [];

			const staffConsultations = allConsultations.filter(c => c.technician === staff.name && !c.isVoided);
			const staffReservations = allReservations.filter(r => r.technicianId === staff._id || r.technicianName === staff.name);

			staffConsultations.forEach(record => {
				if (record.startTime && record.endTime) {
					const [sHour, sMinute] = record.startTime.split(':').map(Number);
					const [eHour, eMinute] = record.endTime.split(':').map(Number);
					occupiedSlots.push({
						start: sHour * 60 + sMinute,
						end: eHour * 60 + eMinute
					});
				}
			});

			staffReservations.forEach(reservation => {
				const [sHour, sMinute] = reservation.startTime.split(':').map(Number);
				const [eHour, eMinute] = reservation.endTime.split(':').map(Number);
				occupiedSlots.push({
					start: sHour * 60 + sMinute,
					end: eHour * 60 + eMinute
				});
			});

			occupiedSlots.sort((a, b) => a.start - b.start);

			const mergedSlots: Array<{ start: number; end: number }> = [];
			let current = occupiedSlots[0];

			for (let i = 1; i < occupiedSlots.length; i++) {
				const next = occupiedSlots[i];
				
				if (next.start <= current.end) {
					current.end = Math.max(current.end, next.end);
				} else {
					mergedSlots.push({ ...current });
					current = next;
				}
			}

			if (current) {
				mergedSlots.push({ ...current });
			}

			staffOccupiedSlots.set(staff._id, mergedSlots);
		});

		const findAllAvailableSlots = (staffList: RotationItem[], requiredCount: number): Array<QuickReservation> => {
			if (staffList.length < requiredCount) {
				return [];
			}

			const staffAvailableSlots = new Map<string, Array<{ start: number; end: number; duration: number }>>();

			staffList.forEach(staff => {
				const shift = staff.shift;
				const shiftStart = SHIFT_START_TIME[shift];
				const shiftEnd = SHIFT_END_TIME[shift];

				if (!shiftStart || !shiftEnd) {
					staffAvailableSlots.set(staff._id, []);
					return;
				}

				const [startHour, startMinute] = shiftStart.split(':').map(Number);
				const [endHour, endMinute] = shiftEnd.split(':').map(Number);
				const shiftStartMinutes = startHour * 60 + startMinute;
				const shiftEndMinutes = endHour * 60 + endMinute;

				let searchStart = shiftStartMinutes;
				if (isToday) {
					searchStart = Math.max(currentMinutes, shiftStartMinutes);
				}

				const occupiedSlots = staffOccupiedSlots.get(staff._id) || [];
				const availableSlots: Array<{ start: number; end: number; duration: number }> = [];

				let currentTime = searchStart;
				while (currentTime < shiftEndMinutes) {
					const activeOccupied = occupiedSlots.find(slot => slot.start <= currentTime && currentTime < slot.end);
					
					if (activeOccupied) {
						currentTime = activeOccupied.end;
						continue;
					}
					
					const nextOccupied = occupiedSlots.find(slot => slot.start > currentTime && slot.start < shiftEndMinutes);
					
					let slotEnd = shiftEndMinutes;
					if (nextOccupied) {
						slotEnd = Math.min(shiftEndMinutes, nextOccupied.start);
					}

					const duration = slotEnd - currentTime;
					if (duration >= 60) {
						availableSlots.push({
							start: currentTime,
							end: slotEnd,
							duration
						});
					}

					currentTime = slotEnd;
					if (nextOccupied) {
						currentTime = nextOccupied.end;
					}
				}

				staffAvailableSlots.set(staff._id, availableSlots);
			});

			if (requiredCount === 1) {
				const slotMap = new Map<string, string[]>();

				staffList.forEach(staff => {
					const slots = staffAvailableSlots.get(staff._id) || [];
					slots.forEach(slot => {
						const startHour = Math.floor(slot.start / 60);
						const startMinute = slot.start % 60;
						const endHour = Math.floor(slot.end / 60);
						const endMinute = slot.end % 60;
						const slotText = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}(${slot.duration}分钟)`;
						
						if (!slotMap.has(slotText)) {
							slotMap.set(slotText, []);
						}
						slotMap.get(slotText)!.push(staff.name);
					});
				});

				const allSlots = Array.from(slotMap.entries())
					.map(([time, staffNames]) => ({ time, staffNames }))
					.sort((a, b) => a.time.localeCompare(b.time));
				
				return allSlots;
			}

			const commonSlotsMap = new Map<string, string[]>();

			for (let i = 0; i < staffList.length; i++) {
				for (let j = i + 1; j < staffList.length; j++) {
					const staff1Slots = staffAvailableSlots.get(staffList[i]._id) || [];
					const staff2Slots = staffAvailableSlots.get(staffList[j]._id) || [];

					staff1Slots.forEach(slot1 => {
						staff2Slots.forEach(slot2 => {
							const overlapStart = Math.max(slot1.start, slot2.start);
							const overlapEnd = Math.min(slot1.end, slot2.end);
							const overlapDuration = overlapEnd - overlapStart;

							if (overlapDuration >= 60) {
								const startHour = Math.floor(overlapStart / 60);
								const startMinute = overlapStart % 60;
								const endHour = Math.floor(overlapEnd / 60);
								const endMinute = overlapEnd % 60;
								const slotText = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}(${overlapDuration}分钟)`;
								const staffNames = [staffList[i].name, staffList[j].name];

								if (!commonSlotsMap.has(slotText)) {
									commonSlotsMap.set(slotText, staffNames);
								}
							}
						});
					});
				}
			}

			const commonSlots = Array.from(commonSlotsMap.entries())
				.map(([time, staffNames]) => ({ time, staffNames }))
				.sort((a, b) => a.time.localeCompare(b.time));
			
			return commonSlots;
		};

		return {
			oneMale: findAllAvailableSlots(staffByGender.male, 1),
			oneFemale: findAllAvailableSlots(staffByGender.female, 1),
			twoMale: findAllAvailableSlots(staffByGender.male, 2),
			twoFemale: findAllAvailableSlots(staffByGender.female, 2)
		};
	}
}
