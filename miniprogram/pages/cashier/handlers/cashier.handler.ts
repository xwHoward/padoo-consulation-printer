import { cloudDb, Collections } from "../../../utils/cloud-db";
import { DataLoader } from "../../common/utils/data-loader";
import { ReservationUtils } from "../../common/utils/reservation-utils";
import { ReservationFormHandler } from "./reservation-form.handler";
import { SettlementHandler } from "./settlement.handler";
import { TimelineHandler } from "./timeline.handler";

const app = getApp<IAppOption>();

export class CashierHandler {
	private page: CashierPage;
	private reservationForm: ReservationFormHandler;
	private settlement: SettlementHandler;
	private timeline: TimelineHandler;

	constructor(page: CashierPage) {
		this.page = page;
		this.reservationForm = new ReservationFormHandler(page);
		this.settlement = new SettlementHandler(page);
		this.timeline = new TimelineHandler(page);
	}

	get reservationFormHandler() {
		return this.reservationForm;
	}

	get settlementHandler() {
		return this.settlement;
	}

	get timelineHandler() {
		return this.timeline;
	}

	async loadProjects() {
		const projects = await DataLoader.loadProjects();
		this.page.setData({ projects });
	}

	async checkStaffAvailability() {
		const { reserveForm, projects } = this.page.data;

		if (!reserveForm.date || !reserveForm.project || !reserveForm.startTime) {
			return;
		}

		this.page.setData({ loading: true, loadingText: '检查技师可用性...' });

		try {
			const project = projects.find((p: any) => p.name === reserveForm.project);
			const projectDuration = project?.duration || 60;

			const currentTimeStr = reserveForm.startTime;

			const availableTechnicians = await DataLoader.loadTechnicianAvailability(
				reserveForm.date,
				currentTimeStr,
				projectDuration,
				[]
			);

			this.page.setData({ staffAvailability: availableTechnicians });

			const maleCount = availableTechnicians.filter((t: any) => t.staff.gender === 'male' && t.available).length;
			const femaleCount = availableTechnicians.filter((t: any) => t.staff.gender === 'female' && t.available).length;

			this.page.setData({
				availableMaleCount: maleCount,
				availableFemaleCount: femaleCount
			});
		} catch (error) {
			wx.showToast({
				title: '检查技师可用性失败',
				icon: 'none'
			});
		} finally {
			this.page.setData({ loading: false });
		}
	}

	async openReserveModal(reservation?: ReservationRecord) {
		const now = new Date();
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

		if (reservation) {
			this.page.setData({
				showReserveModal: true,
				reserveForm: {
					_id: reservation._id,
					date: reservation.date,
					customerName: reservation.customerName,
					gender: reservation.gender,
					project: reservation.project,
					phone: reservation.phone || '',
					requirementType: reservation.technicianId ? 'specific' : 'gender',
					selectedTechnicians: reservation.technicianId ? [{
						_id: reservation.technicianId,
						name: reservation.technicianName || '',
						phone: '',
						isClockIn: reservation.isClockIn || false
					}] : [],
					genderRequirement: { male: 0, female: 0 },
					startTime: reservation.startTime,
					technicianId: reservation.technicianId || '',
					technicianName: reservation.technicianName || ''
				},
				originalReservation: reservation
			});
		} else {
			this.page.setData({
				showReserveModal: true,
				reserveForm: {
					_id: '',
					date: this.page.data.selectedDate,
					customerName: '',
					gender: 'male',
					project: '',
					phone: '',
					requirementType: 'specific',
					selectedTechnicians: [],
					genderRequirement: { male: 0, female: 0 },
					startTime: startTimeStr,
					technicianId: '',
					technicianName: ''
				},
				originalReservation: null
			});
		}

		await this.checkStaffAvailability();
	}

