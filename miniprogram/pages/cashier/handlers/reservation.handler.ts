// reservation.handler.ts - 预约处理器
import { cloudDb, Collections } from '../../../utils/cloud-db';
import { getCurrentDate, formatTime, parseProjectDuration } from '../../../utils/util';
import { hasButtonPermission } from '../../../utils/permission';
import { formatMention } from '../../../utils/wechat-work';
import type { CashierPage } from '../cashier.types';
import { PushHandler } from './push.handler';

const app = getApp<IAppOption>();

export class ReservationHandler {
	private page: CashierPage;
	private pushHandler: PushHandler;

	constructor(page: CashierPage) {
		this.page = page;
		this.pushHandler = new PushHandler(page);
	}

	/**
	 * 打开预约弹窗
	 */
	async openReserveModal(): Promise<void> {
		if (!hasButtonPermission('createReservation')) {
			wx.showToast({ title: '您没有权限新增预约', icon: 'none' });
			return;
		}

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

		this.page.setData({
			showReserveModal: true,
			reserveForm: {
				_id: '',
				date: this.page.data.selectedDate || getCurrentDate(),
				customerName: '',
				gender: 'male',
				project: '',
				phone: '',
				requirementType: 'specific',
				selectedTechnicians: [],
				genderRequirement: { male: 0, female: 0 },
				startTime: startTimeStr,
				technicianId: '',
				technicianName: '',
			}
		});
		await this.page.checkStaffAvailability();
	}

	/**
	 * 关闭预约弹窗
	 */
	closeReserveModal(): void {
		this.page.setData({ showReserveModal: false });
		this.page.loadTimelineData();
	}

