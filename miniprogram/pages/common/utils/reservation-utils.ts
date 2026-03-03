import { cloudDb, Collections } from "../../../utils/cloud-db";

const app = getApp<IAppOption>();

export class ReservationUtils {
	static async createReservation(data: {
		date: string;
		customerName: string;
		gender: 'male' | 'female';
		project: string;
		phone?: string;
		startTime: string;
		endTime: string;
		requirementType: 'specific' | 'gender';
		selectedTechnicians: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }>;
		genderRequirement: { male: number; female: number };
	}) {
		try {
			const { date, selectedTechnicians, genderRequirement, requirementType } = data;

			const reservations: Add<ReservationRecord>[] = [];

			if (requirementType === 'specific') {
				for (const tech of selectedTechnicians) {
					reservations.push({
						date,
						customerName: data.customerName,
						gender: data.gender,
						phone: data.phone || '',
						project: data.project,
						technicianId: tech._id,
						technicianName: tech.name,
						isClockIn: tech.isClockIn || false,
						startTime: data.startTime,
						endTime: data.endTime,
						status: 'active' as const,
					});
				}
			} else {
				const staffList = await app.getActiveStaffs();
				const genderFilter = (s: StaffInfo) => {
					if (data.gender === 'male') return s.gender === 'male';
					return s.gender === 'female';
				};
				const availableStaff = staffList.filter(genderFilter);

				const rotationData = await app.getRotationQueue(date);
				const rotationStaffIds = rotationData?.staffList?.map(s => s.staffId) || [];

				const sortedStaff = availableStaff.filter(s => rotationStaffIds.includes(s._id))
					.sort((a, b) => {
						const indexA = rotationStaffIds.indexOf(a._id);
						const indexB = rotationStaffIds.indexOf(b._id);
						return indexA - indexB;
					});

				const maleCount = genderRequirement.male;
				const femaleCount = genderRequirement.female;
				const totalCount = maleCount + femaleCount;

				for (let i = 0; i < totalCount; i++) {
					if (i >= sortedStaff.length) break;

					const staff = sortedStaff[i];
					reservations.push({
						date,
						customerName: data.customerName,
						gender: data.gender,
						phone: data.phone || '',
						project: data.project,
						technicianId: staff._id,
						technicianName: staff.name,
						isClockIn: false,
						startTime: data.startTime,
						endTime: data.endTime,
						status: 'active' as const,
					});
				}
			}

			const results = await Promise.all(
				reservations.map(r => cloudDb.insert(Collections.RESERVATIONS, r))
			);

			return results.every(r => r !== null);
		} catch (error) {
			console.error('创建预约失败:', error);
			return false;
		}
	}

	static async updateReservation(reservationId: string, data: Partial<ReservationRecord>) {
		try {
			const result = await cloudDb.updateById(Collections.RESERVATIONS, reservationId, {
				...data,
				updatedAt: new Date().toISOString()
			});
			return result !== null;
		} catch (error) {
			console.error('更新预约失败:', error);
			return false;
		}
	}

	static async cancelReservation(reservationId: string) {
		try {
			const result = await cloudDb.updateById(Collections.RESERVATIONS, reservationId, {
				status: 'cancelled',
				updatedAt: new Date().toISOString()
			});
			return result !== null;
		} catch (error) {
			console.error('取消预约失败:', error);
			return false;
		}
	}

	static async getReservationById(reservationId: string): Promise<ReservationRecord | null> {
		try {
			return await cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, reservationId);
		} catch (error) {
			console.error('获取预约失败:', error);
			return null;
		}
	}

	static async getReservationsByDate(date: string): Promise<ReservationRecord[]> {
		try {
			const reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
				date,
				status: 'active'
			});
			return reservations || [];
		} catch (error) {
			console.error('获取预约列表失败:', error);
			return [];
		}
	}

	static async sendArrivalNotification(reservations: ReservationRecord[]) {
		try {
			if (!reservations || reservations.length === 0) {
				return;
			}

			const firstReservation = reservations[0];
			const genderLabel = firstReservation.gender === 'male' ? '先生' : '女士';
			const customerInfo = `${firstReservation.customerName}${genderLabel}`;
			const teaCount = reservations.length;

			const staffList = await app.getActiveStaffs();
			const staffMap = new Map(staffList.map(s => [s._id, s]));

			const uniqueTechnicians = new Map<string, { name: string; phone?: string }>();
			reservations.forEach(r => {
				const staff = r.technicianId ? staffMap.get(r.technicianId) : null;
				const key = r.technicianId || r.technicianName;
				if (!uniqueTechnicians.has(key!)) {
					uniqueTechnicians.set(key!, { name: r.technicianName!, phone: staff?.phone });
				}
			});

			const technicianMentions = Array.from(uniqueTechnicians.values())
				.map(t => t.phone ? `${t.name}<@${t.phone}>` : t.name)
				.join(' ');

			const message = `【🏃 到店通知】

${customerInfo} 已到店
项目：${firstReservation.project}
请${technicianMentions}准备上钟，工服、口罩穿戴整齐，准备茶点（${teaCount}份）`;

			const res = await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; message?: string };
				if (result.code !== 0) {
					console.error('推送失败:', result.message);
				}
			}
		} catch (error) {
			console.error('发送到店通知失败:', error);
		}
	}

	static async sendReservationChangeNotification(reservation: Update<ReservationRecord>, changeType: 'create' | 'cancel' | 'update') {
		try {
			const genderLabel = reservation.gender === 'male' ? '先生' : '女士';
			const customerInfo = `${reservation.customerName}${genderLabel}`;

			const changeTypeText = {
				create: '新增预约',
				cancel: '取消预约',
				update: '修改预约'
			}[changeType];

			const message = `【📅 ${changeTypeText}】

客户：${customerInfo}
项目：${reservation.project}
时间：${reservation.date} ${reservation.startTime}-${reservation.endTime}
技师：${reservation.technicianName}`;

			const res = await wx.cloud.callFunction({
				name: 'sendWechatMessage',
				data: {
					content: message
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; message?: string };
				return result.code === 0;
			}
			return false;
		} catch (error) {
			console.error('发送预约变更通知失败:', error);
			return false;
		}
	}
}
