import { Collections, cloudDb } from '../../utils/cloud-db';
import { formatDate } from '../../utils/util';

interface TechCard {
  _id: string;
  name: string;
  avatar?: string;
  gender: string;
  latestAppointment?: string;
  availableMinutes?: number;
  status: 'available' | 'busy';
}

Page({
  data: {
    loading: true,
    techList: [] as TechCard[],
  },

  onLoad() {
    this.loadAvailableTechnicians();
    this.startAutoRefresh();
  },

  onUnload() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  },

  refreshTimer: null as number | null,


  async loadAvailableTechnicians() {
    this.setData({ loading: true });

    try {
      const now = new Date();
      const today = formatDate(now);

      const scheduleResult = await cloudDb.find<ScheduleRecord>(Collections.SCHEDULE, {
        date: today
      });

      const schedules = scheduleResult;
      const onDutyStaffIds = schedules
        .filter(s => s.shift !== 'off' && s.shift !== 'leave')
        .map(s => s.staffId);

      if (onDutyStaffIds.length === 0) {
        this.setData({ techList: [], loading: false });
        return;
      }

      const staffResult = await cloudDb.find<StaffInfo>(Collections.STAFF, {
        status: 'active'
      });

      const allStaff = staffResult;
      const onDutyStaff = allStaff.filter(s => onDutyStaffIds.includes(s._id));

      const consultationsResult = await cloudDb.find<ConsultationRecord>(Collections.CONSULTATION, {
        date: today,
        isVoided: false
      });

      const consultations = consultationsResult;

      const techList: TechCard[] = onDutyStaff.map(staff => {
        const staffConsultations = consultations.filter(c => c.technician === staff.name);

        let latestAppointment: string | undefined;
        let availableMinutes: number | undefined;
        let status: 'available' | 'busy' = 'available';

        if (staffConsultations.length > 0) {
          const sortedConsultations = staffConsultations.sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          const latest = sortedConsultations[0];
          if (latest.endTime) {
            latestAppointment = latest.endTime;

            const endTime = this.parseTime(latest.endTime);
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const endTimeMinutes = endTime.hours * 60 + endTime.minutes;

            if (endTimeMinutes > currentTime) {
              availableMinutes = endTimeMinutes - currentTime;
              status = 'busy';
            } else {
              status = 'available';
            }
          }
        }

        return {
          _id: staff._id,
          name: staff.name,
          avatar: staff.avatar,
          gender: staff.gender,
          latestAppointment,
          availableMinutes,
          status
        };
      });

      this.setData({
        techList,
        loading: false
      });
    } catch (error) {
      console.error('加载技师信息失败:', error);
      this.setData({ loading: false });
    }
  },

  parseTime(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
  },

  startAutoRefresh() {
    this.refreshTimer = setInterval(() => {
      this.loadAvailableTechnicians();
    }, 60000);
  },
});
