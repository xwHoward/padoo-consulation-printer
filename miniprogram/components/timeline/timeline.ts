import { cloudDb, Collections } from '../../utils/cloud-db';
import { SHIFT_END_TIME, SHIFT_START_TIME, ShiftType } from '../../utils/constants';
import { getCurrentDate } from '../../utils/util';

const app = getApp<IAppOption>();

interface TimelineData {
	timeLabels: string[]
	staffTimeline: StaffTimelineItem[]
	showCurrentTimeLine: boolean
	currentTimePosition: string
	scrollLeft: number
	loading: boolean
}

interface StaffTimelineItem {
	_id: string
	name: string
	shift: 'morning' | 'evening'
	blocks: TimeBlock[]
	availableSlots: AvailableSlot[]
	highlighted?: boolean
}

interface TimeBlock {
	_id: string
	startTime: string
	endTime: string
	left: string
	width: string
	customerName: string
	room: string
	project: string
	isReservation: boolean
	isSettled: boolean
	isInProgress: boolean
	technician: string
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
			observer: function(newVal: number) {
				if (newVal > 0) {
					this.loadAllStaffTimelineData(this.properties.staffId);
				}
			}
		},
		readonly: {
			type: Boolean,
			value: false
		}
	},

	data: {
		timeLabels: ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '00', '01', '02'],
		staffTimeline: [],
		showCurrentTimeLine: false,
		currentTimePosition: '0%',
		scrollLeft: 0,
		loading: false
	} as TimelineData,

	observers: {
		'selectedDate, staffId': function (selectedDate: string, staffId: string) {
			if (!selectedDate) return;

			this.loadAllStaffTimelineData(staffId);
		}
	},
	pageLifetimes: {
		show: function () {
			this.loadAllStaffTimelineData();
		}
	},

	methods: {
		async loadAllStaffTimelineData(highlightStaffId?: string) {
			this.setData({ loading: true });

			try {
				const today = this.properties.selectedDate || getCurrentDate();
				const todayStr = getCurrentDate();
				const isToday = today === todayStr;

				const todayRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(today);
				const activeRecords = todayRecords.filter(r => !r.isVoided);
				const reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, { date: today });

				const allSchedules = await cloudDb.getAll<ScheduleRecord>(Collections.SCHEDULE);
				const allStaff = await app.getStaffs();
				const activeStaff = allStaff.filter(s => s.status === 'active');
				const scheduledStaff = allSchedules.map(s => s.staffId);
				const activeStaffList = activeStaff.filter(s => scheduledStaff.includes(s._id));

				const staffTimeline: StaffTimelineItem[] = [];
				const timelineWidth = this.data.timeLabels.length * 60;

				for (const staff of activeStaffList) {
					const schedule = allSchedules.find(s => s.date === today && s.staffId === staff._id);
					const shift = schedule ? schedule.shift : 'morning';

					if (shift !== 'morning' && shift !== 'evening') {
						continue;
					}

					const staffRecords = activeRecords.filter(r => r.technician === staff.name);
					const staffReservations = reservations.filter(r => r.technicianName === staff.name || r.technicianId === staff._id);

					const rawBlocks = [
						...staffRecords.map(r => ({ ...r, isReservation: false })),
						...staffReservations.map(r => ({
							_id: r._id,
							surname: r.customerName,
							gender: r.gender,
							project: r.project,
							room: '预约',
							startTime: r.startTime,
							endTime: r.endTime,
							isReservation: true,
							technician: r.technicianName
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

						const startMinutes = (startH - parseInt(this.data.timeLabels[0])) * 60 + startM;
						const duration = (endH - startH) * 60 + (endM - startM);

						const isSettled = !r.isReservation && (r as ConsultationRecord).settlement && Object.keys((r as ConsultationRecord).settlement!).length > 0 || false;

						const now = new Date();
						const nowMinutes = now.getHours() * 60 + now.getMinutes();
						const recordStartMinutes = startH * 60 + startM;
						const recordEndMinutes = endH * 60 + endM;
						const isInProgress = isToday && nowMinutes >= recordStartMinutes && nowMinutes < recordEndMinutes;

						return {
							_id: r._id,
							customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
							startTime: r.startTime,
							endTime: r.endTime,
							project: r.project,
							room: r.room,
							left: (startMinutes / timelineWidth * 100) + '%',
							width: (duration / timelineWidth * 100) + '%',
							isReservation: r.isReservation,
							isSettled,
							isInProgress,
							technician: r.technician!
						};
					});

					const availableSlots = this.calculateAvailableSlotsBetweenBlocks(blocks, shift);

					staffTimeline.push({
						_id: staff._id,
						name: staff.name,
						shift,
						blocks,
						availableSlots,
						highlighted: highlightStaffId === staff._id
					});
				}

				let currentTimePosition = '0%';
				let showCurrentTimeLine = false;
				if (isToday) {
					const now = new Date();
					const nowMinutes = now.getHours() * 60 + now.getMinutes();
					const startHour = parseInt(this.data.timeLabels[0]);
					const timeInTimeline = nowMinutes - startHour * 60;
					if (timeInTimeline >= 0 && timeInTimeline <= timelineWidth) {
						currentTimePosition = (timeInTimeline / timelineWidth * 100) + '%';
						showCurrentTimeLine = true;
					}
					this.setData({ scrollLeft: timeInTimeline });
				}

				this.setData({
					staffTimeline,
					showCurrentTimeLine,
					currentTimePosition,
				});

			} catch (error) {
				console.error('加载所有员工排钟数据失败:', error);
				this.triggerEvent('error', { error });
			} finally {
				this.setData({ loading: false });
			}
		},

		calculateAvailableSlotsBetweenBlocks(blocks: TimeBlock[], shift: ShiftType): AvailableSlot[] {
			const availableSlots: AvailableSlot[] = [];

			const timelineWidth = this.data.timeLabels.length * 60;
			const timelineStartHour = parseInt(this.data.timeLabels[0]);

			const now = new Date();
			const todayStr = getCurrentDate();
			const selectedDate = this.properties.selectedDate;
			const isToday = selectedDate === todayStr;

			const nowMinutes = now.getHours() * 60 + now.getMinutes();

			const shiftStartTime = SHIFT_START_TIME[shift];
			const shiftEndTime = SHIFT_END_TIME[shift];

			if (!shiftStartTime || !shiftEndTime) {
				return availableSlots;
			}

			const [shiftStartH, shiftStartM] = shiftStartTime.split(':').map(Number);
			const [shiftEndH, shiftEndM] = shiftEndTime.split(':').map(Number);
			const shiftStartMinutes = shiftStartH * 60 + shiftStartM;
			const shiftEndMinutes = shiftEndH * 60 + shiftEndM;

			if (!isToday) {
				if (blocks.length > 0) {
					const firstBlock = blocks[0];
					const [firstStartH, firstStartM] = firstBlock.startTime.split(':').map(Number);
					const firstStartMinutes = firstStartH * 60 + firstStartM;

					if (firstStartMinutes > shiftStartMinutes) {
						const gapMinutes = firstStartMinutes - shiftStartMinutes;
						const gapStartMinutesFromTimelineStart = (shiftStartH - timelineStartHour) * 60 + shiftStartM;

						const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
						const width = (gapMinutes / timelineWidth * 100) + '%';

						availableSlots.push({
							left,
							width,
							displayText: `${gapMinutes}分钟`,
							durationMinutes: gapMinutes
						});
					}
				}

				for (let i = 0; i < blocks.length - 1; i++) {
					const currentBlock = blocks[i];
					const nextBlock = blocks[i + 1];

					const [currentEndH, currentEndM] = currentBlock.endTime.split(':').map(Number);
					const currentEndMinutes = currentEndH * 60 + currentEndM;

					const [nextStartH, nextStartM] = nextBlock.startTime.split(':').map(Number);
					const nextStartMinutes = nextStartH * 60 + nextStartM;

					const gapMinutes = nextStartMinutes - currentEndMinutes;

					if (gapMinutes > 0) {
						const gapStartMinutesFromTimelineStart = (currentEndH - timelineStartHour) * 60 + currentEndM;

						const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
						const width = (gapMinutes / timelineWidth * 100) + '%';

						availableSlots.push({
							left,
							width,
							displayText: `${gapMinutes}分钟`,
							durationMinutes: gapMinutes
						});
					}
				}

				if (blocks.length > 0) {
					const lastBlock = blocks[blocks.length - 1];
					const [lastEndH, lastEndM] = lastBlock.endTime.split(':').map(Number);
					const lastEndMinutes = lastEndH * 60 + lastEndM;

					if (lastEndMinutes < shiftEndMinutes) {
						const gapMinutes = shiftEndMinutes - lastEndMinutes;
						const gapStartMinutesFromTimelineStart = (lastEndH - timelineStartHour) * 60 + lastEndM;

						const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
						const width = (gapMinutes / timelineWidth * 100) + '%';

						availableSlots.push({
							left,
							width,
							displayText: `${gapMinutes}分钟`,
							durationMinutes: gapMinutes
						});
					}
				}

				return availableSlots;
			}

			if (nowMinutes >= shiftEndMinutes) {
				return availableSlots;
			}

			let currentBlockIndex = -1;
			for (let i = 0; i < blocks.length; i++) {
				const block = blocks[i];
				const [startH, startM] = block.startTime.split(':').map(Number);
				const [endH, endM] = block.endTime.split(':').map(Number);
				const startMinutes = startH * 60 + startM;
				const endMinutes = endH * 60 + endM;

				if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
					currentBlockIndex = i;
					break;
				}
			}

			if (currentBlockIndex !== -1) {
				const currentBlock = blocks[currentBlockIndex];
				const [currentEndH, currentEndM] = currentBlock.endTime.split(':').map(Number);
				const currentEndMinutes = currentEndH * 60 + currentEndM;

				if (currentBlockIndex < blocks.length - 1) {
					const nextBlock = blocks[currentBlockIndex + 1];
					const [nextStartH, nextStartM] = nextBlock.startTime.split(':').map(Number);
					const nextStartMinutes = nextStartH * 60 + nextStartM;

					const gapMinutes = nextStartMinutes - currentEndMinutes;

					if (gapMinutes > 0) {
						const gapStartMinutesFromTimelineStart = (currentEndH - timelineStartHour) * 60 + currentEndM;

						const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
						const width = (gapMinutes / timelineWidth * 100) + '%';

						availableSlots.push({
							left,
							width,
							displayText: `${gapMinutes}分钟`,
							durationMinutes: gapMinutes
						});
					}
				} else {
					if (currentEndMinutes < shiftEndMinutes) {
						const gapMinutes = shiftEndMinutes - currentEndMinutes;
						const gapStartMinutesFromTimelineStart = (currentEndH - timelineStartHour) * 60 + currentEndM;

						const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
						const width = (gapMinutes / timelineWidth * 100) + '%';

						availableSlots.push({
							left,
							width,
							displayText: `${gapMinutes}分钟`,
							durationMinutes: gapMinutes
						});
					}
				}
			} else {
				let nextBlockIndex = -1;
				for (let i = 0; i < blocks.length; i++) {
					const block = blocks[i];
					const [startH, startM] = block.startTime.split(':').map(Number);
					const startMinutes = startH * 60 + startM;

					if (startMinutes > nowMinutes) {
						nextBlockIndex = i;
						break;
					}
				}

				if (nowMinutes < shiftStartMinutes) {
					if (nextBlockIndex !== -1) {
						const nextBlock = blocks[nextBlockIndex];
						const [nextStartH, nextStartM] = nextBlock.startTime.split(':').map(Number);
						const nextStartMinutes = nextStartH * 60 + nextStartM;

						if (nextStartMinutes > shiftStartMinutes) {
							const gapMinutes = nextStartMinutes - shiftStartMinutes;
							const gapStartMinutesFromTimelineStart = (shiftStartH - timelineStartHour) * 60 + shiftStartM;

							const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
							const width = (gapMinutes / timelineWidth * 100) + '%';

							availableSlots.push({
								left,
								width,
								displayText: `${gapMinutes}分钟`,
								durationMinutes: gapMinutes
							});
						}
					} else {
						if (shiftEndMinutes > shiftStartMinutes) {
							const gapMinutes = shiftEndMinutes - shiftStartMinutes;
							const gapStartMinutesFromTimelineStart = (shiftStartH - timelineStartHour) * 60 + shiftStartM;

							const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
							const width = (gapMinutes / timelineWidth * 100) + '%';

							availableSlots.push({
								left,
								width,
								displayText: `${gapMinutes}分钟`,
								durationMinutes: gapMinutes
							});
						}
					}
				} else {
					if (nextBlockIndex !== -1) {
						const nextBlock = blocks[nextBlockIndex];
						const [nextStartH, nextStartM] = nextBlock.startTime.split(':').map(Number);
						const nextStartMinutes = nextStartH * 60 + nextStartM;

						if (nextStartMinutes > nowMinutes) {
							const gapMinutes = nextStartMinutes - nowMinutes;
							const gapStartMinutesFromTimelineStart = (Math.floor(nowMinutes / 60) - timelineStartHour) * 60 + (nowMinutes % 60);

							const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
							const width = (gapMinutes / timelineWidth * 100) + '%';

							availableSlots.push({
								left,
								width,
								displayText: `${gapMinutes}分钟`,
								durationMinutes: gapMinutes
							});
						}
					} else {
						if (shiftEndMinutes > nowMinutes) {
							const gapMinutes = shiftEndMinutes - nowMinutes;
							const gapStartMinutesFromTimelineStart = (Math.floor(nowMinutes / 60) - timelineStartHour) * 60 + (nowMinutes % 60);

							const left = (gapStartMinutesFromTimelineStart / timelineWidth * 100) + '%';
							const width = (gapMinutes / timelineWidth * 100) + '%';

							availableSlots.push({
								left,
								width,
								displayText: `${gapMinutes}分钟`,
								durationMinutes: gapMinutes
							});
						}
					}
				}
			}

			return availableSlots;
		},

		onBlockClick(e: WechatMiniprogram.CustomEvent) {
			if (this.data.readonly) return;

			const { id, reservation, settled, inprogress } = e.currentTarget.dataset;
			this.triggerEvent('blockclick', {
				id,
				reservation,
				settled,
				inprogress
			});
		}
	}
});
