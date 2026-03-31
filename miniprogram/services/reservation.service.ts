/**
 * 预约服务类
 * 封装预约相关的核心业务逻辑，供多个页面复用
 */
import { cloudDb, Collections } from '../utils/cloud-db';
import { getCurrentDate, parseProjectDuration, formatDaysFromNow, formatTime } from '../utils/util';
import { hasButtonPermission } from '../utils/permission';
import { formatMention } from '../utils/wechat-work';
import type { ReserveForm, PushModalState } from '../types/reservation.types';

const app = getApp<IAppOption>();

/** 默认预约表单 */
export const DEFAULT_RESERVE_FORM: ReserveForm = {
	_id: '',
	date: '',
	customerName: '',
	gender: 'male',
	project: '',
	phone: '',
	requirementType: 'specific',
	selectedTechnicians: [],
	genderRequirement: { male: 0, female: 0 },
	startTime: '',
	technicianId: '',
	technicianName: '',
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
	return `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
}

/**
 * 根据项目计算结束时间
 */
export function calculateEndTime(startTime: string, project: string): string {
	const [h, m] = startTime.split(':').map(Number);
	const startTotal = h * 60 + m;
	let duration = 90;
	if (project) {
		duration = parseProjectDuration(project);
		if (duration === 0) duration = 60;
	}
	const endTotal = startTotal + duration + 20;
	const endH = Math.floor(endTotal / 60);
	const endM = endTotal % 60;
	return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

/**
 * 获取预约类型文本
 */
export function getReservationTypeText(
	technicians: Array<{ _id: string; name: string; phone: string; wechatWorkId?: string; isClockIn: boolean }>
): string {
	if (technicians.length === 0) {
		return '排钟';
	}
	const hasClockIn = technicians.some(t => t.isClockIn);
	const hasNonClockIn = technicians.some(t => !t.isClockIn);
	if (hasClockIn && hasNonClockIn) {
		return '混合（点钟+排钟）';
	} else if (hasClockIn) {
		return '点钟';
	} else {
		return '排钟';
	}
}

/**
 * 构建新建预约的推送消息
 */
export function buildCreateReservationMessage(
	form: ReserveForm,
	endTime: string,
	technicians: Array<{ _id: string; name: string; phone: string; wechatWorkId?: string; isClockIn: boolean }>
): string {
	const genderLabel = form.gender === 'male' ? '先生' : '女士';
	const customerInfo = `${form.customerName || ''}${genderLabel}`;
	const technicianMentions = technicians.map(t => formatMention({ ...t, wechatWorkId: t.wechatWorkId || '' })).join(' ');
	const reservationType = getReservationTypeText(technicians);
	const daysText = formatDaysFromNow(form.date);

	return `【⏰ 新预约提醒】

顾客：${customerInfo}
日期：${form.date}${daysText}
时间：**${form.startTime} - ${endTime}**
项目：${form.project || '待定'}
类型：${reservationType}
技师：**${technicianMentions}**`;
}

/**
 * 构建预约变更的推送消息
 */
export function buildEditReservationMessage(
	original: ReservationRecord,
	updated: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>,
	staffInfo: StaffInfo | null
): { message: string; changes: string[] } {
	const changes: string[] = [];

	if (original.date !== updated.date) {
		const originalDaysText = formatDaysFromNow(original.date);
		const updatedDaysText = formatDaysFromNow(updated.date);
		changes.push(`📅 日期：${original.date}${originalDaysText} → ${updated.date}${updatedDaysText}`);
	}
	if (original.startTime !== updated.startTime) {
		changes.push(`⏰ 时间：${original.startTime} → ${updated.startTime}`);
	}
	if (original.project !== updated.project) {
		changes.push(`💆 项目：${original.project} → ${updated.project}`);
	}
	if (
		original.technicianId !== updated.technicianId ||
		original.technicianName !== updated.technicianName ||
		(original.isClockIn || false) !== (updated.isClockIn || false)
	) {
		changes.push(
			`👨\u200d💼 技师：${original.technicianName}${original.isClockIn ? '[点]' : ''} → ${updated.technicianName}${updated.isClockIn ? '[点]' : ''}`
		);
	}
	if (original.customerName !== updated.customerName) {
		changes.push(`👤 顾客：${original.customerName} → ${updated.customerName}`);
	}
	if (original.phone !== updated.phone) {
		changes.push(`📱 电话：${original.phone} → ${updated.phone}`);
	}

	const genderLabel = updated.gender === 'male' ? '先生' : '女士';
	const customerInfo = `${updated.customerName}${genderLabel}`;
	const technicianMention = staffInfo ? formatMention(staffInfo) : '';
	const technicianName = updated.technicianName || '待定';
	const daysText = formatDaysFromNow(updated.date);
	const dateInfo = `📅 预约日期：${updated.date}${daysText}`;

	const message = `【📝 预约变更通知】

顾客：${customerInfo}
${dateInfo}
${changes.join('\n')}

请${technicianMention || technicianName}知悉，做好准备`;

	return { message, changes };
}

/**
 * 构建取消预约的推送消息
 */
export function buildCancelReservationMessage(
	reservation: ReservationRecord,
	technicians: Array<{ _id: string; name: string; phone: string; wechatWorkId?: string; isClockIn: boolean }>
): string {
	const genderLabel = reservation.gender === 'male' ? '先生' : '女士';
	const customerInfo = `${reservation.customerName}${genderLabel}`;
	const technicianMentions = technicians.map(t => formatMention({ ...t, wechatWorkId: t.wechatWorkId || '' })).join(' ');
	const daysText = formatDaysFromNow(reservation.date);

	return `【🚫 预约**取消**提醒】

顾客：${customerInfo}
日期：${reservation.date}${daysText}
时间：**${reservation.startTime} - ${reservation.endTime}**
项目：${reservation.project}
技师：**${technicianMentions}**`;
}

/**
 * 预约服务类
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
			startTime: getNextHalfHourTime(),
		};
	}

	/**
	 * 从预约记录创建编辑表单
	 */
	static createEditForm(record: ReservationRecord): ReserveForm {
		const hasGenderRequirement = record.genderRequirement && !record.technicianId;
		const requirementType = hasGenderRequirement ? 'gender' : 'specific';

		return {
			_id: record._id,
			date: record.date,
			customerName: record.customerName,
			gender: record.gender,
			project: record.project,
			phone: record.phone,
			requirementType: requirementType as 'specific' | 'gender',
			selectedTechnicians: record.technicianId
				? [{ _id: record.technicianId, name: record.technicianName || '', phone: '', isClockIn: record.isClockIn || false }]
				: [],
			genderRequirement: hasGenderRequirement
				? { male: record.genderRequirement === 'male' ? 1 : 0, female: record.genderRequirement === 'female' ? 1 : 0 }
				: { male: 0, female: 0 },
			startTime: record.startTime,
			technicianId: record.technicianId || '',
			technicianName: record.technicianName || '',
		};
	}

	/**
	 * 验证预约表单
	 */
	static validateForm(
		form: ReserveForm,
		requirementType: 'specific' | 'gender',
		availableMaleCount: number,
		availableFemaleCount: number
	): { valid: boolean; message?: string } {
		if (!form.startTime) {
			return { valid: false, message: '开始时间必填' };
		}

		if (requirementType === 'specific') {
			if (form.selectedTechnicians.length === 0) {
				return { valid: false, message: '请选择技师' };
			}
		} else if (requirementType === 'gender') {
			const totalRequired = form.genderRequirement.male + form.genderRequirement.female;
			if (totalRequired === 0) {
				return { valid: false, message: '请选择技师需求' };
			}
			if (form.genderRequirement.male > availableMaleCount) {
				return { valid: false, message: `可用男技师不足（仅${availableMaleCount}位）` };
			}
			if (form.genderRequirement.female > availableFemaleCount) {
				return { valid: false, message: `可用女技师不足（仅${availableFemaleCount}位）` };
			}
			if (totalRequired > 2) {
				return { valid: false, message: '最多只能预约2位技师' };
			}
		}

		return { valid: true };
	}

	/**
	 * 检查技师可用性
	 */
	static async checkStaffAvailability(
		date: string,
		startTime: string,
		project: string,
		editingReservationId?: string
	): Promise<{ success: boolean; data?: StaffAvailability[]; maleCount?: number; femaleCount?: number; message?: string }> {
		try {
			const projectDuration = parseProjectDuration(project) || 60;
			const currentReservationIds = editingReservationId ? [editingReservationId] : [];

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
				return { success: false, message: '获取技师列表失败' };
			}

			const result = res.result as { code: number; data: StaffAvailability[] };
			if (result.code === 0 && result.data) {
				const maleCount = result.data.filter(s => !s.isOccupied && s.gender === 'male').length;
				const femaleCount = result.data.filter(s => !s.isOccupied && s.gender === 'female').length;
				return { success: true, data: result.data, maleCount, femaleCount };
			}

			return { success: false, message: '获取技师列表失败' };
		} catch (error) {
			return { success: false, message: '获取技师列表失败' };
		}
	}

	/**
	 * 创建预约记录
	 */
	static async createReservation(
		form: ReserveForm,
		endTime: string
	): Promise<{ success: boolean; recordId?: string; message?: string }> {
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
				return { success: true, recordId: insertResult._id };
			}
			return { success: false, message: '创建失败' };
		} catch (error) {
			return { success: false, message: '创建失败' };
		}
	}

	/**
	 * 批量创建预约记录（多技师）
	 */
	static async createReservations(
		form: ReserveForm,
		technicians: Array<{ _id: string; name: string; isClockIn: boolean }>,
		endTime: string
	): Promise<{ successCount: number; totalCount: number; recordIds: string[] }> {
		const recordIds: string[] = [];
		let successCount = 0;

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
			};

			const insertResult = await cloudDb.insert<ReservationRecord>(Collections.RESERVATIONS, record);
			if (insertResult) {
				successCount++;
				recordIds.push(insertResult._id);
			}
		}

		return { successCount, totalCount: technicians.length, recordIds };
	}

	/**
	 * 更新预约记录
	 */
	static async updateReservation(
		reserveId: string,
		form: ReserveForm,
		endTime: string
	): Promise<{ success: boolean; message?: string }> {
		try {
			let record: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>;

			if (form.requirementType === 'gender') {
				const { male, female } = form.genderRequirement;
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
				};
			}

			const success = await cloudDb.updateById<ReservationRecord>(Collections.RESERVATIONS, reserveId, record);
			return { success };
		} catch (error) {
			return { success: false, message: '更新失败' };
		}
	}

	/**
	 * 取消预约
	 */
	static async cancelReservation(
		reserveId: string
	): Promise<{ success: boolean; reservation?: ReservationRecord; relatedReservations?: ReservationRecord[] }> {
		try {
			const reservation = await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
			if (!reservation) {
				return { success: false };
			}

			// 查找关联预约
			const relatedReservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
				date: reservation.date,
				customerName: reservation.customerName,
				startTime: reservation.startTime,
				project: reservation.project,
				status: 'active',
			});

			const toCancel = relatedReservations.length > 0 ? relatedReservations : [reservation];
			const cancelledAt = new Date().toISOString();

			for (const r of toCancel) {
				await cloudDb.updateById(Collections.RESERVATIONS, r._id, {
					status: 'cancelled',
					cancelledAt,
				});
			}

			return { success: true, reservation, relatedReservations: toCancel };
		} catch (error) {
			return { success: false };
		}
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
		project: string,
		maleCount: number,
		femaleCount: number
	): Promise<{ success: boolean; technicians?: Array<{ _id: string; name: string; isClockIn: boolean }>; message?: string }> {
		try {
			// 获取轮牌数据
			const rotationData = await app.getRotationQueue(date);
			if (!rotationData?.staffList?.length) {
				return { success: false, message: '无法获取轮牌数据' };
			}

			// 获取所有员工
			const allStaff = await app.getStaffs();
			const staffMap = new Map(allStaff.map(s => [s._id, s]));

			// 按轮牌顺序排序
			const rotationStaffList = rotationData.staffList
				.map(item => ({
					staffId: item.staffId,
					position: item.position,
					staff: staffMap.get(item.staffId),
				}))
				.filter(item => item.staff && item.staff!.status === 'active');

			// 获取可用技师
			const projectDuration = parseProjectDuration(project) || 60;
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
				const result = technicianRes.result as { code: number; data: StaffAvailability[] };
				if (result.code === 0 && result.data) {
					availableTechnicians = result.data;
				}
			}

			const availableTechnicianIds = new Set(availableTechnicians.map(t => t._id));

			// 按轮牌顺序选择
			const selectedMaleStaff: Array<{ _id: string; name: string; isClockIn: boolean }> = [];
			const selectedFemaleStaff: Array<{ _id: string; name: string; isClockIn: boolean }> = [];

			for (const rotationItem of rotationStaffList) {
				const staff = rotationItem.staff!;
				const staffId = rotationItem.staffId;

				if (!availableTechnicianIds.has(staffId)) continue;

				if (staff.gender === 'male' && selectedMaleStaff.length < maleCount) {
					selectedMaleStaff.push({ _id: staffId, name: staff.name, isClockIn: false });
				} else if (staff.gender === 'female' && selectedFemaleStaff.length < femaleCount) {
					selectedFemaleStaff.push({ _id: staffId, name: staff.name, isClockIn: false });
				}

				if (selectedMaleStaff.length === maleCount && selectedFemaleStaff.length === femaleCount) {
					break;
				}
			}

			// 检查是否满足需求
			if (selectedMaleStaff.length < maleCount || selectedFemaleStaff.length < femaleCount) {
				return {
					success: false,
					message: `可用技师不足（男${selectedMaleStaff.length}/${maleCount}，女${selectedFemaleStaff.length}/${femaleCount}）`,
				};
			}

			return { success: true, technicians: [...selectedMaleStaff, ...selectedFemaleStaff] };
		} catch (error) {
			return { success: false, message: '分配技师失败' };
		}
	}
}
