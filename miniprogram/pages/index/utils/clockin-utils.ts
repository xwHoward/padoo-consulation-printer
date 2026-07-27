import {cloudDb, Collections} from "../../../utils/cloud-db";
import {formatDate, formatTime, parseProjectDuration} from "../../../utils/util";
import {SHIFT_START_TIME, SHIFT_END_TIME, calculateOvertimeHours} from "../../../utils/constants";

const app = getApp<IAppOption>();
const SPARE_TIME = 0; // 10分钟准备+休息时间

export class ClockInUtils {
  static async calculateOvertime(record: Add<ConsultationRecord>): Promise<number> {
    try {
      const staff = await app.getActiveStaffs().then(staffs => staffs.find(s => s.name === record.technician));

      if (!staff) {
        return 0;
      }

      const schedules = await cloudDb.find<ScheduleRecord>(Collections.SCHEDULE, {
        date: record.date,
      });
      const schedule = schedules.find(s => s.staffId === staff._id);
      if (!schedule) {
        return 0;
      }

      if (schedule.shift === 'overtime') {
        const projectDuration = parseProjectDuration(record.project);
        return calculateOvertimeHours(projectDuration);
      }

      const {startTime, endTime} = record;
      const shiftStartTime = SHIFT_START_TIME[schedule.shift as keyof typeof SHIFT_START_TIME], shiftEndTime = SHIFT_END_TIME[schedule.shift as keyof typeof SHIFT_END_TIME];
      if (!startTime || !endTime || !shiftStartTime || !shiftEndTime) return 0;
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const [shiftStartHour] = shiftStartTime.split(":").map(Number);
      const [shiftEndHour] = shiftEndTime.split(":").map(Number);
      // 单据本身时长（分钟），上班前加班不得超过该时长
      let recordDurationMins = (endHour * 60 + endMin) - (startHour * 60 + startMin);
      if (recordDurationMins < 0) recordDurationMins += 24 * 60;

      let totalOvertimeMins = 0;
      if (startHour <= endHour) {
        if (endHour < 6) {
          totalOvertimeMins += endHour * 60 + endMin;
        } else if (startHour < shiftStartHour) {
          const beforeShiftMins = (shiftStartHour - startHour) * 60 - startMin;
          totalOvertimeMins += Math.min(beforeShiftMins, recordDurationMins);
        } else if (endHour >= shiftEndHour) {
          totalOvertimeMins += (endHour - shiftEndHour) * 60 + endMin;
        }
      } else {
        totalOvertimeMins += (24 - shiftEndHour + endHour) * 60 + endMin;
      }
      return Math.floor(totalOvertimeMins / 30);
    } catch (error) {
      return 0;
    }
  }

  static buildMultiClockInInfo(
    consultationInfo: Add<ConsultationInfo>,
    guestInfos: GuestInfo[],
    startTimeDate?: Date,
    editId?: string
  ): {infos: Add<ConsultationInfo>[]; startTime: string;} {
    let actualStartTime: Date;
    if (startTimeDate) {
      actualStartTime = startTimeDate;
    } else if (editId && consultationInfo.startTime && consultationInfo.date) {
      const [year, month, day] = consultationInfo.date.split('-').map(Number);
      const [hours, minutes] = consultationInfo.startTime.split(':').map(Number);
      actualStartTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    } else {
      actualStartTime = new Date();
    }

    const startTime = formatTime(actualStartTime, false);
    // 以实际开始时间（含用户在日期选择器中选择的日期）为准生成记录日期，
    // 避免多人模式下仍使用 consultationInfo.date（默认当天）导致所选日期不生效
    const recordDate = formatDate(actualStartTime);
    const extraTimeMinutes = (consultationInfo.extraTime || 0) * 30;

    const infos: Add<ConsultationInfo>[] = guestInfos.map(guest => {
      const projectDuration = parseProjectDuration(guest.project) || 90;
      const totalDuration = projectDuration + extraTimeMinutes + SPARE_TIME;
      const endTimeDate = new Date(actualStartTime.getTime() + totalDuration * 60 * 1000);
      const endTime = formatTime(endTimeDate, false);

      const info: Add<ConsultationInfo> = {
        ...consultationInfo,
        surname: guest.surname,
        gender: guest.gender,
        project: guest.project,
        technician: guest.technician,
        room: guest.room,
        isClockIn: guest.isClockIn,
        massageStrength: guest.massageStrength,
        essentialOil: guest.essentialOil,
        selectedParts: guest.selectedParts,
        remarks: guest.remarks,
        couponCode: guest.couponCode,
        couponPlatform: guest.couponPlatform,
        date: recordDate,
        startTime,
        endTime,
      };

      return info;
    });

    return {infos, startTime};
  }
}