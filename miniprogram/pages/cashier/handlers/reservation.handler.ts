// reservation.handler.ts - 预约处理器
import {cloudDb, Collections} from '../../../utils/cloud-db';
import {formatTime} from '../../../utils/util';
import type {CashierPage} from '../cashier.types';
import {PushHandler} from './push.handler';
import {
	ReservationService,
	getNextFiveMinuteTime,
	calcTotalDuration,
	generateGroupKey,
} from '../../../services/reservation.service';

const app = getApp<IAppOption>();

export class ReservationHandler {
	private page: CashierPage;
	private pushHandler: PushHandler;

	constructor(page: CashierPage) {
		this.page = page;
		this.pushHandler = new PushHandler(page);
	}

	/**
	 * 触发预约单重排
	 */
	async triggerRearrange(date: string): Promise<void> {
		await ReservationService.triggerRearrange(date);
	}

	/**
	 * 打开预约弹窗
	 */
	async openReserveModal(): Promise<void> {
		if (!ReservationService.canCreateReservation()) {
			wx.showToast({title: '您没有权限新增预约', icon: 'none'});
			return;
		}

		const startTimeStr = getNextFiveMinuteTime();
		const [hour, minute] = startTimeStr.split(':').map(Number);
		const hourIndex = hour;
		const minuteIndex = minute / 5;

		const initialForm = ReservationService.createInitialForm(this.page.data.selectedDate);
		initialForm.requirementType = 'gender';

		this.page.setData({
			showReserveModal: true,
			editingGroupIds: [],
			startTimeMultiIndex: [hourIndex, minuteIndex],
			reserveForm: initialForm,
		});
		await this.page.checkStaffAvailability();
	}

	/**
	 * 关闭预约弹窗
	 */
	closeReserveModal(): void {
		this.page.setData({showReserveModal: false});
		this.page.loadTimelineData();
	}

