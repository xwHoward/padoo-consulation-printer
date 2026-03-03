import { cloudDb, Collections } from "../../../utils/cloud-db";

const app = getApp<IAppOption>();

export class DataLoader {
	static async loadProjects(): Promise<any[]> {
		try {
			return await app.getProjects();
		} catch (error) {
			console.error('加载项目列表失败:', error);
			return [];
		}
	}

	static async loadRooms(): Promise<any[]> {
		try {
			const allRooms = await app.getRooms();
			return allRooms.filter((r: any) => r.status === 'normal');
		} catch (error) {
			console.error('加载房间列表失败:', error);
			return [];
		}
	}

	static async loadStaffList(): Promise<any[]> {
		try {
			const allStaff = await app.getStaffs();
			return allStaff.filter((s: any) => s.status === 'active');
		} catch (error) {
			console.error('加载员工列表失败:', error);
			return [];
		}
	}

	static async loadConsultationsByDate(date: string): Promise<ConsultationRecord[]> {
		try {
			const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(date);
			return records.filter(r => !r.isVoided);
		} catch (error) {
			console.error('加载咨询记录失败:', error);
			return [];
		}
	}

	static async loadReservationsByDate(date: string): Promise<ReservationRecord[]> {
		try {
			const reservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
				date,
				status: 'active'
			});
			return reservations || [];
		} catch (error) {
			console.error('加载预约记录失败:', error);
			return [];
		}
	}

	static async loadSchedules(): Promise<any[]> {
		try {
			return await cloudDb.getAll(Collections.SCHEDULE);
		} catch (error) {
			console.error('加载排班记录失败:', error);
			return [];
		}
	}

	static async loadTechnicianAvailability(
		date: string,
		currentTime: string,
		projectDuration: number = 60,
		currentReservationIds: string[] = [],
		currentConsultationId?: string
	): Promise<any[]> {
		try {
			const res = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date,
					currentTime,
					projectDuration,
					currentReservationIds,
					currentConsultationId
				}
			});

			if (!res.result || typeof res.result !== 'object') {
				return [];
			}

			if (res.result && res.result.code === 0) {
				return res.result.data || [];
			}

			return [];
		} catch (error) {
			console.error('获取技师可用性失败:', error);
			return [];
		}
	}
}
