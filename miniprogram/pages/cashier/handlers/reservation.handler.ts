// reservation.handler.ts - 预约处理器
import { cloudDb, Collections } from '../../../utils/cloud-db';
import { getCurrentDate, formatTime, parseProjectDuration } from '../../../utils/util';
import { hasButtonPermission } from '../../../utils/permission';
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

	private calcTotalDuration(projectNames: string[]): number {
		if (projectNames.length === 0) return 90;
		const durations = projectNames.map(p => parseProjectDuration(p) || 60);
		const sorted = [...durations].sort((a, b) => b - a);
		return sorted.reduce((sum, d) => sum + d + 20, 0) - 20;
	}

	/**
	 * 触发预约单重排
	 */
	async triggerRearrange(date: string): Promise<void> {
		try {
			 await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date,
					mode: 'rearrange'
				}
			});
		} catch (error) {
			console.error('[ReservationHandler] triggerRearrange 失败:', error);
		}
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
		const minutes = now.getMinutes();
		const roundedMinutes = Math.ceil(minutes / 5) * 5;
		const startTime = new Date(now);
		if (roundedMinutes >= 60) {
			startTime.setHours(now.getHours() + 1);
			startTime.setMinutes(0);
		} else {
			startTime.setMinutes(roundedMinutes);
		}

		const startTimeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
		const hourIndex = startTime.getHours();
		const minuteIndex = startTime.getMinutes() / 5;

		this.page.setData({
			showReserveModal: true,
			editingGroupIds: [],
			startTimeMultiIndex: [hourIndex, minuteIndex],
			reserveForm: {
				_id: '',
				date: this.page.data.selectedDate || getCurrentDate(),
				customerName: '',
				gender: 'male',
				project: '',
				projects: [] as string[],
				phone: '',
				requirementType: 'gender',
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
	
				// 判断预约类型：优先使用 requirementType 字段，兼容旧数据
				const requirementType: 'specific' | 'gender' =
					record.requirementType || (record.genderRequirement && !record.technicianId ? 'gender' : 'specific');
						
				let selectedTechnicians: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }> = [];
				let editingGroupIds: string[] = [];
				if (record.technicianId && record.technicianName) {
					// 从 activeStaffList 获取技师信息（无需依赖尚未刷新的 staffAvailability）
					const staffInfo = this.page.data.activeStaffList.find(s => s._id === record.technicianId);
					if (staffInfo) {
						selectedTechnicians.push({ _id: staffInfo._id, name: staffInfo.name, phone: staffInfo.phone || '', isClockIn: record.isClockIn || false });
					}
					editingGroupIds = [record._id];
				}
						
				// 如果有 groupKey，加载所有组成员
				if (record.groupKey && requirementType === 'specific') {
					const groupMembers = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
						groupKey: record.groupKey,
						status: 'active',
					});
					selectedTechnicians = [];
					editingGroupIds = [];
					for (const member of groupMembers) {
						editingGroupIds.push(member._id);
						if (member.technicianId && member.technicianName) {
							const staffInfo = this.page.data.activeStaffList.find(s => s._id === member.technicianId);
							selectedTechnicians.push({
								_id: member.technicianId,
								name: member.technicianName,
								phone: staffInfo?.phone || '',
								isClockIn: member.isClockIn || false
							});
						}
					}
				}
						
				this.page.setData({
					showReserveModal: true,
					editingGroupIds,
					startTimeMultiIndex: [parseInt(record.startTime.split(':')[0]), parseInt(record.startTime.split(':')[1]) / 5],
					reserveForm: {
						_id: record._id,
						date: record.date,
						customerName: record.customerName,
						gender: record.gender,
						project: record.project,
						projects: record.project ? [record.project] : [],
						phone: record.phone,
						requirementType,
						selectedTechnicians,
						// 使用 requiredMaleCount/requiredFemaleCount 回填实际数量
						genderRequirement: requirementType === 'gender'
							? { male: record.requiredMaleCount || 0, female: record.requiredFemaleCount || 0 }
							: { male: 0, female: 0 },
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
			const { date, startTime, projects, project, _id: editingReservationId } = this.page.data.reserveForm;
			if (!date || !startTime) return;

			this.page.setData({ loading: true, loadingText: '检查技师可用性...' });

			const projectNames = projects && projects.length > 0 ? projects : (project ? [project] : []);
			const projectDuration = this.calcTotalDuration(projectNames);

		// 编辑模式下，排除当前编辑的所有预约（包括分组成员），使其原技师可选
			const editingGroupIds = this.page.data.editingGroupIds;
			const currentReservationIds = editingGroupIds.length > 0
				? editingGroupIds
				: (editingReservationId ? [editingReservationId] : []);

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
			reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount + 1;
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
	 * 开始时间选择变更
	 */
	onStartTimeChange(e: WechatMiniprogram.CustomEvent): void {
		const [hourIndex, minuteIndex] = e.detail.value as [number, number];
		const { reserveForm } = this.page.data;
		const hours = this.page.data.startTimeRange[0];
		const minutes = this.page.data.startTimeRange[1];
		const startTime = `${hours[hourIndex]}:${minutes[minuteIndex]}`;
		reserveForm.startTime = startTime;
		this.page.setData({
			reserveForm,
			startTimeMultiIndex: [hourIndex, minuteIndex]
		});
		this.page.checkStaffAvailability();
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
			selectedTechnicians.push({ _id, name, phone, wechatWorkId: staff?.wechatWorkId, isClockIn: true });
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
	 * 选择项目
	 */
	async selectReserveProject(e: WechatMiniprogram.CustomEvent): Promise<void> {
		const { projects, project } = e.detail;
		if (projects !== undefined) {
			this.page.setData({ 'reserveForm.projects': projects });
		} else {
			const currentProject = this.page.data.reserveForm.project;
			this.page.setData({
				'reserveForm.project': currentProject === project ? '' : project
			});
		}
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
				// 提前下钟后触发重排，确保后续预约能及时感知占用变化
				await this.triggerRearrange(record.date);
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

						await this.triggerRearrange(reservation.date);
						await this.page.loadTimelineData();
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
		}

		this.page.setData({ loading: true, loadingText: '保存中...' });
		try {
			const projectNames = reserveForm.projects && reserveForm.projects.length > 0
				? reserveForm.projects
				: (reserveForm.project ? [reserveForm.project] : []);

			// 如果是编辑模式
			if (reserveForm._id) {
				await this.handleEditReservation(reserveForm, projectNames);
				return;
			}

			// 新增模式
			if (reserveForm.requirementType === 'specific') {
				await this.handleSpecificReservation(reserveForm, projectNames);
			} else if (reserveForm.requirementType === 'gender') {
				await this.handleGenderReservation(reserveForm, projectNames);
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
	private async handleEditReservation(reserveForm: typeof this.page.data.reserveForm, projectNames: string[]): Promise<void> {

		const resolvedProjects = projectNames.length > 0 ? projectNames : ['待定'];
		const totalDuration = this.calcTotalDuration(resolvedProjects);
		const [sh, sm] = reserveForm.startTime.split(':').map(Number);
		const startTotal = sh * 60 + sm;
		const endTotal = startTotal + totalDuration;
		const endH = Math.floor(endTotal / 60);
		const endM = endTotal % 60;
		const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

		let record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>;

		const generateGroupKey = () => {
			return 'GRP_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
		};
		
		const groupKey = reserveForm.requirementType === 'gender' ? generateGroupKey() : undefined;
		
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
				genderRequirement: male > 0 ? 'male' : (female > 0 ? 'female' : undefined),
				requirementType: 'gender',
				requiredMaleCount: male,
				requiredFemaleCount: female,
				groupKey
			};
			const success = await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, reserveForm._id, record);
			if (success) {
				wx.showToast({ title: '保存成功', icon: 'success' });
				this.closeReserveModal();
				await this.triggerRearrange(reserveForm.date);
				await this.page.loadTimelineData();
			} else {
				wx.showToast({ title: '保存失败', icon: 'none' });
			}
		} else {
			// 点钟模式
			const originalRecord = this.page.data.originalReservation;
			const originalGroupKey = originalRecord?.groupKey;
			if (originalGroupKey) {
				// 分组预约：取消旧组记录，按新技师重建
				const groupMembers = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
					groupKey: originalGroupKey,
					status: 'active',
				});
				const cancelledAt = new Date().toISOString();
				for (const member of groupMembers) {
					await cloudDb.updateById(Collections.RESERVATIONS, member._id, {
						status: 'cancelled',
						cancelledAt
					});
				}
				let successCount = 0;
				for (const tech of reserveForm.selectedTechnicians) {
					const newRecord: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
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
						status: 'active',
						requirementType: 'specific',
						requiredMaleCount: 0,
						requiredFemaleCount: 0,
						groupKey: originalGroupKey
					};
					const ok = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, newRecord);
					if (ok) successCount++;
				}
				wx.showToast({
					title: successCount === reserveForm.selectedTechnicians.length
						? '保存成功'
						: `成功更新${successCount}/${reserveForm.selectedTechnicians.length}条`,
					icon: 'success'
				});
				this.closeReserveModal();
				await this.triggerRearrange(reserveForm.date);
				await this.page.loadTimelineData();
			} else {
				// 单个预约：更新指定技师
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
					status: "active",
					requirementType: 'specific',
					requiredMaleCount: 0,
					requiredFemaleCount: 0,
					groupKey: originalRecord?.groupKey || undefined
				};
				const success = await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, reserveForm._id, record);
				if (success) {
					wx.showToast({ title: '保存成功', icon: 'success' });
					this.closeReserveModal();
					await this.triggerRearrange(reserveForm.date);
					await this.page.loadTimelineData();
				} else {
					wx.showToast({ title: '保存失败', icon: 'none' });
				}
			}
		}
	}

	/**
	 * 处理指定技师预约
	 */
	private async handleSpecificReservation(reserveForm: typeof this.page.data.reserveForm, projectNames: string[]): Promise<void> {
		const technicians = reserveForm.selectedTechnicians;
		if (technicians.length === 0) {
			wx.showToast({ title: '请至少选择一位技师', icon: 'none' });
			return;
		}

		const resolvedProjects = projectNames.length > 0 ? projectNames : ['待定'];
		const durations = resolvedProjects.map(p => ({ name: p, dur: parseProjectDuration(p) || 60 }));
		durations.sort((a, b) => b.dur - a.dur);

		let successCount = 0;
		const expectedCount = technicians.length * durations.length;
		const generateGroupKey = () => {
			return 'GRP_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
		};
		const groupKey = (technicians.length > 1 || durations.length > 1) ? generateGroupKey() : undefined;

		const [baseH, baseM] = reserveForm.startTime.split(':').map(Number);
		const baseTotal = baseH * 60 + baseM;

		for (const tech of technicians) {
			let currentStart = baseTotal;
			for (const d of durations) {
				const currentEnd = currentStart + d.dur + 20;
				const cEndH = Math.floor(currentEnd / 60);
				const cEndM = currentEnd % 60;
				const cEndTime = `${String(cEndH).padStart(2, '0')}:${String(cEndM).padStart(2, '0')}`;
				const cStartH = Math.floor(currentStart / 60);
				const cStartM = currentStart % 60;
				const cStartTime = `${String(cStartH).padStart(2, '0')}:${String(cStartM).padStart(2, '0')}`;

				const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
					date: reserveForm.date,
					customerName: reserveForm.customerName || '',
					gender: reserveForm.gender,
					phone: reserveForm.phone,
					project: d.name,
					technicianId: tech._id,
					technicianName: tech.name,
					startTime: cStartTime,
					endTime: cEndTime,
					isClockIn: tech.isClockIn || false,
					status: 'active',
					requirementType: 'specific',
					requiredMaleCount: 0,
					requiredFemaleCount: 0,
					groupKey
				};
				const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
				if (insertResult) successCount++;
				currentStart = currentEnd;
			}
		}

		if (successCount === expectedCount) {
			await app.loadGlobalData();
			wx.showToast({ title: '预约成功', icon: 'success' });
		} else {
			wx.showToast({ title: `成功创建${successCount}/${expectedCount}条预约`, icon: 'none' });
		}
		this.closeReserveModal();
		await this.triggerRearrange(reserveForm.date);
		await this.page.loadTimelineData();
	}

	/**
	 * 处理性别需求预约
	 */
	private async handleGenderReservation(reserveForm: typeof this.page.data.reserveForm, projectNames: string[]): Promise<void> {
		const { male, female } = reserveForm.genderRequirement;
		const totalRequired = male + female;

		const resolvedProjects = projectNames.length > 0 ? projectNames : ['待定'];
		const durations = resolvedProjects.map(p => ({ name: p, dur: parseProjectDuration(p) || 60 }));
		durations.sort((a, b) => b.dur - a.dur);
		const totalDuration = this.calcTotalDuration(resolvedProjects);

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

		const technicianRes = await wx.cloud.callFunction({
			name: 'getAvailableTechnicians',
			data: {
				date: reserveForm.date,
				currentTime: reserveForm.startTime,
				projectDuration: totalDuration,
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

		// 生成预约组标识
		const generateGroupKey = () => {
			return 'GRP_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
		};
		const groupKey = (totalRequired > 1 || durations.length > 1) ? generateGroupKey() : undefined;

		const [baseH, baseM] = reserveForm.startTime.split(':').map(Number);
		const baseTotal = baseH * 60 + baseM;

		let successCount = 0;
		const expectedCount = selectedTechnicians.length * durations.length;

		for (const tech of selectedTechnicians) {
			let currentStart = baseTotal;
			for (const d of durations) {
				const currentEnd = currentStart + d.dur + 20;
				const cEndH = Math.floor(currentEnd / 60);
				const cEndM = currentEnd % 60;
				const cEndTime = `${String(cEndH).padStart(2, '0')}:${String(cEndM).padStart(2, '0')}`;
				const cStartH = Math.floor(currentStart / 60);
				const cStartM = currentStart % 60;
				const cStartTime = `${String(cStartH).padStart(2, '0')}:${String(cStartM).padStart(2, '0')}`;

				const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
					date: reserveForm.date,
					customerName: reserveForm.customerName || '',
					gender: reserveForm.gender,
					phone: reserveForm.phone,
					project: d.name,
					technicianId: tech._id,
					technicianName: tech.name,
					startTime: cStartTime,
					endTime: cEndTime,
					isClockIn: false,
					status: 'active',
					genderRequirement: male > 0 ? 'male' : 'female',
					requirementType: 'gender',
					requiredMaleCount: male,
					requiredFemaleCount: female,
					groupKey
				};
				const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
				if (insertResult) successCount++;
				currentStart = currentEnd;
			}
		}

		if (successCount === expectedCount) {
			await app.loadGlobalData();
			wx.showToast({ title: '预约成功', icon: 'success' });
			await this.triggerRearrange(reserveForm.date);
			this.closeReserveModal();
		} else {
			wx.showToast({ title: `成功创建${successCount}/${expectedCount}条预约`, icon: 'none' });
			await this.triggerRearrange(reserveForm.date);
			this.closeReserveModal();
		}
	}
}
