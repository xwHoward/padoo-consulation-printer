/**
 * 预约服务类
 * 封装预约相关的核心业务逻辑，供多个页面复用
 */
import {cloudDb, Collections} from '../utils/cloud-db';
import {getCurrentDate, parseProjectDuration} from '../utils/util';
import {hasButtonPermission} from '../utils/permission';
import type {ReserveForm} from '../types/reservation.types';

const app = getApp<IAppOption>();

const RESERVATION_REDUNDANT_DURATION = 20;

export function generateGroupKey(): string {
	return 'GRP_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function calcTotalDuration(projectNames: string[]): number {
	if (projectNames.length === 0) return 90;
	const durations = projectNames.map(p => parseProjectDuration(p) || 90);
	const sorted = [...durations].sort((a, b) => b - a);
	return sorted.reduce((sum, d) => sum + d, RESERVATION_REDUNDANT_DURATION);
}

export function getNextFiveMinuteTime(): string {
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
	return `${ String(startTime.getHours()).padStart(2, '0') }:${ String(startTime.getMinutes()).padStart(2, '0') }`;
}

/** 默认预约表单 */
export const DEFAULT_RESERVE_FORM: ReserveForm = {
	_id: '',
	date: '',
	customerName: '',
	gender: 'male',
	project: '',
	projects: [],
	phone: '',
	requirementType: 'specific',
	selectedTechnicians: [],
	genderRequirement: {male: 0, female: 0},
	startTime: '',
	technicianId: '',
	technicianName: '',
	isRenewal: false,
};

/**
 * 计算最近的整点或半点时间
 */
export function getNextHalfHourTime(): string {
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
	return `${ String(startTime.getHours()).padStart(2, '0') }:${ String(startTime.getMinutes()).padStart(2, '0') }`;
}

/**
 * 根据项目计算结束时间
 */
export function calculateEndTime(startTime: string, project: string | string[]): string {
	const [h, m] = startTime.split(':').map(Number);
	const startTotal = h * 60 + m;

	let duration: number;
	if (Array.isArray(project)) {
		duration = calcTotalDuration(project);
	} else {
		duration = project ? (parseProjectDuration(project) || 60) : 90;
	}

	const endTotal = startTotal + duration;
	const endH = Math.floor(endTotal / 60);
	const endM = endTotal % 60;
	return `${ String(endH).padStart(2, '0') }:${ String(endM).padStart(2, '0') }`;
}

/**
 * 获取预约类型文本
 */
export class ReservationService {
	/**
	 * 检查是否有新增预约权限
	 */
	static canCreateReservation(): boolean {
		return hasButtonPermission('createReservation');
	}

	/**
	 * 创建初始预约表单
	 */
	static createInitialForm(selectedDate?: string): ReserveForm {
		return {
			...DEFAULT_RESERVE_FORM,
			date: selectedDate || getCurrentDate(),
			startTime: getNextFiveMinuteTime(),
		};
	}

	/**
	 * 从预约记录创建编辑表单
	 */
	static createEditForm(record: ReservationRecord): ReserveForm {
		const requirementType: 'specific' | 'gender' =
			record.requirementType || (record.genderRequirement && !record.technicianId ? 'gender' : 'specific');

		return {
			_id: record._id,
			date: record.date,
			customerName: record.customerName,
			gender: record.gender,
			project: record.project,
			projects: record.project ? record.project.split('&').filter(p => p !== '待定') : [],
			phone: record.phone,
			requirementType,
			selectedTechnicians: record.technicianId
				? [{_id: record.technicianId, name: record.technicianName || '', phone: '', isClockIn: record.isClockIn || false}]
				: [],
			genderRequirement: requirementType === 'gender'
				? {male: record.requiredMaleCount || 0, female: record.requiredFemaleCount || 0}
				: {male: 0, female: 0},
			startTime: record.startTime,
			technicianId: record.technicianId || '',
			technicianName: record.technicianName || '',
			isRenewal: record.isRenewal || false,
		};
	}

