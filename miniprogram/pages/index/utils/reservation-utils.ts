import {cloudDb, Collections} from "../../../utils/cloud-db";
import {parseProjectDuration} from "../../../utils/util";

const app = getApp<IAppOption>();

export class ReservationUtils {
  static async markReservationAsArrived(currentReservationIds: string[]): Promise<number> {
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

      // 仅处理未来的轮钟预约（排除点钟和已过时间）
      const futureReservations = allReservations.filter(r => !r.isClockIn && r.startTime >= currentTime);

      if (futureReservations.length === 0) return;

      const rotationData = await app.getRotationQueue(date);
      if (!rotationData?.staffList?.length) return;

      const allStaff = await app.getStaffs();
      const staffMap = new Map(allStaff.map(s => [s._id, s]));

      // 严格按轮钟位置排序，过滤掉不在岗的技师
      const rotationStaffList = rotationData.staffList
        .map(item => ({
          staffId: item.staffId,
          position: item.position,
          staff: staffMap.get(item.staffId)
        }))
        .filter(item => item.staff && item.staff!.status === 'active')
        .sort((a, b) => a.position - b.position);

      // 按时间升序处理，保证同组多条预约按顺序分配
      const sortedReservations = [...futureReservations].sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );

      // 同组预约（同客户同时段同项目）已分配的技师集合，防止双人预约重复分配
      const groupAssignedStaff = new Map<string, Set<string>>();
      const getGroupKey = (r: ReservationRecord) =>
        `${ r.customerName }-${ r.date }-${ r.startTime }-${ r.endTime }-${ r.project }`;

      for (const reservation of sortedReservations) {
        // 规则1：确定性别要求（优先 genderRequirement，否则沿用原技师性别）
        let requiredGender: 'male' | 'female' | undefined;
        if (reservation.genderRequirement) {
          requiredGender = reservation.genderRequirement;
        } else if (reservation.technicianId) {
          requiredGender = staffMap.get(reservation.technicianId)?.gender;
        }

        if (!requiredGender) continue;

        // 规则4：初始化本组已分配集合
        const groupKey = getGroupKey(reservation);
        if (!groupAssignedStaff.has(groupKey)) {
          groupAssignedStaff.set(groupKey, new Set());
        }
        const assignedInGroup = groupAssignedStaff.get(groupKey)!;

        // 规则3：一次性获取该时间段所有可用技师（含10分钟重叠容差检测）
        const projectDuration = parseProjectDuration(reservation.project) || 60;
        let availableTechnicians: StaffAvailability[] = [];
        try {
          const checkRes = await wx.cloud.callFunction({
            name: 'getAvailableTechnicians',
            data: {
              date,
              currentTime: reservation.startTime,
              projectDuration,
              currentReservationIds: [reservation._id],
              currentConsultationId: undefined
            }
          });
          if (checkRes.result && typeof checkRes.result === 'object') {
            const result = checkRes.result as GetAvailableTechniciansResult;
            if (result.code === 0 && result.data) {
              availableTechnicians = result.data;
            }
          }
        } catch {
          continue;
        }

        const availableIds = new Set(availableTechnicians.map(t => t._id));

        // 规则2+3+4：按轮钟顺序选出第一个满足「性别匹配 + 时间可用 + 同组未重复」的技师
        let bestStaffId: string | null = null;
        for (const rotationItem of rotationStaffList) {
          const staff = rotationItem.staff!;
          const staffId = rotationItem.staffId;

          if (staff.gender !== requiredGender) continue;  // 规则1：性别不符
          if (assignedInGroup.has(staffId)) continue;     // 规则4：同组已分配
          if (!availableIds.has(staffId)) continue;       // 规则3：时间冲突

          bestStaffId = staffId;
          break;
        }

        if (bestStaffId) {
          const staff = staffMap.get(bestStaffId)!;
          await cloudDb.updateById(Collections.RESERVATIONS, reservation._id, {
            technicianId: bestStaffId,
            technicianName: staff.name,
            isClockIn: false
          });
          assignedInGroup.add(bestStaffId);
        }
      }
    } catch (error) {
      console.error('重新分配预约失败:', error);
    }
  }

  static async saveCustomerInfo(consultation: Add<ConsultationInfo> & {licensePlate?: string;}): Promise<void> {
    try {
      const phone = consultation.phone.trim();
      if (!phone) return;

      const existingCustomers = await cloudDb.find<CustomerRecord>(Collections.CUSTOMERS, {phone});

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
