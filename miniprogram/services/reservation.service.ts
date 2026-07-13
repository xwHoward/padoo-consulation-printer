/**
 * 预约服务类
 * 封装预约相关的核心业务逻辑，供多个页面复用
 */
import {cloudDb, Collections} from '../utils/cloud-db';
import {getCurrentDate, parseProjectDuration} from '../utils/util';
import {hasButtonPermission} from '../utils/permission';
import type {ReserveForm, PushModalState} from '../types/reservation.types';

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

/** 默认推送弹窗状态 */
export const DEFAULT_PUSH_MODAL: PushModalState = {
	show: false,
	loading: false,
	type: 'create',
	message: '',
	mentions: [],
	reservationData: null,
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
			}
		}

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
				}
				currentStart = currentEnd;
			}
		}

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
}
