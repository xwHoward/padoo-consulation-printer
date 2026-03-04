import { cloudDb, Collections } from "../../../utils/cloud-db";
import { parseProjectDuration } from "../../../utils/util";

const app = getApp<IAppOption>();

export class ReservationUtils {
  static async deleteReservations(currentReservationIds: string[]): Promise<number> {
    if (!currentReservationIds || currentReservationIds.length === 0) {
      return 0;
    }

    try {
      let deletedCount = 0;
      for (const reserveId of currentReservationIds) {
        await cloudDb.updateById(Collections.RESERVATIONS, reserveId, {
          status: 'arrived'
        });
        deletedCount++;
      }
      return deletedCount;
    } catch (error) {
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
        if (r.isClockIn) {
          return false;
        }
        return r.startTime >= currentTime;
      });

      if (futureReservations.length === 0) {
        return;
      }

      const rotationData = await app.getRotationQueue(date);
      if (!rotationData || !rotationData.staffList || rotationData.staffList.length === 0) {
        return;
      }

      const allStaff = await app.getStaffs();
      const staffMap = new Map(allStaff.map(s => [s._id, s]));

      const rotationStaffList = rotationData.staffList.map(item => ({
        staffId: item.staffId,
        position: item.position,
        staff: staffMap.get(item.staffId)
      })).filter(item => item.staff && item.staff!.status === 'active');

      const sortedReservations = [...futureReservations].sort((a, b) => 
        a.startTime.localeCompare(b.startTime)
      );

      const staffReservationCount = new Map<string, number>();
      for (const item of rotationStaffList) {
        staffReservationCount.set(item.staffId, 0);
      }

      for (const reservation of sortedReservations) {
        let requiredGender: 'male' | 'female' | undefined;
        
        if (reservation.genderRequirement) {
          requiredGender = reservation.genderRequirement;
        } else if (reservation.technicianId) {
          const staff = staffMap.get(reservation.technicianId);
          if (staff) {
            requiredGender = staff.gender;
          }
        }

        if (!requiredGender) {
          continue;
        }

        let bestStaffId: string | null = null;
        let minReservationCount = Infinity;

        for (const rotationItem of rotationStaffList) {
          const staff = rotationItem.staff!;
          const staffId = rotationItem.staffId;

          if (staff.gender !== requiredGender) {
            continue;
          }

          const currentCount = staffReservationCount.get(staffId) || 0;

          if (currentCount < minReservationCount) {
            const projectDuration = parseProjectDuration(reservation.project) || 60;
            
            try {
              const checkRes = await wx.cloud.callFunction({
                name: 'getAvailableTechnicians',
                data: {
                  date: date,
                  currentTime: reservation.startTime,
                  projectDuration: projectDuration,
                  currentReservationIds: [reservation._id],
                  currentConsultationId: undefined
                }
              });

              let checkAvailable: StaffAvailability[] = [];
              if (checkRes.result && typeof checkRes.result === 'object') {
                const result = checkRes.result as GetAvailableTechniciansResult;
                if (result.code === 0 && result.data) {
                  checkAvailable = result.data;
                }
              }

              const isAvailable = checkAvailable.some(t => t._id === staffId);

              if (isAvailable) {
                bestStaffId = staffId;
                minReservationCount = currentCount;
              }
            } catch (error) {
              continue;
            }
          }
        }

        if (bestStaffId) {
          const staff = staffMap.get(bestStaffId)!;
          await cloudDb.updateById(Collections.RESERVATIONS, reservation._id, {
            technicianId: bestStaffId,
            technicianName: staff.name,
            isClockIn: false
          });

          staffReservationCount.set(bestStaffId, (staffReservationCount.get(bestStaffId) || 0) + 1);
        }
      }
    } catch (error) {
      console.error('重新分配预约失败:', error);
    }
  }

  static async saveCustomerInfo(consultation: Add<ConsultationInfo> & { licensePlate?: string }): Promise<void> {
    try {
      const phone = consultation.phone.trim();
      if (!phone) return;

      const existingCustomers = await cloudDb.find<CustomerRecord>(Collections.CUSTOMERS, { phone });

      const customerData: Omit<CustomerRecord, "_id" | "createdAt" | "updatedAt"> = {
        phone: phone,
        name: consultation.surname + (consultation.gender === 'male' ? '先生' : '女士'),
        gender: consultation.gender || '',
        responsibleTechnician: consultation.technician || '',
        licensePlate: consultation.licensePlate || '',
        remarks: consultation.remarks || '',
      };

      if (existingCustomers && existingCustomers.length > 0) {
        const existingCustomer = existingCustomers[0];
        await cloudDb.updateById<CustomerRecord>(Collections.CUSTOMERS, existingCustomer._id, customerData);
      } else {
        await cloudDb.insert<CustomerRecord>(Collections.CUSTOMERS, customerData);
      }
    } catch (error) {
    }
  }
}
