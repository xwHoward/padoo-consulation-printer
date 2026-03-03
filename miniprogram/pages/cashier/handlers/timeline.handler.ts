import { cloudDb } from "../../../utils/cloud-db";
import { DEFAULT_SHIFT, SHIFT_END_TIME, SHIFT_START_TIME } from "../../../utils/constants";
import { earlierThan, getCurrentDate, getMinutesDiff, laterOrEqualTo } from "../../../utils/util";
import { DataLoader } from "../../common/utils/data-loader";

const app = getApp<IAppOption>();

export class TimelineHandler {
	private page: any;

	constructor(page: any) {
		this.page = page;
	}

	async loadInitialData() {
		this.page.setData({ loading: true, loadingText: '加载数据...' });

		try {
			const today = this.page.data.selectedDate || getCurrentDate();

			const [rooms, allSchedules, allStaff, availableTechnicians] = await Promise.all([
				this.loadRoomsData(today),
				DataLoader.loadConsultationsByDate(today),
				DataLoader.loadSchedules(),
				DataLoader.loadStaffList(),
				this.loadAvailableTechnicians(today)
			]);

			const activeStaffList = allStaff.filter((s: StaffInfo) => {
				const scheduledStaff = allSchedules.map((schedule: any) => schedule.staffId);
				return scheduledStaff.includes(s._id);
			});

			this.page.setData({
				rooms,
				activeStaffList: activeStaffList,
				staffAvailability: availableTechnicians
			});

			const rotationList = await this.prepareRotationList(today);

			const previousDate = this.getPreviousDate(today);
			const nextDate = this.getNextDate(today);
			const isToday = today === getCurrentDate();

			this.page.setData({
				rotationList,
				dateSelector: {
					selectedDate: today,
					previousDate,
					nextDate,
					isToday
				}
			});
		} catch (error) {
			this.page.setData({ loading: false });
			wx.showToast({
				title: '加载数据失败',
				icon: 'none'
			});
		} finally {
			this.page.setData({ loading: false });
		}
	}

	async loadTimelineData() {
		this.page.setData({ loading: true, loadingText: '刷新排钟...' });

		try {
			const today = this.page.data.selectedDate || getCurrentDate();
			const rotationList = await this.prepareRotationList(today);

			this.page.setData({
				rotationList,
				timelineRefreshTrigger: this.page.data.timelineRefreshTrigger + 1
			});
		} catch (error) {
			wx.showToast({
				title: '刷新失败',
				icon: 'none'
			});
		} finally {
			this.page.setData({ loading: false });
		}
	}

	private async loadRoomsData(today: string) {
		const allRooms = await app.getRooms();
		const filteredRooms = allRooms.filter((r: any) => r.status === 'normal');
		const todayRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
		const activeRecords = todayRecords.filter(r => !r.isVoided);

		const now = new Date();
		const todayStr = getCurrentDate();
		const isToday = today === todayStr;

		let currentTime = '';
		if (isToday) {
			const hours = now.getHours();
			const minutes = now.getMinutes();
			currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
		}

		return filteredRooms.map((room: any) => {
			let occupiedRecords = activeRecords
				.filter(r => r.room === room.name)
				.map(r => ({
					customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
					technician: r.technician || '',
					startTime: r.startTime,
					endTime: r.endTime || ''
				}));

			if (isToday && currentTime) {
				occupiedRecords = occupiedRecords.filter(r => {
					return laterOrEqualTo(currentTime, r.startTime) && earlierThan(currentTime, r.endTime);
				});
			}

			occupiedRecords.sort((a, b) => b.endTime.localeCompare(a.endTime));

			return {
				...room,
				isOccupied: occupiedRecords.length > 0,
				occupiedRecords
			};
		});
	}

	private async loadAvailableTechnicians(today: string) {
		const todayStr = getCurrentDate();
		const isToday = today === todayStr;

		const now = new Date();
		const currentTime = isToday
			? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
			: '12:00';

		return await DataLoader.loadTechnicianAvailability(today, currentTime, 60, []);
	}

	private async prepareRotationList(today: string) {
		const rotationData = await app.getRotationQueue(today);

		if (!rotationData || !rotationData.staffList || rotationData.staffList.length === 0) {
			return [];
		}

		const [activeRecords, reservations, allSchedules] = await Promise.all([
			DataLoader.loadConsultationsByDate(today),
			DataLoader.loadReservationsByDate(today),
			DataLoader.loadSchedules()
		]);

		return rotationData.staffList.map((staffData: any) => {
			const schedule = allSchedules.find((s: any) => s.date === today && s.staffId === staffData.staffId);
			const shift = schedule ? schedule.shift : DEFAULT_SHIFT;

			const availableSlots = this.calculateAvailableSlots(
				staffData.name,
				activeRecords,
				reservations,
				today,
				shift as any
			);

			return {
				_id: staffData.staffId,
				name: staffData.name,
				shift: shift,
				availableSlots
			};
		}).filter((item: any) => item.shift === 'morning' || item.shift === 'evening');
	}

	private calculateAvailableSlots(
		staffName: string,
		activeRecords: ConsultationRecord[],
		reservations: ReservationRecord[],
		selectedDate: string,
		shift: 'morning' | 'evening'
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
			const nowHour = now.getHours();
			const nowMinute = now.getMinutes();

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

	private getPreviousDate(date: string): string {
		const d = new Date(date);
		d.setDate(d.getDate() - 1);
		return d.toISOString().split('T')[0];
	}

	private getNextDate(date: string): string {
		const d = new Date(date);
		d.setDate(d.getDate() + 1);
		return d.toISOString().split('T')[0];
	}
}