	/**
	 * 编辑预约
	 */
	async editReservation(_id: string): Promise<void> {
		this.page.setData({ loading: true, loadingText: '加载中...' });
		try {
			const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id);
			if (record) {
				if (record.status === 'cancelled') {
					wx.showToast({ title: '该预约已取消，无法编辑', icon: 'none' });
					this.page.setData({ loading: false });
					return;
				}

				// 判断预约类型
				const hasGenderRequirement = record.genderRequirement && !record.technicianId;
				const requirementType = hasGenderRequirement ? 'gender' : 'specific';

				const selectedTechnicians: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }> = [];
				if (record.technicianId && record.technicianName) {
					const staff = this.page.data.staffAvailability.find(s => s._id === record.technicianId);
					if (staff) {
						selectedTechnicians.push({ _id: staff._id, name: staff.name, phone: staff.phone, isClockIn: record.isClockIn || false });
					}
				}

				this.page.setData({
					showReserveModal: true,
					reserveForm: {
						_id: record._id,
						date: record.date,
						customerName: record.customerName,
						gender: record.gender,
						project: record.project,
						phone: record.phone,
						requirementType: requirementType as 'specific' | 'gender',
						selectedTechnicians,
						genderRequirement: hasGenderRequirement ? { male: record.genderRequirement === 'male' ? 1 : 0, female: record.genderRequirement === 'female' ? 1 : 0 } : { male: 0, female: 0 },
						startTime: record.startTime,
						technicianId: record.technicianId || '',
						technicianName: record.technicianName || '',
					},
					// 保存原始预约数据用于变更对比
					originalReservation: record
				});
				await this.page.checkStaffAvailability();
			}
		} catch (error) {
			wx.showToast({
				title: '加载预约失败',
				icon: 'none'
			});
		} finally {
			this.page.setData({ loading: false });
		}
	}

	/**
	 * 检查技师在预约时段的可用性
	 */
	async checkStaffAvailability(): Promise<void> {
		try {
			const { date, startTime, project, _id: editingReservationId } = this.page.data.reserveForm;
			if (!date || !startTime) return;

			this.page.setData({ loading: true, loadingText: '检查技师可用性...' });

			const projectDuration = parseProjectDuration(project) || 60;

			// 编辑模式下，排除当前正在编辑的预约ID，使其原技师可选
			const currentReservationIds = editingReservationId ? [editingReservationId] : [];

			const res = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date: date,
					currentTime: startTime,
					projectDuration: projectDuration,
					currentReservationIds
				}
			});

			if (!res.result || typeof res.result !== 'object') {
				throw new Error('获取技师列表失败');
			}

			if ((res.result as { code: number }).code === 0) {
				const list = (res.result as { data: StaffAvailability[] }).data;

				const selectedTechnicianIds = this.page.data.reserveForm.selectedTechnicians.map(t => t._id);

				const selectedTechniciansMap = new Map(this.page.data.reserveForm.selectedTechnicians.map(t => [t._id, t]));

				const staffAvailability = list.map(staff => {
					const selectedTech = selectedTechniciansMap.get(staff._id);
					return {
						...staff,
						isSelected: selectedTechnicianIds.includes(staff._id),
						isClockIn: selectedTech?.isClockIn || false
					};
				});

				// 计算可用男技师和女技师数量
				const availableMaleCount = list.filter(s => !s.isOccupied && s.gender === 'male').length;
				const availableFemaleCount = list.filter(s => !s.isOccupied && s.gender === 'female').length;

				this.page.setData({
					staffAvailability,
					availableMaleCount,
					availableFemaleCount
				});
			} else {
				wx.showToast({
					title: (res.result as { message?: string }).message || '获取技师列表失败',
					icon: 'none'
				});
			}
		} catch (error) {
			wx.showToast({
				title: '获取技师列表失败',
				icon: 'none'
			});
		} finally {
			this.page.setData({ loading: false });
		}
	}

	/**
	 * 切换技师需求类型
	 */
	onRequirementTypeChange(e: WechatMiniprogram.CustomEvent): void {
		const { value } = e.detail;
		const { reserveForm } = this.page.data;
		reserveForm.requirementType = value as 'specific' | 'gender';

		// 切换时清空选择
		if (value === 'gender') {
			reserveForm.selectedTechnicians = [];
			reserveForm.genderRequirement = { male: 0, female: 0 };
		} else {
			reserveForm.genderRequirement = { male: 0, female: 0 };
		}

		this.page.setData({ reserveForm });
	}

	/**
	 * 调整性别数量
	 */
	onChangeGenderCount(e: WechatMiniprogram.CustomEvent): void {
		const { gender, action } = e.currentTarget.dataset;
		const { reserveForm } = this.page.data;
		const currentCount = reserveForm.genderRequirement[gender as 'male' | 'female'];

		if (action === 'increase') {
			if (currentCount < 2) {
				reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount + 1;
			}
		} else if (action === 'decrease') {
			if (currentCount > 0) {
				reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount - 1;
			}
		}

		this.page.setData({ reserveForm });
		this.page.checkStaffAvailability();
	}

	/**
	 * 表单字段变更
	 */
	onReserveFieldChange(e: WechatMiniprogram.CustomEvent): void {
		const { field } = e.currentTarget.dataset;
		const val = e.detail.value;
		const { reserveForm } = this.page.data;

		if (field === 'startTime' || field === 'date') {
			reserveForm[field as 'startTime' | 'date'] = val;
			this.page.setData({ reserveForm });
			this.page.checkStaffAvailability();
		} else {
			reserveForm[field as 'customerName' | 'phone'] = val;
			this.page.setData({ reserveForm });
			// 触发顾客匹配
			if (field === 'customerName' || field === 'phone') {
				this.page.searchCustomer();
			}
		}
	}

	/**
	 * 选择技师（预约场景）
	 */
	selectReserveTechnician(e: WechatMiniprogram.CustomEvent): void {
		const { _id, technician: name, occupied, reason, phone, hasNonClockInConflict } = e.detail;
		
		// 预约场景下，即使有占用也允许选择，只显示提示
		if (occupied) {
			wx.showToast({ title: reason || '该技师在此时段已有安排，请注意协调', icon: 'none', duration: 2500 });
		} else if (hasNonClockInConflict) {
			wx.showToast({ title: '该技师有非点钟预约冲突，请注意协调', icon: 'none', duration: 2500 });
		}

		// 多选逻辑：切换选中状态
		const selectedTechnicians = [...this.page.data.reserveForm.selectedTechnicians];
		const existingIndex = selectedTechnicians.findIndex(t => t._id === _id);

		if (existingIndex !== -1) {
			// 已选中，取消选择
			selectedTechnicians.splice(existingIndex, 1);
		} else {
			// 未选中，添加
			const staff = this.page.data.staffAvailability.find(s => s._id === _id);
			selectedTechnicians.push({ _id, name, phone, wechatWorkId: staff?.wechatWorkId, isClockIn: false });
		}

		// 更新 staffAvailability 的 isSelected 状态
		const staffAvailability = this.page.data.staffAvailability.map(staff => ({
			...staff,
			isSelected: selectedTechnicians.some(t => t._id === staff._id)
		}));

		this.page.setData({
			'reserveForm.selectedTechnicians': selectedTechnicians,
			staffAvailability
		});
	}

	/**
	 * 切换点钟状态
	 */
	toggleReserveClockIn(e: WechatMiniprogram.CustomEvent): void {
		const { _id } = e.detail;
		const selectedTechnicians = [...this.page.data.reserveForm.selectedTechnicians];
		const tech = selectedTechnicians.find(t => t._id === _id);
		if (tech) {
			tech.isClockIn = !tech.isClockIn;
			this.page.setData({ 'reserveForm.selectedTechnicians': selectedTechnicians });
		}

		const staffAvailability = this.page.data.staffAvailability.map(staff => {
			if (staff._id === _id) {
				return { ...staff, isClockIn: !staff.isClockIn };
			}
			return staff;
		});
		this.page.setData({ staffAvailability });
	}

	/**
	 * 选择项目
	 */
	async selectReserveProject(e: WechatMiniprogram.CustomEvent): Promise<void> {
		const { project } = e.detail;
		const currentProject = this.page.data.reserveForm.project;
		// 切换选中状态
		this.page.setData({
			'reserveForm.project': currentProject === project ? '' : project
		});
		await this.page.checkStaffAvailability();
	}

	/**
	 * 修改性别
	 */
	onReserveGenderChange(e: WechatMiniprogram.CustomEvent): void {
		this.page.setData({ 'reserveForm.gender': e.detail.value });
		// 触发顾客匹配
		this.page.searchCustomer();
	}

	/**
	 * 处理到店操作 - 显示确认弹窗
	 */
	async handleArrival(reserveId: string): Promise<void> {
		this.page.setData({ loading: true, loadingText: '加载中...' });
		try {
			const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
			if (!record) {
				wx.showToast({ title: '预约不存在', icon: 'none' });
				this.page.setData({ loading: false });
				return;
			}

			if (record.status === 'cancelled') {
				wx.showToast({ title: '该预约已取消', icon: 'none' });
				this.page.setData({ loading: false });
				return;
			}

			this.page.setData({ loading: false });

			this.page.setData({
				'arrivalConfirmModal.show': true,
				'arrivalConfirmModal.reserveId': reserveId,
				'arrivalConfirmModal.customerName': record.customerName + (record.gender === 'male' ? '先生' : '女士'),
				'arrivalConfirmModal.project': record.project,
				'arrivalConfirmModal.technicianName': record.technicianName || '未指定'
			});
		} catch (error) {
			wx.showToast({ title: '加载失败', icon: 'none' });
			this.page.setData({ loading: false });
		}
	}

	/**
	 * 处理到店操作 - 实际执行
	 */
	async processArrival(reserveId: string, shouldPushNotification: boolean): Promise<void> {
		this.page.setData({ loading: true, loadingText: '处理中...' });
		try {
			const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
			if (!record) {
				wx.showToast({ title: '预约不存在', icon: 'none' });
				this.page.setData({ loading: false });
				return;
			}

			if (record.status === 'cancelled') {
				wx.showToast({ title: '该预约已取消', icon: 'none' });
				this.page.setData({ loading: false });
				return;
			}

			const reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
				date: record.date,
				customerName: record.customerName,
				startTime: record.startTime,
				project: record.project,
				status: 'active',
			});

			if (shouldPushNotification) {
				await this.pushHandler.sendArrivalNotification(reservations);
			}

			this.page.setData({ loading: false });

			if (reservations.length > 1) {
				const reserveIds = reservations.map(r => r._id).join(',');
				wx.navigateTo({ url: `/pages/index/index?reserveIds=${reserveIds}` });
			} else {
				wx.navigateTo({ url: `/pages/index/index?reserveId=${reserveId}` });
			}
		} catch (error) {
			wx.showToast({ title: '处理失败', icon: 'none' });
			this.page.setData({ loading: false });
		}
	}

	/**
	 * 提前下钟操作
	 */
	async handleEarlyFinish(recordId: string): Promise<void> {
		this.page.setData({ loading: true, loadingText: '处理中...' });

		try {
			const record = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, recordId);
			if (!record) {
				wx.showToast({
					title: '记录不存在',
					icon: 'none'
				});
				this.page.setData({ loading: false });
				return;
			}

			const modalRes = await wx.showModal({
				title: '提前下钟',
				content: `确认要为技师 ${record.technician || ''}（房间：${record.room || ''}）提前下钟吗？\n\n将把结束时间更新为当前时间。`,
				confirmText: '确定',
				cancelText: '取消'
			});

			if (!modalRes.confirm) {
				this.page.setData({ loading: false });
				return;
			}

			const now = new Date();
			const endTime = formatTime(now, false);

			const updateRes = await cloudDb.updateById(Collections.CONSULTATION, recordId, {
				endTime
			});

			if (updateRes) {
				wx.showToast({
					title: '下钟成功',
					icon: 'success'
				});
				await this.page.loadTimelineData();
			} else {
				wx.showToast({
					title: '更新失败',
					icon: 'none'
				});
			}
		} catch (error) {
			wx.showToast({
				title: '操作失败',
				icon: 'none'
			});
		} finally {
			this.page.setData({ loading: false });
		}
	}

	/**
	 * 取消预约
	 */
	async cancelReservation(_id: string): Promise<void> {
		wx.showModal({
			title: '确认取消',
			content: '确定要取消此预约吗？',
			confirmText: '确定',
			cancelText: '再想想',
			success: async (res) => {
				if (res.confirm) {
					this.page.setData({ loading: true, loadingText: '取消中...' });
					try {
						const reservation = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id);

						if (!reservation) {
							wx.showToast({ title: '预约不存在', icon: 'none' });
							return;
						}

						// 查找同一顾客同一时段的所有关联预约（含双技师情况）
						const relatedReservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
							date: reservation.date,
							customerName: reservation.customerName,
							startTime: reservation.startTime,
							project: reservation.project,
							status: 'active',
						});

						// 若关联预约为空（可能被并发取消），至少保留当前这条
						const toCancel = relatedReservations.length > 0 ? relatedReservations : [reservation];

						const cancelledAt = new Date().toISOString();
						let allSuccess = true;
						for (const r of toCancel) {
							const ok = await cloudDb.updateById(Collections.RESERVATIONS, r._id, {
								status: 'cancelled',
								cancelledAt
							});
							if (!ok) allSuccess = false;
						}

						if (!allSuccess) {
							wx.showToast({ title: '部分取消失败', icon: 'none' });
							return;
						}

						await this.page.loadTimelineData();

						// 收集所有有手机号的技师，用于推送通知
						const staffList = await app.getActiveStaffs();
						const staffMap = new Map(staffList.map(s => [s._id, s]));

						const techniciansForPush: Array<{ _id: string; name: string; phone: string; wechatWorkId: string; isClockIn: boolean }> = [];
						for (const r of toCancel) {
							if (r.technicianId) {
								const staff = staffMap.get(r.technicianId);
								if (staff && staff.phone) {
									techniciansForPush.push({
										_id: r.technicianId,
										name: r.technicianName || '',
										phone: staff.phone,
										wechatWorkId: staff.wechatWorkId,
										isClockIn: r.isClockIn || false
									});
								}
							}
						}

						if (techniciansForPush.length > 0) {
							const genderLabel = reservation.gender === 'male' ? '先生' : '女士';
							const customerInfo = `${reservation.customerName}${genderLabel}`;
							const technicianMentions = techniciansForPush.map(t => formatMention(t)).join(' ');
							
							const cancelMessage = `【🚫 预约**取消**提醒】

顾客：${customerInfo}
日期：${reservation.date}
时间：**${reservation.startTime} - ${reservation.endTime}**
项目：${reservation.project}
技师：**${technicianMentions}**`;

							this.page.setData({
								'pushModal.show': true,
								'pushModal.type': 'cancel',
								'pushModal.message': cancelMessage,
								'pushModal.reservationData': {
									customerName: reservation.customerName,
									gender: reservation.gender,
									date: reservation.date,
									startTime: reservation.startTime,
									endTime: reservation.endTime,
									project: reservation.project,
									technicians: techniciansForPush
								}
							});
							return;
						}

						wx.showToast({ title: '已取消预约', icon: 'success' });
					} catch (error) {
						wx.showToast({ title: '取消失败', icon: 'none' });
					} finally {
						this.page.setData({ loading: false });
					}
				}
			}
		});
	}

	/**
	 * 确认预约
	 */
	async confirmReserve(): Promise<void> {
		const { reserveForm, availableMaleCount, availableFemaleCount } = this.page.data;

		if (!reserveForm.startTime) {
			wx.showToast({ title: '开始时间必填', icon: 'none' });
			return;
		}

		// 验证技师需求
		if (reserveForm.requirementType === 'specific') {
			if (reserveForm.selectedTechnicians.length === 0) {
				wx.showToast({ title: '请选择技师', icon: 'none' });
				return;
			}
		} else if (reserveForm.requirementType === 'gender') {
			const totalRequired = reserveForm.genderRequirement.male + reserveForm.genderRequirement.female;
			if (totalRequired === 0) {
				wx.showToast({ title: '请选择技师需求', icon: 'none' });
				return;
			}
			if (reserveForm.genderRequirement.male > availableMaleCount) {
				wx.showToast({ title: `可用男技师不足（仅${availableMaleCount}位）`, icon: 'none' });
				return;
			}
			if (reserveForm.genderRequirement.female > availableFemaleCount) {
				wx.showToast({ title: `可用女技师不足（仅${availableFemaleCount}位）`, icon: 'none' });
				return;
			}
			if (totalRequired > 2) {
				wx.showToast({ title: '最多只能预约2位技师', icon: 'none' });
				return;
			}
		}

		this.page.setData({ loading: true, loadingText: '保存中...' });
		try {
			// 计算结束时间
			const [h, m] = reserveForm.startTime.split(':').map(Number);
			const startTotal = h * 60 + m;
			let duration = 90;
			if (reserveForm.project) {
				duration = parseProjectDuration(reserveForm.project);
				if (duration === 0) duration = 60;
			}

			const endTotal = startTotal + duration + 20;
			const endH = Math.floor(endTotal / 60);
			const endM = endTotal % 60;
			const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

			// 如果是编辑模式
			if (reserveForm._id) {
				await this.handleEditReservation(reserveForm, endTime);
				return;
			}

			// 新增模式
			if (reserveForm.requirementType === 'specific') {
				await this.handleSpecificReservation(reserveForm, endTime);
			} else if (reserveForm.requirementType === 'gender') {
				await this.handleGenderReservation(reserveForm, endTime);
			}
		} catch (error) {
			wx.showToast({ title: '保存失败', icon: 'none' });
		} finally {
			this.page.setData({ loading: false });
		}
	}

	/**
	 * 处理编辑预约
	 */
	private async handleEditReservation(reserveForm: typeof this.page.data.reserveForm, endTime: string): Promise<void> {
		const originalReservation = this.page.data.originalReservation;

		let record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>;

		if (reserveForm.requirementType === 'gender') {
			// 性别需求模式：更新性别需求
			const { male, female } = reserveForm.genderRequirement;
			record = {
				date: reserveForm.date,
				customerName: reserveForm.customerName || '',
				gender: reserveForm.gender,
				phone: reserveForm.phone,
				project: reserveForm.project || '待定',
				technicianId: '',
				technicianName: '',
				startTime: reserveForm.startTime,
				endTime: endTime,
				isClockIn: false,
				status: "active",
				genderRequirement: male > 0 ? 'male' : (female > 0 ? 'female' : undefined)
			};
		} else {
			// 点钟模式：更新指定技师
			const firstTech = reserveForm.selectedTechnicians[0];
			record = {
				date: reserveForm.date,
				customerName: reserveForm.customerName || '',
				gender: reserveForm.gender,
				phone: reserveForm.phone,
				project: reserveForm.project || '待定',
				technicianId: firstTech?._id || '',
				technicianName: firstTech?.name || '',
				startTime: reserveForm.startTime,
				endTime: endTime,
				isClockIn: firstTech?.isClockIn || false,
				status: "active"
			};
		}

		const success = await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, reserveForm._id, record);
		if (success) {
			wx.showToast({ title: '保存成功', icon: 'success' });
			// 关闭预约弹窗
			this.closeReserveModal();
			
			// 移除loading锁，显示推送确认弹窗
			this.page.setData({ loading: false });
			await this.showPushConfirmModal(originalReservation, record);
			
			// 立即刷新时间轴数据
			await this.page.loadTimelineData();
		} else {
			wx.showToast({ title: '保存失败', icon: 'none' });
		}
	}

	/**
	 * 显示推送确认弹窗（编辑预约后）
	 */
	private async showPushConfirmModal(
		original: ReservationRecord | null,
		updated: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>
	): Promise<void> {
		if (!original) {
			return;
		}

		// 对比变更内容
		const changes: string[] = [];

		if (original.date !== updated.date) {
			changes.push(`📅 日期：${original.date} → ${updated.date}`);
		}
		if (original.startTime !== updated.startTime) {
			changes.push(`⏰ 时间：${original.startTime} → ${updated.startTime}`);
		}
		if (original.project !== updated.project) {
			changes.push(`💆 项目：${original.project} → ${updated.project}`);
		}
		if (original.technicianId !== updated.technicianId || original.technicianName !== updated.technicianName || (original.isClockIn || false) !== (updated.isClockIn || false)) {
			changes.push(`👨‍💼 技师：${original.technicianName}${original.isClockIn ? '[点]' : ''} → ${updated.technicianName}${updated.isClockIn ? '[点]' : ''}`);
		}
		if (original.customerName !== updated.customerName) {
			changes.push(`👤 顾客：${original.customerName} → ${updated.customerName}`);
		}
		if (original.phone !== updated.phone) {
			changes.push(`📱 电话：${original.phone} → ${updated.phone}`);
		}

		const genderLabel = updated.gender === 'male' ? '先生' : '女士';
		const customerInfo = `${updated.customerName}${genderLabel}`;

		// 获取技师信息
		let staffInfo: StaffInfo | null = null;
		if (updated.technicianId) {
			staffInfo = await app.getStaff(updated.technicianId);
		}
		const technicianMention = staffInfo ? formatMention(staffInfo) : '';
		const technicianName = updated.technicianName || '待定';

		// 构建默认消息
		const defaultMessage = `【📝 预约变更通知】

顾客：${customerInfo}
${changes.join('\n')}

请${technicianMention || technicianName}知悉，做好准备`;

		// 显示推送确认弹窗
		this.page.setData({
			'pushModal.show': true,
			'pushModal.loading': false,
			'pushModal.type': 'edit',
			'pushModal.message': defaultMessage,
			'pushModal.mentions': staffInfo ? [staffInfo] : [],
			pushModalLocked: true,
			'pushModal.reservationData': {
				original,
				updated,
				customerName: updated.customerName,
				gender: updated.gender,
				date: updated.date,
				startTime: updated.startTime,
				endTime: updated.endTime,
				project: updated.project,
				technicians: staffInfo ? [{
					_id: staffInfo._id,
					name: staffInfo.name,
					phone: staffInfo.phone || '',
					wechatWorkId: staffInfo.wechatWorkId || '',
					isClockIn: updated.isClockIn || false
				}] : []
			}
		});
	}

	/**
	 * 处理指定技师预约
	 */
	private async handleSpecificReservation(reserveForm: typeof this.page.data.reserveForm, endTime: string): Promise<void> {
		const technicians = reserveForm.selectedTechnicians;
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
				endTime: endTime,
				isClockIn: false,
				status: "active"
			};
			const success = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
			if (success) {
				wx.showToast({ title: '预约成功', icon: 'success' });
				this.closeReserveModal();
				await this.page.loadTimelineData();
			} else {
				wx.showToast({ title: '保存失败', icon: 'none' });
			}
			return;
		}

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
				endTime: endTime,
				isClockIn: tech.isClockIn || false,
				status: "active"
			};
			const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
			if (insertResult) {
				successCount++;
			}
		}

		if (successCount === technicians.length) {
			await app.loadGlobalData();

			const staffList = await app.getActiveStaffs();
			const staffMap = new Map(staffList.map(s => [s._id, s]));

			const techniciansWithPhone = technicians.map(t => ({
				_id: t._id,
				name: t.name,
				phone: staffMap.get(t._id)?.phone || '',
				wechatWorkId: staffMap.get(t._id)?.wechatWorkId || '',
				isClockIn: t.isClockIn || false
			}));

			// 构建推送消息
			const genderLabel = reserveForm.gender === 'male' ? '先生' : '女士';
			const customerInfo = `${reserveForm.customerName || ''}${genderLabel}`;
			const technicianMentions = techniciansWithPhone.map(t => formatMention(t)).join(' ');
			const reservationType = this.pushHandler.getReservationTypeText(techniciansWithPhone);

			const createMessage = `【⏰ 新预约提醒】

顾客：${customerInfo}
日期：${reserveForm.date}
时间：**${reserveForm.startTime} - ${endTime}**
项目：${reserveForm.project || '待定'}
类型：${reservationType}
技师：**${technicianMentions}**`;

			// 先关闭预约弹窗
			this.closeReserveModal();
			
			// 显示推送确认弹窗
			this.page.setData({
				'pushModal.show': true,
				'pushModal.type': 'create',
				'pushModal.message': createMessage,
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
		} else {
			wx.showToast({ title: `成功创建${successCount}/${technicians.length}条预约`, icon: 'none' });
			this.closeReserveModal();
			await this.page.loadTimelineData();
		}
	}

	/**
	 * 处理性别需求预约
	 */
	private async handleGenderReservation(reserveForm: typeof this.page.data.reserveForm, endTime: string): Promise<void> {
		const { male, female } = reserveForm.genderRequirement;
		const totalRequired = male + female;

		// 获取轮牌数据
		const rotationData = await app.getRotationQueue(reserveForm.date);
		if (!rotationData || !rotationData.staffList || rotationData.staffList.length === 0) {
			wx.showToast({ title: '无法获取轮牌数据', icon: 'none' });
			return;
		}

		// 获取所有员工信息
		const allStaff = await app.getStaffs();
		const staffMap = new Map(allStaff.map(s => [s._id, s]));

		// 按轮牌顺序排序的员工列表
		const rotationStaffList = rotationData.staffList.map(item => ({
			staffId: item.staffId,
			position: item.position,
			staff: staffMap.get(item.staffId)
		})).filter(item => item.staff && item.staff!.status === 'active');

		// 获取该时间段已有的预约和服务记录
		const projectDuration = parseProjectDuration(reserveForm.project) || 60;
		const technicianRes = await wx.cloud.callFunction({
			name: 'getAvailableTechnicians',
			data: {
				date: reserveForm.date,
				currentTime: reserveForm.startTime,
				projectDuration: projectDuration,
				currentReservationIds: []
			}
		});

		let availableTechnicians: StaffAvailability[] = [];
		if (technicianRes.result && typeof technicianRes.result === 'object') {
			const result = technicianRes.result as { code: number; data: StaffAvailability[] };
			if (result.code === 0 && result.data) {
				availableTechnicians = result.data;
			}
		}

		// 构建可用技师的ID集合
		const availableTechnicianIds = new Set(availableTechnicians.map(t => t._id));

		// 按轮牌顺序选择可用技师
		const selectedMaleStaff: Array<{ _id: string; name: string; isClockIn: boolean }> = [];
		const selectedFemaleStaff: Array<{ _id: string; name: string; isClockIn: boolean }> = [];

		for (const rotationItem of rotationStaffList) {
			const staff = rotationItem.staff!;
			const staffId = rotationItem.staffId;

			// 检查技师是否可用
			if (!availableTechnicianIds.has(staffId)) {
				continue;
			}

			// 按性别分配
			if (staff.gender === 'male' && selectedMaleStaff.length < male) {
				selectedMaleStaff.push({
					_id: staffId,
					name: staff.name,
					isClockIn: false
				});
			} else if (staff.gender === 'female' && selectedFemaleStaff.length < female) {
				selectedFemaleStaff.push({
					_id: staffId,
					name: staff.name,
					isClockIn: false
				});
			}

			// 已满足需求，退出循环
			if (selectedMaleStaff.length === male && selectedFemaleStaff.length === female) {
				break;
			}
		}

		// 检查是否成功分配
		if (selectedMaleStaff.length < male || selectedFemaleStaff.length < female) {
			wx.showToast({
				title: `可用技师不足（男${selectedMaleStaff.length}/${male}，女${selectedFemaleStaff.length}/${female}）`,
				icon: 'none'
			});
			return;
		}

		// 合并选中的技师（先生后女）
		const selectedTechnicians = [...selectedMaleStaff, ...selectedFemaleStaff];

		// 为每个选中的技师创建预约
		let successCount = 0;
		for (const tech of selectedTechnicians) {
			const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
				date: reserveForm.date,
				customerName: reserveForm.customerName || '',
				gender: reserveForm.gender,
				phone: reserveForm.phone,
				project: reserveForm.project || '待定',
				technicianId: tech._id,
				technicianName: tech.name,
				startTime: reserveForm.startTime,
				endTime: endTime,
				isClockIn: false,
				status: 'active'
			};
			const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
			if (insertResult) {
				successCount++;
			}
		}

		if (successCount === totalRequired) {
			await app.loadGlobalData();

			const staffList = await app.getActiveStaffs();
			const staffMapNew = new Map(staffList.map(s => [s._id, s]));

			const techniciansWithPhone = selectedTechnicians.map(t => ({
				_id: t._id,
				name: t.name,
				phone: staffMapNew.get(t._id)?.phone || '',
				wechatWorkId: staffMapNew.get(t._id)?.wechatWorkId || '',
				isClockIn: t.isClockIn || false
			}));

			// 构建推送消息
			const genderLabel = reserveForm.gender === 'male' ? '先生' : '女士';
			const customerInfo = `${reserveForm.customerName || ''}${genderLabel}`;
			const technicianMentions = techniciansWithPhone.map(t => formatMention(t)).join(' ');

			const createMessage = `【⏰ 新预约提醒】

顾客：${customerInfo}
日期：${reserveForm.date}
时间：**${reserveForm.startTime} - ${endTime}**
项目：${reserveForm.project || '待定'}
类型：轮钟
技师：**${technicianMentions}**`;

			// 先关闭预约弹窗
			this.closeReserveModal();
			
			// 显示推送确认弹窗
			this.page.setData({
				'pushModal.show': true,
				'pushModal.type': 'create',
				'pushModal.message': createMessage,
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
		} else {
			wx.showToast({ title: `成功创建${successCount}/${totalRequired}条预约`, icon: 'none' });
			this.closeReserveModal();
			await this.page.loadTimelineData();
		}
	}
}
