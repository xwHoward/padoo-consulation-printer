import { cloudDb, Collections } from "../../../utils/cloud-db";
import { formatDate, formatTime, parseProjectDuration, SHIFT_END_TIMES, SHIFT_START_TIMES } from "../../../utils/util";

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

      const { startTime, endTime } = record;
      const shiftStartTime = SHIFT_START_TIMES[schedule.shift], shiftEndTime = SHIFT_END_TIMES[schedule.shift];
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

  static async formatClockInInfo(info: Add<ConsultationInfo>, editId?: string): Promise<string> {
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
        dailyCount = records.filter(
          (record: ConsultationRecord) => record.technician === info.technician && !record.isVoided
        ).length + 1;
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
    guest1Info: any,
    guest2Info: any,
    startTimeDate?: Date,
    editId?: string
  ): { info1: Add<ConsultationInfo>; info2: Add<ConsultationInfo>; startTime: string } {
    const info1: Add<ConsultationInfo> = {
      ...consultationInfo,
      surname: guest1Info.surname,
      gender: guest1Info.gender,
      project: guest1Info.project,
      selectedParts: guest1Info.selectedParts,
      massageStrength: guest1Info.massageStrength,
      essentialOil: guest1Info.essentialOil,
      remarks: guest1Info.remarks,
      technician: guest1Info.technician,
      isClockIn: guest1Info.isClockIn,
      couponCode: guest1Info.couponCode,
      couponPlatform: guest1Info.couponPlatform,
    };
    const info2: Add<ConsultationInfo> = {
      ...consultationInfo,
      surname: guest2Info.surname,
      gender: guest2Info.gender,
      project: guest2Info.project,
      selectedParts: guest2Info.selectedParts,
      massageStrength: guest2Info.massageStrength,
      essentialOil: guest2Info.essentialOil,
      remarks: guest2Info.remarks,
      technician: guest2Info.technician,
      isClockIn: guest2Info.isClockIn,
      couponCode: guest2Info.couponCode,
      couponPlatform: guest2Info.couponPlatform,
    };

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

    info1.startTime = startTime;
    info2.startTime = startTime;

    if (editId) {
      info1.date = consultationInfo.date || formatDate(new Date());
      info2.date = consultationInfo.date || formatDate(new Date());
    }

    const projectDuration1 = parseProjectDuration(info1.project) || 60;
    const projectDuration2 = parseProjectDuration(info2.project) || 60;
    const extraTime = consultationInfo.extraTime || 0;
    const totalDuration1 = projectDuration1 + extraTime + SPARE_TIME;
    const totalDuration2 = projectDuration2 + extraTime + SPARE_TIME;

    const endTimeDate1 = new Date(actualStartTime.getTime() + totalDuration1 * 60 * 1000);
    const endTimeDate2 = new Date(actualStartTime.getTime() + totalDuration2 * 60 * 1000);

    info1.endTime = formatTime(endTimeDate1, false);
    info2.endTime = formatTime(endTimeDate2, false);

    return { info1, info2, startTime };
  }
}
