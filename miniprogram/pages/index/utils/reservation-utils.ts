import { cloudDb, Collections } from "../../../utils/cloud-db";

const app = getApp<IAppOption>();

export class ReservationUtils {
	static async deleteReservations(currentReservationIds: string[]): Promise<number> {
		if (!currentReservationIds || currentReservationIds.length === 0) {
			return 0;
		}

		try {
			const results = await Promise.all(
				currentReservationIds.map(id =>
					cloudDb.updateById(Collections.RESERVATIONS, id, {
						status: 'completed',
						updatedAt: new Date().toISOString()
					})
				)
			);

			const deletedCount = results.filter(r => r !== null).length;
			if (deletedCount > 0) {
				console.log(`标记了 ${deletedCount} 个预约为已完成`);
			}

			return deletedCount;
		} catch (error) {
			console.error('标记预约完成失败:', error);
			return 0;
		}
	}

	static async reassignFutureReservations(date: string, currentTime: string): Promise<void> {
		try {
			const allReservations = await cloudDb.find<ReservationRecord>(Collections.RESERVATIONS, {
				date: date,
				status: 'active'
			});

			const futureReservations = allReservations.filter(r => {
				if (r.isClockIn) return false;
				return r.startTime >= currentTime;
			});

			if (futureReservations.length === 0) {
				return;
			}

			const rotationData = await app.getRotationQueue(date);
			if (!rotationData || !rotationData.staffList || rotationData.staffList.length === 0) {
				return;
			}

			const allStaff = await app.getActiveStaffs();

			const staffMap = new Map(allStaff.map(s => [s._id, s]));
			const rotationStaffIds = rotationData.staffList.map(s => s.staffId);

			const updatePromises = futureReservations.map(async (reservation) => {
				const genderStaff = allStaff.filter(s => s.gender === reservation.gender);
				const availableGenderStaff = genderStaff.filter(s => rotationStaffIds.includes(s._id));

				if (availableGenderStaff.length === 0) {
					return null;
				}

				const todayRecords = await cloudDb.getConsultationsByDate<ConsultationRecord>(date);
				const activeRecords = todayRecords.filter(r => !r.isVoided);

				const otherReservations = allReservations.filter(r => r._id !== reservation._id);

				const staffWithAssignments = new Map<string, number>();

				for (const record of activeRecords) {
					if (record.technician) {
						staffWithAssignments.set(record.technician, (staffWithAssignments.get(record.technician) || 0) + 1);
					}
				}

				for (const r of otherReservations) {
					if (r.technicianName) {
						staffWithAssignments.set(r.technicianName, (staffWithAssignments.get(r.technicianName) || 0) + 1);
					}
				}

				let assignedStaff: typeof availableGenderStaff[0] | null = null;
				let minAssignments = Infinity;

				for (const staff of availableGenderStaff) {
					const rotationIndex = rotationStaffIds.indexOf(staff._id);
					if (rotationIndex === -1) continue;

					const assignments = staffWithAssignments.get(staff.name) || 0;
					if (assignments < minAssignments) {
						minAssignments = assignments;
						assignedStaff = staff;
					}
				}

				if (assignedStaff) {
					const updateData = {
						technicianId: assignedStaff._id,
						technicianName: assignedStaff.name,
						updatedAt: new Date().toISOString()
					};

					return cloudDb.updateById(Collections.RESERVATIONS, reservation._id, updateData);
				}

				return null;
			});

			await Promise.all(updatePromises);
		} catch (error) {
			console.error('重新分配预约技师失败:', error);
		}
	}

	static async saveCustomerInfo(consultation: any) {
		try {
			const { surname, gender, phone, project, licensePlate, isClockIn } = consultation;

			if (!surname || !gender) {
				return;
			}

			const existing = await wx.cloud.callFunction({
				name: 'matchCustomer',
				data: { surname, gender, phone: phone || '' }
			});

			if (existing.result && typeof existing.result === 'object') {
				const result = existing.result as { code: number; data?: any };
				if (result.code === 0 && result.data) {
					const updateData: any = {};
					if (phone && !result.data.phone) {
						updateData.phone = phone;
					}

					if (Object.keys(updateData).length > 0) {
						await cloudDb.updateById(Collections.CUSTOMERS, result.data._id, updateData);
					}

					return;
				}
			}

			const customerData = {
				surname,
				gender,
				phone: phone || '',
				projects: project ? [project] : [],
				licensePlate: licensePlate || '',
				isClockIn: isClockIn || false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};

			await cloudDb.insert(Collections.CUSTOMERS, customerData);
		} catch (error) {
			console.error('保存顾客信息失败:', error);
		}
	}
}
