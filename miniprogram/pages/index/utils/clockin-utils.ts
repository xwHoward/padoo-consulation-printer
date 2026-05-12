import { cloudDb, Collections } from "../../../utils/cloud-db";
import { formatDate, formatTime, parseProjectDuration } from "../../../utils/util";
import { SHIFT_START_TIME, SHIFT_END_TIME, calculateOvertimeHours } from "../../../utils/constants";

const app = getApp<IAppOption>();
const SPARE_TIME = 15;

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

      const { startTime, endTime } = record;
      const shiftStartTime = SHIFT_START_TIME[schedule.shift as keyof typeof SHIFT_START_TIME], shiftEndTime = SHIFT_END_TIME[schedule.shift as keyof typeof SHIFT_END_TIME];
      if (!startTime || !endTime || !shiftStartTime || !shiftEndTime) return 0;
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const [shiftStartHour] = shiftStartTime.split(":").map(Number);
      const [shiftEndHour] = shiftEndTime.split(":").map(Number);
      let totalOvertimeMins = 0;
      if (startHour <= endHour) {
        if (endHour < 6) {
          totalOvertimeMins += endHour * 60 + endMin;
        } else if (startHour < shiftStartHour) {
          totalOvertimeMins += (shiftStartHour - startHour) * 60 - startMin;
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

  static async formatClockInInfo(
    info: Add<ConsultationInfo>, 
    editId?: string,
    isBeforeSave: boolean = true
  ): Promise<string> {
    let dailyCount = 1;

    if (info.date && info.startTime && info.technician) {
      if (editId) {
        const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(info.date) as ConsultationRecord[];
        const currentRecord = records.find(r => r._id === editId);

        if (currentRecord) {
          dailyCount = records.filter(
            (record: ConsultationRecord) =>
              record.technician === info.technician &&
              !record.isVoided &&
              new Date(record.createdAt) < new Date(currentRecord.createdAt)
          ).length + 1;
        } else {
          dailyCount = records.filter(
            (record: ConsultationRecord) => record.technician === info.technician && !record.isVoided
          ).length;
        }
      } else {
        const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(info.date) as ConsultationRecord[];
        const existingCount = records.filter(
          (record: ConsultationRecord) => record.technician === info.technician && !record.isVoided
        ).length;
        
        dailyCount = isBeforeSave ? existingCount + 1 : existingCount;
      }
    }

    const startTime = info.startTime || formatTime(new Date(), false);
    const projectDuration = parseProjectDuration(info.project);
    const totalDuration = projectDuration + SPARE_TIME;

    let endTime: string;
    if (info.endTime) {
      endTime = info.endTime;
    } else if (info.date && info.startTime) {
      const [year, month, day] = info.date.split('-').map(Number);
      const [hours, minutes] = startTime.split(':').map(Number);
      const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
      const endDateTime = new Date(startDate.getTime() + totalDuration * 60 * 1000);
      endTime = formatTime(endDateTime, false);
    } else {
      const currentTime = new Date();
      const endDateTime = new Date(currentTime.getTime() + totalDuration * 60 * 1000);
      endTime = formatTime(endDateTime, false);
    }

    let formattedInfo = "";
    formattedInfo += `**顾客**: ${info.surname}${info.gender === "male" ? "先生" : "女士"
      }\n`;
    formattedInfo += `**项目**: ${info.project}\n`;
    formattedInfo += `**技师**: ${info.technician}(${dailyCount})${info.isClockIn ? "[点]" : ""}\n`;
    formattedInfo += `**房间**: ${info.room}\n`;
    formattedInfo += `**时间**: ${startTime} - ${endTime}`;

    if (info.remarks) {
      formattedInfo += `\n**备注**: ${info.remarks}`;
    }

    return formattedInfo;
  }

  static buildDualClockInInfo(
    consultationInfo: Add<ConsultationInfo>,
    guest1Info: GuestInfo,
    guest2Info: GuestInfo,
    startTimeDate?: Date,
    editId?: string
  ): { info1: Add<ConsultationInfo>; info2: Add<ConsultationInfo>; startTime: string } {
    const result = ClockInUtils.buildMultiClockInInfo(consultationInfo, [guest1Info, guest2Info], startTimeDate, editId);
    return { info1: result.infos[0], info2: result.infos[1], startTime: result.startTime };
  }

  static buildMultiClockInInfo(
    consultationInfo: Add<ConsultationInfo>,
    guestInfos: GuestInfo[],
    startTimeDate?: Date,
    editId?: string
  ): { infos: Add<ConsultationInfo>[]; startTime: string } {
    let actualStartTime: Date;
    if (startTimeDate) {
      actualStartTime = startTimeDate;
    } else if (editId) {
      const recordDate = consultationInfo.date || formatDate(new Date());
      const now = new Date();
      const [year, month, day] = recordDate.split('-').map(Number);
      actualStartTime = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), 0, 0);
    } else {
      actualStartTime = new Date();
    }

    const startTime = formatTime(actualStartTime, false);
    const extraTime = consultationInfo.extraTime || 0;

    const infos: Add<ConsultationInfo>[] = guestInfos.map(guest => {
      const projectDuration = parseProjectDuration(guest.project) || 60;
      const totalDuration = projectDuration + extraTime + SPARE_TIME;
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
        startTime,
        endTime,
      };

      if (editId) {
        info.date = consultationInfo.date || formatDate(new Date());
      }

      return info;
    });

    return { infos, startTime };
  }
}