	async createReservation() {
		const { reserveForm, projects } = this.page.data;

		if (!reserveForm.customerName) {
			wx.showToast({ title: '请输入客户称呼', icon: 'none' });
			return;
		}

		if (!reserveForm.project) {
			wx.showToast({ title: '请选择项目', icon: 'none' });
			return;
		}

		if (!reserveForm.startTime) {
			wx.showToast({ title: '请选择开始时间', icon: 'none' });
			return;
		}

		const project = projects.find((p: any) => p.name === reserveForm.project);
		const projectDuration = project?.duration || 60;

		const startMinutes = this.parseTimeToMinutes(reserveForm.startTime);
		const endMinutes = startMinutes + projectDuration;
		const endTime = this.parseMinutesToTime(endMinutes);

		const reservationData = {
			date: reserveForm.date,
			customerName: reserveForm.customerName,
			gender: reserveForm.gender,
			project: reserveForm.project,
			phone: reserveForm.phone,
			startTime: reserveForm.startTime,
			endTime: endTime,
			requirementType: reserveForm.requirementType,
			selectedTechnicians: reserveForm.selectedTechnicians,
			genderRequirement: reserveForm.genderRequirement
		};

		this.page.setData({ loading: true, loadingText: '创建预约...' });

		try {
			const success = await ReservationUtils.createReservation(reservationData);

			if (success) {
				const reservations = await DataLoader.loadReservationsByDate(reserveForm.date);
				const newReservations = reservations.filter(r =>
					r.customerName === reserveForm.customerName &&
					r.startTime === reserveForm.startTime &&
					r.project === reserveForm.project
				);

				this.page.setData({
					pushModal: {
						show: true,
						loading: false,
						type: 'create',
						reservationData: {
							customerName: reserveForm.customerName,
							phone: reserveForm.phone,
							status: 'active',
							gender: reserveForm.gender,
							date: reserveForm.date,
							startTime: reserveForm.startTime,
							endTime: endTime,
							project: reserveForm.project,
							technicians: newReservations.map(r => ({
								_id: r.technicianId || '',
								name: r.technicianName || '',
								phone: '',
								isClockIn: r.isClockIn || false
							}))
						}
					}
				});

				this.reservationForm.closeReserveModal();
				await this.timeline.loadTimelineData();
			} else {
				wx.showToast({ title: '创建预约失败', icon: 'none' });
			}
		} catch (error) {
			wx.showToast({ title: '创建预约失败', icon: 'none' });
		} finally {
			this.page.setData({ loading: false });
		}
	}

	async updateReservation() {
		const { reserveForm, originalReservation, projects } = this.page.data;

		if (!reserveForm._id || !originalReservation) {
			return;
		}

		const project = projects.find((p: any) => p.name === reserveForm.project);
		const projectDuration = project?.duration || 60;

		const startMinutes = this.parseTimeToMinutes(reserveForm.startTime);
		const endMinutes = startMinutes + projectDuration;
		const endTime = this.parseMinutesToTime(endMinutes);

		const updateData: any = {
			customerName: reserveForm.customerName,
			gender: reserveForm.gender,
			project: reserveForm.project,
			phone: reserveForm.phone,
			startTime: reserveForm.startTime,
			endTime: endTime
		};

		if (reserveForm.requirementType === 'specific' && reserveForm.selectedTechnicians.length > 0) {
			const technician = reserveForm.selectedTechnicians[0];
			updateData.technicianId = technician._id;
			updateData.technicianName = technician.name;
			updateData.isClockIn = technician.isClockIn;
		}

		this.page.setData({ loading: true, loadingText: '更新预约...' });

		try {
			const success = await ReservationUtils.updateReservation(reserveForm._id, updateData);

			if (success) {
				wx.showToast({ title: '更新成功', icon: 'success' });

				this.reservationForm.closeReserveModal();
				await this.timeline.loadTimelineData();
			} else {
				wx.showToast({ title: '更新失败', icon: 'none' });
			}
		} catch (error) {
			wx.showToast({ title: '更新失败', icon: 'none' });
		} finally {
			this.page.setData({ loading: false });
		}
	}

	async cancelReservation(reservationId: string) {
		this.page.setData({ loading: true, loadingText: '取消中...' });

		try {
			const success = await ReservationUtils.cancelReservation(reservationId);

			if (success) {
				wx.showToast({ title: '取消成功', icon: 'success' });
				await this.timeline.loadTimelineData();
			} else {
				wx.showToast({ title: '取消失败', icon: 'none' });
			}
		} catch (error) {
			wx.showToast({ title: '取消失败', icon: 'none' });
		} finally {
			this.page.setData({ loading: false });
		}
	}

	async handleArrival(reserveId: string) {
		this.page.setData({ loading: true, loadingText: '加载中...' });

		try {
			const reservation = await ReservationUtils.getReservationById(reserveId);

			if (!reservation) {
				wx.showToast({ title: '预约不存在', icon: 'none' });
				this.page.setData({ loading: false });
				return;
			}

			if (reservation.status === 'cancelled') {
				wx.showToast({ title: '该预约已取消', icon: 'none' });
				this.page.setData({ loading: false });
				return;
			}

			const reservations = await DataLoader.loadReservationsByDate(reservation.date);
			const matchingReservations = reservations.filter(r =>
				r.date === reservation.date &&
				r.customerName === reservation.customerName &&
				r.startTime === reservation.startTime &&
				r.project === reservation.project &&
				r.status === 'active'
			);

			await ReservationUtils.sendArrivalNotification(matchingReservations);

			this.page.setData({ loading: false });

			if (matchingReservations.length > 1) {
				const reserveIds = matchingReservations.map(r => r._id).join(',');
				wx.navigateTo({ url: `/pages/index/index?reserveIds=${reserveIds}` });
			} else {
				wx.navigateTo({ url: `/pages/index/index?reserveId=${reserveId}` });
			}
		} catch (error) {
			wx.showToast({ title: '加载失败', icon: 'none' });
			this.page.setData({ loading: false });
		}
	}