	/**
	 * 验证预约表单
	 */
	static validateForm(
		form: ReserveForm,
		requirementType: 'specific' | 'gender'
	): {valid: boolean; message?: string;} {
		if (!form.startTime) {
			return {valid: false, message: '开始时间必填'};
		}

		if (requirementType === 'specific') {
			if (form.selectedTechnicians.length === 0) {
				return {valid: false, message: '请选择技师'};
			}
		} else if (requirementType === 'gender') {
			const totalRequired = form.genderRequirement.male + form.genderRequirement.female;
			if (totalRequired === 0) {
				return {valid: false, message: '请选择技师需求'};
			}
		}

		return {valid: true};
	}

	/**
	 * 检查技师可用性
	 */
	static async checkStaffAvailability(
		date: string,
		startTime: string,
		project: string | string[],
		editingReservationIds?: string | string[]
	): Promise<{success: boolean; data?: StaffAvailability[]; maleCount?: number; femaleCount?: number; message?: string;}> {
		try {
			const projectDuration = Array.isArray(project) ? calcTotalDuration(project) : (parseProjectDuration(project) || 90);
			const currentReservationIds = Array.isArray(editingReservationIds) ? editingReservationIds : (editingReservationIds ? [editingReservationIds] : []);

			const res = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date,
					currentTime: startTime,
					projectDuration,
					currentReservationIds,
				},
			});

			if (!res.result || typeof res.result !== 'object') {
				return {success: false, message: '获取技师列表失败'};
			}

			const result = res.result as {code: number; data: StaffAvailability[];};
			if (result.code === 0 && result.data) {
				const maleCount = result.data.filter(s => !s.isOccupied && s.gender === 'male').length;
				const femaleCount = result.data.filter(s => !s.isOccupied && s.gender === 'female').length;
				return {success: true, data: result.data, maleCount, femaleCount};
			}

			return {success: false, message: '获取技师列表失败'};
		} catch (error) {
			return {success: false, message: '获取技师列表失败'};
		}
	}

	/**
	 * 创建预约记录
	 */
	static async createReservation(
		form: ReserveForm,
		endTime: string
	): Promise<{success: boolean; recordId?: string; message?: string;}> {
		try {
			const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
				date: form.date,
				customerName: form.customerName || '',
				gender: form.gender,
				phone: form.phone,
				project: form.project || '待定',
				technicianId: form.selectedTechnicians[0]?._id || '',
				technicianName: form.selectedTechnicians[0]?.name || '',
				startTime: form.startTime,
				endTime: endTime,
				isClockIn: form.selectedTechnicians[0]?.isClockIn || false,
				status: 'active',
			};

			const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
			if (insertResult) {
				await ReservationService.notifyReservationCreated([insertResult]);
				return {success: true, recordId: insertResult._id};
			}
			return {success: false, message: '创建失败'};
		} catch (error) {
			return {success: false, message: '创建失败'};
		}
	}

	/**
	 * 批量创建预约记录（多技师）
	 */
	static async createReservations(
		form: ReserveForm,
		technicians: Array<{_id: string; name: string; isClockIn: boolean;}>,
		endTime: string,
		groupKey?: string
	): Promise<{successCount: number; totalCount: number; recordIds: string[];}> {
		const recordIds: string[] = [];
		const createdRecords: ReservationRecord[] = [];
		let successCount = 0;
		const {male, female} = form.genderRequirement;

		for (const tech of technicians) {
			const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
				date: form.date,
				customerName: form.customerName || '',
				gender: form.gender,
				phone: form.phone,
				project: form.project || '待定',
				technicianId: tech._id,
				technicianName: tech.name,
				startTime: form.startTime,
				endTime: endTime,
				isClockIn: tech.isClockIn || false,
				status: 'active',
				requirementType: form.requirementType,
				genderRequirement: form.requirementType === 'gender' ? (male > 0 ? 'male' : 'female') : undefined,
				requiredMaleCount: male,
				requiredFemaleCount: female,
				isRenewal: form.isRenewal || false,
				groupKey,
			};

			const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
			if (insertResult) {
				successCount++;
				recordIds.push(insertResult._id);
				createdRecords.push(insertResult);
			}
		}

		await ReservationService.notifyReservationCreated(createdRecords);
		return {successCount, totalCount: technicians.length, recordIds};
	}

	/**
	 * 创建带时间序列的预约记录（支持多项目连续预约）
	 */
	static async createTimeSeriesReservations(
		form: ReserveForm,
		technicians: Array<{_id: string; name: string; isClockIn: boolean;}>,
		projectNames: string[],
		groupKey?: string
	): Promise<{successCount: number; expectedCount: number; recordIds: string[];}> {
		const recordIds: string[] = [];
		const createdRecords: ReservationRecord[] = [];
		let successCount = 0;
		const {male, female} = form.genderRequirement;

		const resolvedProjects = projectNames.length > 0 ? projectNames : ['待定'];
		const durations = resolvedProjects.map(p => ({name: p, dur: parseProjectDuration(p) || 90}));
		durations.sort((a, b) => b.dur - a.dur);
		const projectStr = resolvedProjects.join('&');

		const [baseH, baseM] = form.startTime.split(':').map(Number);
		const baseTotal = baseH * 60 + baseM;
		const expectedCount = technicians.length * durations.length;

		for (const tech of technicians) {
			let currentStart = baseTotal;
			for (const d of durations) {
				const currentEnd = currentStart + d.dur;
				const cEndH = Math.floor(currentEnd / 60);
				const cEndM = currentEnd % 60;
				const cEndTime = `${ String(cEndH).padStart(2, '0') }:${ String(cEndM).padStart(2, '0') }`;
				const cStartH = Math.floor(currentStart / 60);
				const cStartM = currentStart % 60;
				const cStartTime = `${ String(cStartH).padStart(2, '0') }:${ String(cStartM).padStart(2, '0') }`;

				const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
					date: form.date,
					customerName: form.customerName || '',
					gender: form.gender,
					phone: form.phone,
					project: projectStr,
					technicianId: tech._id,
					technicianName: tech.name,
					startTime: cStartTime,
					endTime: cEndTime,
					isClockIn: tech.isClockIn || false,
					status: 'active',
					requirementType: form.requirementType,
					genderRequirement: form.requirementType === 'gender' ? (male > 0 ? 'male' : 'female') : undefined,
					requiredMaleCount: male,
					requiredFemaleCount: female,
					isRenewal: form.isRenewal || false,
					groupKey,
				};

				const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
				if (insertResult) {
					successCount++;
					recordIds.push(insertResult._id);
					createdRecords.push(insertResult);
				}
				currentStart = currentEnd;
			}
		}

		await ReservationService.notifyReservationCreated(createdRecords);
		return {successCount, expectedCount, recordIds};
	}

	/**
	 * 更新预约记录
	 */
	static async updateReservation(
		reserveId: string,
		form: ReserveForm,
		endTime: string
	): Promise<{success: boolean; message?: string;}> {
		try {
			const oldRecord = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
			let record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>;
			const {male, female} = form.genderRequirement;

			if (form.requirementType === 'gender') {
				record = {
					date: form.date,
					customerName: form.customerName || '',
					gender: form.gender,
					phone: form.phone,
					project: form.project || '待定',
					technicianId: '',
					technicianName: '',
					startTime: form.startTime,
					endTime: endTime,
					isClockIn: false,
					status: 'active',
					genderRequirement: male > 0 ? 'male' : female > 0 ? 'female' : undefined,
					requirementType: 'gender',
					requiredMaleCount: male,
					requiredFemaleCount: female,
					isRenewal: form.isRenewal || false,
				};
			} else {
				const firstTech = form.selectedTechnicians[0];
				record = {
					date: form.date,
					customerName: form.customerName || '',
					gender: form.gender,
					phone: form.phone,
					project: form.project || '待定',
					technicianId: firstTech?._id || '',
					technicianName: firstTech?.name || '',
					startTime: form.startTime,
					endTime: endTime,
					isClockIn: firstTech?.isClockIn || false,
					status: 'active',
					requirementType: 'specific',
					requiredMaleCount: 0,
					requiredFemaleCount: 0,
					isRenewal: form.isRenewal || false,
				};
			}

			const success = await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, reserveId, record);
			if (success && oldRecord) {
				await ReservationService.notifyReservationChanged(oldRecord, form);
			}
			return {success};
		} catch (error) {
			return {success: false, message: '更新失败'};
		}
	}

	/**
	 * 取消预约
	 */
	static async cancelReservation(
		reserveId: string
	): Promise<{success: boolean; reservation?: ReservationRecord; relatedReservations?: ReservationRecord[];}> {
		try {
			const reservation = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
			if (!reservation) {
				return {success: false};
			}

			let relatedReservations: ReservationRecord[];
			if (reservation.groupKey) {
				relatedReservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
					groupKey: reservation.groupKey,
					status: 'active',
				});
			} else {
				relatedReservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
					date: reservation.date,
					customerName: reservation.customerName,
					startTime: reservation.startTime,
					project: reservation.project,
					status: 'active',
				});
			}

			const toCancel = relatedReservations.length > 0 ? relatedReservations : [reservation];
			const cancelledAt = new Date().toISOString();

			for (const r of toCancel) {
				await cloudDb.updateById(Collections.RESERVATIONS, r._id, {
					status: 'cancelled',
					cancelledAt,
				});
			}

			await ReservationService.notifyReservationCancelled(toCancel);
			return {success: true, reservation, relatedReservations: toCancel};
		} catch (error) {
			return {success: false};
		}
	}

	/**
	 * 根据 groupKey 取消所有分组预约
	 */
	static async cancelGroupReservations(groupKey: string): Promise<number> {
		const groupMembers = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
			groupKey,
			status: 'active',
		});
		const cancelledAt = new Date().toISOString();
		for (const member of groupMembers) {
			await cloudDb.updateById(Collections.RESERVATIONS, member._id, {
				status: 'cancelled',
				cancelledAt,
			});
		}
		return groupMembers.length;
	}

	/**
	 * 获取分组内所有预约
	 */
	static async getGroupReservations(groupKey: string): Promise<ReservationRecord[]> {
		return cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
			groupKey,
			status: 'active',
		});
	}

	/**
	 * 获取预约详情
	 */
	static async getReservationDetail(reserveId: string): Promise<ReservationRecord | null> {
		return cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
	}

	/**
	 * 物理删除预约记录（仅当被分组编辑替换时使用）
	 */
	static async removeReservation(reserveId: string): Promise<boolean> {
		return cloudDb.deleteById(Collections.RESERVATIONS, reserveId);
	}

	/**
	 * 更新分组预约（直接更新现有记录，不取消重建）
	 *
	 * 策略：获取旧组成员 → 计算新时间序列 → 按位置匹配更新
	 * - 匹配成功的记录直接 updateById
	 * - 多余的旧记录物理删除（已被替换）
	 * - 不足时新建记录
	 */
	static async updateGroupReservations(
		oldGroupKey: string,
		form: ReserveForm,
		projectNames: string[],
		newTechnicians: Array<{_id: string; name: string; isClockIn: boolean;}>
	): Promise<{success: boolean; updatedCount: number; createdCount: number; removedCount: number; message?: string;}> {
		try {
			const oldMembers = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
				groupKey: oldGroupKey,
				status: 'active',
			});

			const resolvedProjects = projectNames.length > 0 ? projectNames : ['待定'];
			const durations = resolvedProjects.map(p => ({name: p, dur: parseProjectDuration(p) || 90}));
			durations.sort((a, b) => b.dur - a.dur);
			const projectStr = resolvedProjects.join('&');
			const {male, female} = form.genderRequirement;

			// 构建新记录数据（不插入，仅用于匹配）
			const [baseH, baseM] = form.startTime.split(':').map(Number);
			const baseTotal = baseH * 60 + baseM;

			type NewRecordData = {techIdx: number; durIdx: number; startTime: string; endTime: string; tech: typeof newTechnicians[0];};
			const newRecords: NewRecordData[] = [];
			for (let ti = 0; ti < newTechnicians.length; ti++) {
				let currentStart = baseTotal;
				for (let di = 0; di < durations.length; di++) {
					const currentEnd = currentStart + durations[di].dur;
					const endH = Math.floor(currentEnd / 60);
					const endM = currentEnd % 60;
					newRecords.push({
						techIdx: ti,
						durIdx: di,
						startTime: `${ String(Math.floor(currentStart / 60)).padStart(2, '0') }:${ String(currentStart % 60).padStart(2, '0') }`,
						endTime: `${ String(endH).padStart(2, '0') }:${ String(endM).padStart(2, '0') }`,
						tech: newTechnicians[ti],
					});
					currentStart = currentEnd;
				}
			}

			let updatedCount = 0;
			let createdCount = 0;
			let removedCount = 0;

			// 对每个新记录，尝试匹配旧记录
			const matchedOldIds = new Set<string>();
			const affectedTechnicianIds: string[] = [];
			for (let i = 0; i < newRecords.length; i++) {
				const nr = newRecords[i];

				// 优先按技师匹配（同一技师且同日期的记录）
				const matchedOld = oldMembers.find(m =>
					!matchedOldIds.has(m._id) && m.technicianId === nr.tech._id
				);

				if (matchedOld) {
					matchedOldIds.add(matchedOld._id);
					await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, matchedOld._id, {
						date: form.date,
						customerName: form.customerName || '',
						gender: form.gender,
						phone: form.phone,
						project: projectStr,
						technicianId: nr.tech._id,
						technicianName: nr.tech.name,
						startTime: nr.startTime,
						endTime: nr.endTime,
						isClockIn: nr.tech.isClockIn || false,
						requirementType: form.requirementType,
						genderRequirement: form.requirementType === 'gender' ? (male > 0 ? 'male' : 'female') : undefined,
						requiredMaleCount: male,
						requiredFemaleCount: female,
						isRenewal: form.isRenewal || false,
						groupKey: oldGroupKey,
					});
					updatedCount++;
					affectedTechnicianIds.push(nr.tech._id);
				} else {
					// 找不到匹配，创建新记录
					const record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'> = {
						date: form.date,
						customerName: form.customerName || '',
						gender: form.gender,
						phone: form.phone,
						project: projectStr,
						technicianId: nr.tech._id,
						technicianName: nr.tech.name,
						startTime: nr.startTime,
						endTime: nr.endTime,
						isClockIn: nr.tech.isClockIn || false,
						status: 'active',
						requirementType: form.requirementType,
						genderRequirement: form.requirementType === 'gender' ? (male > 0 ? 'male' : 'female') : undefined,
						requiredMaleCount: male,
						requiredFemaleCount: female,
						isRenewal: form.isRenewal || false,
						groupKey: oldGroupKey,
					};
					await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
					createdCount++;
					affectedTechnicianIds.push(nr.tech._id);
				}
			}

			// 删除未被匹配的旧记录
			for (const old of oldMembers) {
				if (!matchedOldIds.has(old._id)) {
					await cloudDb.deleteById(Collections.RESERVATIONS, old._id);
					removedCount++;
				}
			}

			// 向受影响的技师发送预约变更通知
			if (oldMembers.length > 0) {
				await ReservationService.notifyReservationChanged(oldMembers[0], form, affectedTechnicianIds);
			}

			return {success: true, updatedCount, createdCount, removedCount};
		} catch (error) {
			return {success: false, message: '更新分组失败', updatedCount: 0, createdCount: 0, removedCount: 0};
		}
	}

	/**
	 * 按性别需求分配技师（轮钟模式）
	 */
	static async allocateTechniciansByGender(
		date: string,
		startTime: string,
		project: string | string[],
		maleCount: number,
		femaleCount: number
	): Promise<{success: boolean; technicians?: Array<{_id: string; name: string; isClockIn: boolean;}>; message?: string; hasConflict?: boolean;}> {
		try {
			const rotationData = await app.getRotationQueue(date);
			if (!rotationData?.staffList?.length) {
				return {success: false, message: '无法获取轮牌数据'};
			}

			const allStaff = (await app.getStaffs()).filter(s => s.role === 'technician');
			const staffMap = new Map(allStaff.map(s => [s._id, s]));

			const rotationStaffList = rotationData.staffList
				.map(item => ({
					staffId: item.staffId,
					position: item.position,
					staff: staffMap.get(item.staffId),
				}))
				.filter(item => item.staff && item.staff!.status === 'active');

			const projectDuration = Array.isArray(project) ? calcTotalDuration(project) : (parseProjectDuration(project) || 90);
			const technicianRes = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date,
					currentTime: startTime,
					projectDuration,
					currentReservationIds: [],
				},
			});

			let availableTechnicians: StaffAvailability[] = [];
			if (technicianRes.result && typeof technicianRes.result === 'object') {
				const result = technicianRes.result as {code: number; data: StaffAvailability[];};
				if (result.code === 0 && result.data) {
					availableTechnicians = result.data;
				}
			}

			const availableTechnicianIds = new Set(availableTechnicians.map(t => t._id));

			const selectedMaleStaff: Array<{_id: string; name: string; isClockIn: boolean;}> = [];
			const selectedFemaleStaff: Array<{_id: string; name: string; isClockIn: boolean;}> = [];
			const selectedIds = new Set<string>();

			for (const rotationItem of rotationStaffList) {
				const staff = rotationItem.staff!;
				const staffId = rotationItem.staffId;

				if (!availableTechnicianIds.has(staffId)) continue;

				if (staff.gender === 'male' && selectedMaleStaff.length < maleCount) {
					selectedMaleStaff.push({_id: staffId, name: staff.name, isClockIn: false});
					selectedIds.add(staffId);
				} else if (staff.gender === 'female' && selectedFemaleStaff.length < femaleCount) {
					selectedFemaleStaff.push({_id: staffId, name: staff.name, isClockIn: false});
					selectedIds.add(staffId);
				}

				if (selectedMaleStaff.length === maleCount && selectedFemaleStaff.length === femaleCount) {
					break;
				}
			}

			let hasConflict = false;
			if (selectedMaleStaff.length < maleCount || selectedFemaleStaff.length < femaleCount) {
				hasConflict = true;
				for (const rotationItem of rotationStaffList) {
					const staff = rotationItem.staff!;
					const staffId = rotationItem.staffId;

					if (selectedIds.has(staffId)) continue;

					if (staff.gender === 'male' && selectedMaleStaff.length < maleCount) {
						selectedMaleStaff.push({_id: staffId, name: staff.name, isClockIn: false});
						selectedIds.add(staffId);
					} else if (staff.gender === 'female' && selectedFemaleStaff.length < femaleCount) {
						selectedFemaleStaff.push({_id: staffId, name: staff.name, isClockIn: false});
						selectedIds.add(staffId);
					}

					if (selectedMaleStaff.length === maleCount && selectedFemaleStaff.length === femaleCount) {
						break;
					}
				}
			}

			if (selectedMaleStaff.length < maleCount || selectedFemaleStaff.length < femaleCount) {
				return {
					success: false,
					message: `技师不足（男${ selectedMaleStaff.length }/${ maleCount }，女${ selectedFemaleStaff.length }/${ femaleCount }）`,
				};
			}

			return {success: true, technicians: [...selectedMaleStaff, ...selectedFemaleStaff], hasConflict};
		} catch (error) {
			return {success: false, message: '分配技师失败'};
		}
	}
	/**
	 * 触发预约重排（供各页面复用）
	 */
	static async triggerRearrange(date: string): Promise<void> {
		try {
			const res = await wx.cloud.callFunction({
				name: "getAvailableTechnicians",
				data: {date, mode: "rearrange"}
			});
			if (res.result && (res.result as {code: number;}).code === 0) {
				console.log("[重排] 完成:", (res.result as {data: {summary: any;};}).data.summary);
			} else {
				console.warn("[重排] 失败:", (res.result as {message?: string;}).message);
			}
		} catch (error) {
			console.error("[重排] 调用失败:", error);
		}
	}

	// ==================== 订阅消息通知 ====================

	/**
	 * 调用订阅消息云函数（静默失败，不影响主流程）
	 */
	private static async callNotify(
		type: 'RESERVATION_NEW' | 'RESERVATION_CHANGE' | 'RESERVATION_CANCEL',
		data: Record<string, string>,
		technicianId: string,
		notifyAdmins: boolean
	): Promise<void> {
		try {
			await wx.cloud.callFunction({
				name: 'sendSubscribeMessage',
				data: {type, data, technicianId, notifyAdmins},
			});
		} catch (error) {
			console.warn('[Notify] 发送订阅消息失败:', error);
		}
	}

	/**
	 * 构建「新预约」通知数据
	 * 模板字段：thing3(项目)、date6(时间)、thing14(点钟/轮钟)、thing7(备注)
	 */
	private static buildNewReservationData(record: ReservationRecord): Record<string, string> {
		return {
			thing3: record.project || '待定',
			date6: `${ record.date } ${ record.startTime }`,
			thing14: record.isClockIn ? '点钟' : '轮钟',
			thing7: record.customerName || '无',
		};
	}

	/**
	 * 发送「新预约」通知给相关技师，并同时推送给 admin
	 * 按技师 ID 去重，避免分组预约重复推送
	 */
	static async notifyReservationCreated(records: ReservationRecord[]): Promise<void> {
		const notified = new Set<string>();
		for (const record of records) {
			const technicianId = record.technicianId;
			if (!technicianId || notified.has(technicianId)) continue;
			notified.add(technicianId);
			await this.callNotify(
				'RESERVATION_NEW',
				this.buildNewReservationData(record),
				technicianId,
				true
			);
		}
	}

	/**
	 * 计算预约变更内容描述
	 * 模板字段：thing15(变更内容)
	 */
	private static buildChangeDescription(oldRecord: ReservationRecord, form: ReserveForm): string {
		const parts: string[] = [];
		if (oldRecord.date !== form.date) {
			parts.push(`日期改为${ form.date }`);
		}
		if (oldRecord.startTime !== form.startTime) {
			parts.push(`时间改为${ form.startTime }`);
		}
		if ((oldRecord.project || '待定') !== (form.project || '待定')) {
			parts.push('项目已调整');
		}
		const newTechName = form.selectedTechnicians[0]?.name;
		if (newTechName && oldRecord.technicianName !== newTechName) {
			parts.push(`技师改为${ newTechName }`);
		}
		return parts.length > 0 ? parts.join('；') : '预约信息已更新';
	}

	/**
	 * 发送「预约变更」通知给相关技师
	 * 模板字段：thing1(项目)、thing15(变更内容)、thing19(客户姓名)、thing6(备注)
	 */
	static async notifyReservationChanged(
		oldRecord: ReservationRecord,
		form: ReserveForm,
		technicianIds?: string[]
	): Promise<void> {
		const ids = technicianIds && technicianIds.length > 0
			? technicianIds
			: (oldRecord.technicianId ? [oldRecord.technicianId] : []);

		const data: Record<string, string> = {
			thing1: form.project || '待定',
			thing15: this.buildChangeDescription(oldRecord, form),
			thing19: form.customerName || oldRecord.customerName || '无',
			thing6: '预约信息已变更',
		};

		const notified = new Set<string>();
		for (const id of ids) {
			if (!id || notified.has(id)) continue;
			notified.add(id);
			await this.callNotify('RESERVATION_CHANGE', data, id, false);
		}
	}

	/**
	 * 发送「预约取消」通知给相关技师，并同时推送给 admin
	 * 模板字段：thing3(客户姓名)、time14(预定时间)、thing5(取消原因)、thing13(备注)
	 */
	static async notifyReservationCancelled(
		records: ReservationRecord[],
		reason?: string
	): Promise<void> {
		const notified = new Set<string>();
		for (const record of records) {
			const technicianId = record.technicianId;
			if (!technicianId || notified.has(technicianId)) continue;
			notified.add(technicianId);

			const data: Record<string, string> = {
				thing3: record.customerName || '无',
				time14: record.startTime,
				thing5: reason || '客户取消',
				thing13: '预约已取消',
			};
			await this.callNotify('RESERVATION_CANCEL', data, technicianId, true);
		}
	}
}