	/**
	 * 编辑预约
	 */
	async editReservation(_id: string): Promise<void> {
		this.page.setData({loading: true, loadingText: '加载中...'});
		try {
			const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id);
			if (record) {
				if (record.status === 'cancelled') {
					wx.showToast({title: '该预约已取消，无法编辑', icon: 'none'});
					this.page.setData({loading: false});
					return;
				}

				// 判断预约类型：优先使用 requirementType 字段，兼容旧数据
				const requirementType: 'specific' | 'gender' =
					record.requirementType || (record.genderRequirement && !record.technicianId ? 'gender' : 'specific');

				let selectedTechnicians: Array<{_id: string; name: string; phone: string; isClockIn: boolean;}> = [];
				let editingGroupIds: string[] = [];
				if (record.technicianId && record.technicianName) {
					// 从 activeStaffList 获取技师信息（无需依赖尚未刷新的 staffAvailability）
					const staffInfo = this.page.data.activeStaffList.find(s => s._id === record.technicianId);
					if (staffInfo) {
						selectedTechnicians.push({_id: staffInfo._id, name: staffInfo.name, phone: staffInfo.phone || '', isClockIn: record.isClockIn || false});
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
						projects: record.project ? record.project.split('&').filter(p => p !== '待定') : [],
						phone: record.phone,
						requirementType,
						selectedTechnicians,
						// 使用 requiredMaleCount/requiredFemaleCount 回填实际数量
						genderRequirement: requirementType === 'gender'
							? {male: record.requiredMaleCount || 0, female: record.requiredFemaleCount || 0}
							: {male: 0, female: 0},
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
			this.page.setData({loading: false});
		}
	}

	/**
	 * 检查技师在预约时段的可用性
	 */
	async checkStaffAvailability(): Promise<void> {
		try {
			const {date, startTime, projects, project, _id: editingReservationId} = this.page.data.reserveForm;
			if (!date || !startTime) return;

			this.page.setData({loading: true, loadingText: '检查技师可用性...'});

			const projectNames = projects && projects.length > 0 ? projects : (project ? [project] : []);

			const editingGroupIds = this.page.data.editingGroupIds;
			const currentReservationIds = editingGroupIds.length > 0
				? editingGroupIds
				: (editingReservationId ? [editingReservationId] : []);

			const res = await ReservationService.checkStaffAvailability(date, startTime, projectNames, currentReservationIds);

			if (res.success && res.data) {
				const selectedTechnicianIds = this.page.data.reserveForm.selectedTechnicians.map(t => t._id);
				const selectedTechniciansMap = new Map(this.page.data.reserveForm.selectedTechnicians.map(t => [t._id, t]));

				const staffAvailability = res.data.map(staff => {
					const selectedTech = selectedTechniciansMap.get(staff._id);
					return {
						...staff,
						isSelected: selectedTechnicianIds.includes(staff._id),
						isClockIn: selectedTech?.isClockIn || false
					};
				});

				this.page.setData({
					staffAvailability,
					availableMaleCount: res.maleCount || 0,
					availableFemaleCount: res.femaleCount || 0
				});
			} else {
				wx.showToast({
					title: res.message || '获取技师列表失败',
					icon: 'none'
				});
			}
		} catch (error) {
			wx.showToast({
				title: '获取技师列表失败',
				icon: 'none'
			});
		} finally {
			this.page.setData({loading: false});
		}
	}

	/**
	 * 切换技师需求类型
	 */
	onRequirementTypeChange(e: WechatMiniprogram.CustomEvent): void {
		const {value} = e.detail;
		const {reserveForm} = this.page.data;
		reserveForm.requirementType = value as 'specific' | 'gender';

		// 切换时清空选择
		if (value === 'gender') {
			reserveForm.selectedTechnicians = [];
			reserveForm.genderRequirement = {male: 0, female: 0};
		} else {
			reserveForm.genderRequirement = {male: 0, female: 0};
		}

		this.page.setData({reserveForm});
	}

	/**
	 * 调整性别数量
	 */
	onChangeGenderCount(e: WechatMiniprogram.CustomEvent): void {
		const {gender, action} = e.currentTarget.dataset;
		const {reserveForm} = this.page.data;
		const currentCount = reserveForm.genderRequirement[gender as 'male' | 'female'];

		if (action === 'increase') {
			reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount + 1;
		} else if (action === 'decrease') {
			if (currentCount > 0) {
				reserveForm.genderRequirement[gender as 'male' | 'female'] = currentCount - 1;
			}
		}

		this.page.setData({reserveForm});
		this.page.checkStaffAvailability();
	}

	/**
	 * 表单字段变更
	 */
	onReserveFieldChange(e: WechatMiniprogram.CustomEvent): void {
		const {field} = e.currentTarget.dataset;
		const val = e.detail.value;
		const {reserveForm} = this.page.data;

		if (field === 'startTime' || field === 'date') {
			reserveForm[field as 'startTime' | 'date'] = val;
			this.page.setData({reserveForm});
			this.page.checkStaffAvailability();
		} else {
			reserveForm[field as 'customerName' | 'phone'] = val;
			this.page.setData({reserveForm});
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
		const {reserveForm} = this.page.data;
		const hours = this.page.data.startTimeRange[0];
		const minutes = this.page.data.startTimeRange[1];
		const startTime = `${ hours[hourIndex] }:${ minutes[minuteIndex] }`;
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
		const {_id, technician: name, occupied, reason, phone, hasNonClockInConflict} = e.detail;

		// 预约场景下，即使有占用也允许选择，只显示提示
		if (occupied) {
			wx.showToast({title: reason || '该技师在此时段已有安排，请注意协调', icon: 'none', duration: 2500});
		} else if (hasNonClockInConflict) {
			wx.showToast({title: '该技师有非点钟预约冲突，请注意协调', icon: 'none', duration: 2500});
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
			selectedTechnicians.push({_id, name, phone, wechatWorkId: staff?.wechatWorkId, isClockIn: true});
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
		const {projects, project} = e.detail;
		if (projects !== undefined) {
			// 过滤掉占位项目"待定"，防止旧数据残留影响时长计算
			const filtered = projects.filter((p: string) => p !== '待定');
			this.page.setData({
				'reserveForm.projects': filtered,
				'reserveForm.project': filtered.join('&')
			});
		} else {
			const currentProject = this.page.data.reserveForm.project;
			const newProject = currentProject === project ? '' : project;
			this.page.setData({
				'reserveForm.project': newProject,
				'reserveForm.projects': newProject ? [newProject] : []
			});
		}
		await this.page.checkStaffAvailability();
	}

	/**
	 * 修改性别
	 */
	onReserveGenderChange(e: WechatMiniprogram.CustomEvent): void {
		this.page.setData({'reserveForm.gender': e.detail.value});
		this.page.searchCustomer();
	}

	onRenewalToggle(e: WechatMiniprogram.CustomEvent): void {
		const isRenewal = (e.detail.value as string[]).length > 0;
		this.page.setData({'reserveForm.isRenewal': isRenewal});
	}

	/**
	 * 处理到店操作 - 显示确认弹窗
	 */
	async handleArrival(reserveId: string): Promise<void> {
		this.page.setData({loading: true, loadingText: '加载中...'});
		try {
			const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
			if (!record) {
				wx.showToast({title: '预约不存在', icon: 'none'});
				this.page.setData({loading: false});
				return;
			}

			if (record.status === 'cancelled') {
				wx.showToast({title: '该预约已取消', icon: 'none'});
				this.page.setData({loading: false});
				return;
			}

			this.page.setData({loading: false});

			this.page.setData({
				'arrivalConfirmModal.show': true,
				'arrivalConfirmModal.reserveId': reserveId,
				'arrivalConfirmModal.customerName': record.customerName + (record.gender === 'male' ? '先生' : '女士'),
				'arrivalConfirmModal.project': record.project,
				'arrivalConfirmModal.technicianName': record.technicianName || '未指定'
			});
		} catch (error) {
			wx.showToast({title: '加载失败', icon: 'none'});
			this.page.setData({loading: false});
		}
	}

	/**
	 * 处理到店操作 - 实际执行
	 */
	async processArrival(reserveId: string, shouldPushNotification: boolean): Promise<void> {
		this.page.setData({loading: true, loadingText: '处理中...'});
		try {
			const record = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
			if (!record) {
				wx.showToast({title: '预约不存在', icon: 'none'});
				this.page.setData({loading: false});
				return;
			}

			if (record.status === 'cancelled') {
				wx.showToast({title: '该预约已取消', icon: 'none'});
				this.page.setData({loading: false});
				return;
			}

			let reservations: ReservationRecord[];

			if (record.groupKey) {
				reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
					groupKey: record.groupKey,
					status: 'active',
				});
			} else {
				reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
					date: record.date,
					customerName: record.customerName,
					startTime: record.startTime,
					project: record.project,
					status: 'active',
				});
			}

			if (shouldPushNotification) {
				await this.pushHandler.sendArrivalNotification(reservations);
			}

			for (const r of reservations) {
				await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, r._id, {
					isFulfilled: true
				});
			}

			this.page.setData({loading: false});

			if (reservations.length > 1) {
				const reserveIds = reservations.map(r => r._id).join(',');
				wx.navigateTo({url: `/pages/index/index?reserveIds=${ reserveIds }`});
			} else {
				wx.navigateTo({url: `/pages/index/index?reserveId=${ reserveId }`});
			}
		} catch (error) {
			wx.showToast({title: '处理失败', icon: 'none'});
			this.page.setData({loading: false});
		}
	}

	/**
	 * 提前下钟操作
	 */
	async handleEarlyFinish(recordId: string): Promise<void> {
		this.page.setData({loading: true, loadingText: '处理中...'});

		try {
			const record = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, recordId);
			if (!record) {
				wx.showToast({
					title: '记录不存在',
					icon: 'none'
				});
				this.page.setData({loading: false});
				return;
			}

			const modalRes = await wx.showModal({
				title: '提前下钟',
				content: `确认要为技师 ${ record.technician || '' }（房间：${ record.room || '' }）提前下钟吗？\n\n将把结束时间更新为当前时间。`,
				confirmText: '确定',
				cancelText: '取消'
			});

			if (!modalRes.confirm) {
				this.page.setData({loading: false});
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
			this.page.setData({loading: false});
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
					this.page.setData({loading: true, loadingText: '取消中...'});
					try {
						const cancelRes = await ReservationService.cancelReservation(_id);

						if (!cancelRes.success) {
							wx.showToast({title: '预约不存在', icon: 'none'});
							return;
						}

						await this.triggerRearrange(cancelRes.reservation?.date || '');
						await this.page.loadTimelineData();
						wx.showToast({title: '已取消预约', icon: 'success'});
					} catch (error) {
						wx.showToast({title: '取消失败', icon: 'none'});
					} finally {
						this.page.setData({loading: false});
					}
				}
			}
		});
	}

	/**
	 * 确认预约
	 */
	async confirmReserve(): Promise<void> {
		const {reserveForm, availableMaleCount, availableFemaleCount} = this.page.data;

		if (!reserveForm.startTime) {
			wx.showToast({title: '开始时间必填', icon: 'none'});
			return;
		}

		// 验证技师需求
		if (reserveForm.requirementType === 'specific') {
			if (reserveForm.selectedTechnicians.length === 0) {
				wx.showToast({title: '请选择技师', icon: 'none'});
				return;
			}
		} else if (reserveForm.requirementType === 'gender') {
			const totalRequired = reserveForm.genderRequirement.male + reserveForm.genderRequirement.female;
			if (totalRequired === 0) {
				wx.showToast({title: '请选择技师需求', icon: 'none'});
				return;
			}
			const staffAvailability = this.page.data.staffAvailability || [];
			const totalMales = staffAvailability.filter(s => s.gender === 'male').length;
			const totalFemales = staffAvailability.filter(s => s.gender === 'female').length;
			if (reserveForm.genderRequirement.male > totalMales) {
				wx.showToast({title: `男技师不足（共${ totalMales }位）`, icon: 'none'});
				return;
			}
			if (reserveForm.genderRequirement.female > totalFemales) {
				wx.showToast({title: `女技师不足（共${ totalFemales }位）`, icon: 'none'});
				return;
			}
			if (reserveForm.genderRequirement.male > availableMaleCount) {
				wx.showToast({title: '所选时段可用男技师不足，将自动分配', icon: 'none', duration: 2000});
			}
			if (reserveForm.genderRequirement.female > availableFemaleCount) {
				wx.showToast({title: '所选时段可用女技师不足，将自动分配', icon: 'none', duration: 2000});
			}
		}

		this.page.setData({loading: true, loadingText: '保存中...'});
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
			wx.showToast({title: '保存失败', icon: 'none'});
		} finally {
			this.page.setData({loading: false});
		}
	}

	/**
	 * 处理编辑预约
	 */
	private async handleEditReservation(reserveForm: typeof this.page.data.reserveForm, projectNames: string[]): Promise<void> {
		const resolvedProjects = projectNames.length > 0 ? projectNames : ['待定'];
		const projectStr = resolvedProjects.join('&');

		if (reserveForm.requirementType === 'gender') {
			const originalRecord = this.page.data.originalReservation;
			const dbRecord = !originalRecord
				? await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveForm._id)
				: null;
			const oldGroupKey = originalRecord?.groupKey || dbRecord?.groupKey;

			if (oldGroupKey) {
				// 有分组：重新分配技师后用 updateGroupReservations 直接更新现有记录
				const {male, female} = reserveForm.genderRequirement;
				const allocateRes = await ReservationService.allocateTechniciansByGender(
					reserveForm.date,
					reserveForm.startTime,
					projectNames,
					male,
					female
				);
				if (!allocateRes.success || !allocateRes.technicians) {
					throw new Error(allocateRes.message || '分配技师失败');
				}

				const updateRes = await ReservationService.updateGroupReservations(
					oldGroupKey,
					reserveForm,
					resolvedProjects,
					allocateRes.technicians
				);

				if (!updateRes.success) {
					throw new Error(updateRes.message || '更新失败');
				}
				wx.showToast({title: `已更新${ updateRes.updatedCount }条预约`, icon: 'success'});
			} else {
				// 无分组旧记录：取消旧记录，创建新记录
				await cloudDb.updateById(Collections.RESERVATIONS, reserveForm._id, {
					status: 'cancelled',
					cancelledAt: new Date().toISOString()
				});
				await this.createGenderReservationRecords(reserveForm, projectNames);
				wx.showToast({title: '保存成功', icon: 'success'});
			}
			this.closeReserveModal();
			await this.triggerRearrange(reserveForm.date);
			await this.page.loadTimelineData();
		} else {
			// 点钟模式
			const originalRecord = this.page.data.originalReservation;
			const originalGroupKey = originalRecord?.groupKey;

			if (originalGroupKey) {
				// 有分组：直接更新现有记录
				const updateRes = await ReservationService.updateGroupReservations(
					originalGroupKey,
					reserveForm,
					resolvedProjects,
					reserveForm.selectedTechnicians
				);

				if (!updateRes.success) {
					throw new Error(updateRes.message || '更新失败');
				}
				wx.showToast({title: `已更新${ updateRes.updatedCount }条预约`, icon: 'success'});
				this.closeReserveModal();
				await this.triggerRearrange(reserveForm.date);
				await this.page.loadTimelineData();
			} else {
				// 无分组单条记录
				const dbRecord = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveForm._id);
				const effectiveGroupKey = originalRecord?.groupKey || dbRecord?.groupKey;

				if (effectiveGroupKey) {
					// 数据库中有 groupKey（旧数据可能有）：同步更新所有组成员基本信息
					const groupMembers = await ReservationService.getGroupReservations(effectiveGroupKey);
					for (const member of groupMembers) {
						await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, member._id, {
							date: reserveForm.date,
							customerName: reserveForm.customerName || '',
							gender: reserveForm.gender,
							phone: reserveForm.phone,
							project: projectStr,
							startTime: reserveForm.startTime,
							isRenewal: reserveForm.isRenewal || false,
						});
					}
					wx.showToast({title: `已同步更新${ groupMembers.length }条预约`, icon: 'success'});
				} else {
					const updatedForm = {...reserveForm, project: projectStr};
					const success = await ReservationService.updateReservation(reserveForm._id, updatedForm, '');
					if (!success) {
						wx.showToast({title: '保存失败', icon: 'none'});
						return;
					}
					wx.showToast({title: '保存成功', icon: 'success'});
				}
				this.closeReserveModal();
				await this.triggerRearrange(reserveForm.date);
				await this.page.loadTimelineData();
			}
		}
	}

	/**
	 * 处理指定技师预约
	 */
	private async handleSpecificReservation(reserveForm: typeof this.page.data.reserveForm, projectNames: string[]): Promise<void> {
		const technicians = reserveForm.selectedTechnicians;
		if (technicians.length === 0) {
			wx.showToast({title: '请至少选择一位技师', icon: 'none'});
			return;
		}

		const resolvedProjects = projectNames.length > 0 ? projectNames : ['待定'];
		const durations = resolvedProjects.map(p => ({name: p, dur: calcTotalDuration([p]) || 90}));
		durations.sort((a, b) => b.dur - a.dur);

		const groupKey = (technicians.length > 1 || durations.length > 1) ? generateGroupKey() : undefined;

		const createResult = await ReservationService.createTimeSeriesReservations(
			reserveForm,
			technicians,
			resolvedProjects,
			groupKey
		);

		if (createResult.successCount === createResult.expectedCount) {
			await app.loadGlobalData();
			wx.showToast({title: '预约成功', icon: 'success'});
		} else {
			wx.showToast({title: `成功创建${ createResult.successCount }/${ createResult.expectedCount }条预约`, icon: 'none'});
		}
		this.closeReserveModal();
		await this.triggerRearrange(reserveForm.date);
		await this.page.loadTimelineData();
	}

	/**
	 * 按性别需求选择技师并创建预约记录（供新增和编辑复用）
	 * @returns { successCount, expectedCount, hasConflict }
	 */
	private async createGenderReservationRecords(
		reserveForm: typeof this.page.data.reserveForm,
		projectNames: string[]
	): Promise<{successCount: number; expectedCount: number; hasConflict: boolean;}> {
		const {male, female} = reserveForm.genderRequirement;

		const allocateRes = await ReservationService.allocateTechniciansByGender(
			reserveForm.date,
			reserveForm.startTime,
			projectNames,
			male,
			female
		);

		if (!allocateRes.success || !allocateRes.technicians) {
			throw new Error(allocateRes.message || '分配技师失败');
		}

		const resolvedProjects = projectNames.length > 0 ? projectNames : ['待定'];
		const durations = resolvedProjects.map(p => ({name: p, dur: calcTotalDuration([p]) || 90}));
		durations.sort((a, b) => b.dur - a.dur);

		const totalRequired = male + female;
		const groupKey = (totalRequired > 1 || durations.length > 1) ? generateGroupKey() : undefined;

		const createResult = await ReservationService.createTimeSeriesReservations(
			reserveForm,
			allocateRes.technicians,
			resolvedProjects,
			groupKey
		);

		return {
			successCount: createResult.successCount,
			expectedCount: createResult.expectedCount,
			hasConflict: allocateRes.hasConflict || false
		};
	}

	/**
	 * 处理性别需求预约
	 */
	private async handleGenderReservation(reserveForm: typeof this.page.data.reserveForm, projectNames: string[]): Promise<void> {
		try {
			const {successCount, expectedCount, hasConflict} = await this.createGenderReservationRecords(reserveForm, projectNames);

			if (hasConflict) {
				wx.showToast({title: '部分技师在所选时段有冲突，已自动分配', icon: 'none', duration: 2500});
			}

			if (successCount === expectedCount) {
				await app.loadGlobalData();
				wx.showToast({title: '预约成功', icon: 'success'});
			} else {
				wx.showToast({title: `成功创建${ successCount }/${ expectedCount }条预约`, icon: 'none'});
			}
		} catch (e: any) {
			wx.showToast({title: e?.message || '预约失败', icon: 'none'});
		} finally {
			await this.triggerRearrange(reserveForm.date);
			this.closeReserveModal();
		}
	}
}