	async onPushModalConfirm() {
		const { pushModal } = this.page.data;

		if (!pushModal.reservationData) {
			return;
		}

		this.page.setData({ 'pushModal.loading': true });

		try {
			const { reservationData, type } = pushModal;

			const reservation: Update<ReservationRecord> = {
				date: reservationData.date,
				customerName: reservationData.customerName,
				gender: reservationData.gender,
				phone: reservationData.phone,
				project: reservationData.project,
				technicianId: reservationData.technicians[0]?._id,
				technicianName: reservationData.technicians[0]?.name,
				startTime: reservationData.startTime,
				endTime: reservationData.endTime,
				status: 'active' as const
			};

			await ReservationUtils.sendReservationChangeNotification(reservation, type);

			this.page.setData({
				pushModal: {
					show: false,
					loading: false,
					type: 'create',
					reservationData: null
				}
			});

			wx.showToast({ title: '推送成功', icon: 'success' });
		} catch (error) {
			wx.showToast({ title: '推送失败', icon: 'none' });
			this.page.setData({ 'pushModal.loading': false });
		}
	}

	onPushModalCancel() {
		this.page.setData({
			pushModal: {
				show: false,
				loading: false,
				type: 'create',
				reservationData: null
			}
		});
	}

	async pushRotation() {
		this.page.setData({ loading: true, loadingText: '推送中...' });

		try {
			const rotationData = await app.getRotationQueue(this.page.data.selectedDate);

			if (!rotationData || !rotationData.staffList || rotationData.staffList.length === 0) {
				wx.showToast({ title: '暂无轮牌数据', icon: 'none' });
				this.page.setData({ loading: false });
				return;
			}

			const staffList = rotationData.staffList.map((s: any, index: number) => {
				const shift = s.shift || '待定';
				return `${index + 1}. ${s.name}（${shift === 'morning' ? '早班' : shift === 'evening' ? '晚班' : shift}）`;
			}).join('\n');

			const message = `【📋 今日轮牌】

${staffList}

更新时间：${new Date().toLocaleTimeString()}`;

			const res = await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: { content: message }
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; message?: string };
				if (result.code === 0) {
					wx.showToast({ title: '推送成功', icon: 'success' });
				} else {
					wx.showToast({ title: result.message || '推送失败', icon: 'none' });
				}
			} else {
				wx.showToast({ title: '推送成功', icon: 'success' });
			}
		} catch (error) {
			wx.showToast({ title: '推送失败', icon: 'none' });
		} finally {
			this.page.setData({ loading: false });
		}
	}

	async saveSettlement() {
		const { settlementRecordId, settlementCouponCode, paymentMethods } = this.page.data;

		const totalAmount = this.settlement.calculateTotalAmount(paymentMethods);

		if (totalAmount <= 0) {
			wx.showToast({ title: '请选择支付方式并输入金额', icon: 'none' });
			return;
		}

		this.page.setData({ loading: true, loadingText: '保存中...' });

		try {
			const result = await cloudDb.updateById(Collections.CONSULTATION, settlementRecordId, {
				couponCode: settlementCouponCode,
				paymentMethods: paymentMethods,
				isSettled: true,
				settledAt: new Date().toISOString(),
				totalSettlementAmount: totalAmount
			});

			if (result) {
				wx.showToast({ title: '保存成功', icon: 'success' });
				this.settlement.closeSettlementModal();
				await this.timeline.loadTimelineData();
			} else {
				wx.showToast({ title: '保存失败', icon: 'none' });
			}
		} catch (error) {
			wx.showToast({ title: '保存失败', icon: 'none' });
		} finally {
			this.page.setData({ loading: false });
		}
	}

	private parseTimeToMinutes(timeStr: string): number {
		const [hours, minutes] = timeStr.split(':').map(Number);
		return hours * 60 + minutes;
	}

	private parseMinutesToTime(minutes: number): string {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
	}
}
