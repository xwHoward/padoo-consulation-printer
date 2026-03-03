import { DataLoader as CommonDataLoader } from "../../common/utils/data-loader";
import { cloudDb, Collections } from "../../../utils/cloud-db";
import { formatDate, formatTime, parseProjectDuration } from "../../../utils/util";

const app = getApp<IAppOption>();

export class DataLoaderService {
  private page: any;

  constructor(page: any) {
    this.page = page;
  }

  async loadTechnicianList() {
    try {
      const { editId, consultationInfo } = this.page.data;

      let targetDate: string;
      let currentTimeStr: string;

      if (editId && consultationInfo.date) {
        targetDate = consultationInfo.date;
        currentTimeStr = consultationInfo.startTime || formatTime(new Date(), false);
      } else {
        const now = new Date();
        targetDate = formatDate(now);
        currentTimeStr = formatTime(now, false);
      }

      this.page.setData({ loadingTechnicians: true });

      const projectDuration = parseProjectDuration(this.page.data.consultationInfo.project) || 60;

      const list = await CommonDataLoader.loadTechnicianAvailability(
        targetDate,
        currentTimeStr,
        projectDuration,
        this.page.data.currentReservationIds,
        this.page.data.editId
      );

      if (list && list.length > 0) {
        this.page.setData({ technicianList: list, loadingTechnicians: false });
      } else {
        wx.showToast({
          title: '加载技师列表失败',
          icon: 'none'
        });
        this.page.setData({ loadingTechnicians: false });
      }
    } catch (error) {
      this.page.setData({ loadingTechnicians: false });
      wx.showToast({
        title: '加载技师列表失败',
        icon: 'none'
      });
    }
  }

  async loadProjects() {
    const projects = await CommonDataLoader.loadProjects();
    this.page.setData({ projects });
  }

  async loadEditData(editId: string, ensureConsultationInfoCompatibility: any) {
    this.page.setData({ loading: true, loadingText: '加载中...' });

    try {
      const foundRecord = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, editId);

      if (foundRecord) {
        const projects = await CommonDataLoader.loadProjects();
        const selectedProject = projects.find((p: any) => p.name === foundRecord.project);
        const isEssentialOilOnly = selectedProject?.isEssentialOilOnly || false;

        const updateData: any = {
          consultationInfo: ensureConsultationInfoCompatibility(foundRecord, projects),
          editId: editId,
          currentProjectIsEssentialOilOnly: isEssentialOilOnly,
          currentProjectNeedEssentialOil: selectedProject?.needEssentialOil || false,
          matchedCustomer: null,
          matchedCustomerApplied: false
        };

        if (foundRecord.licensePlate) {
          updateData.licensePlate = foundRecord.licensePlate;

          const isNewEnergyVehicle = foundRecord.licensePlate.length === 8;
          const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
          const plateNumber = Array(maxPlateLength).fill('');
          const plateChars = foundRecord.licensePlate.split('');
          plateChars.forEach((char: string, index: number) => {
            if (index < maxPlateLength) {
              plateNumber[index] = char;
            }
          });
          updateData.plateNumber = plateNumber;
        }

        this.page.setData(updateData);
        await this.loadTechnicianList();
      } else {
        wx.showToast({
          title: "编辑记录不存在",
          icon: "error",
        });
      }
    } catch (error) {
      wx.showToast({
        title: "加载失败",
        icon: "error",
      });
    } finally {
      this.page.setData({ loading: false });
    }
  }

  async loadReservationData(
    reserveIdOrIds: string,
    DefaultConsultationInfo: any,
    DefaultGuestInfo: any
  ) {
    this.page.setData({ loading: true, loadingText: '加载中...' });

    try {
      const reserveIds = reserveIdOrIds.includes(',') ? reserveIdOrIds.split(',') : [reserveIdOrIds];
      const records = await Promise.all(
        reserveIds.map((_id: string) => cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id))
      );
      const validRecords = records.filter((r: any) => r !== null) as ReservationRecord[];

      if (validRecords.length > 0) {
        const projects = await CommonDataLoader.loadProjects();
        const firstRecord = validRecords[0];
        const selectedProject = projects.find((p: any) => p.name === firstRecord.project);
        const isEssentialOilOnly = selectedProject?.isEssentialOilOnly || false;
        const isClockInValue = firstRecord.isClockIn || false;

        if (validRecords.length > 1) {
          const secondIsClockIn = validRecords[1].isClockIn || false;
          this.page.setData({
            isDualMode: true,
            activeGuest: 1,
            consultationInfo: {
              ...DefaultConsultationInfo,
              surname: firstRecord.customerName,
              gender: firstRecord.gender,
              phone: firstRecord.phone,
              project: firstRecord.project,
              technician: firstRecord.technicianName || '',
              isClockIn: isClockInValue,
            },
            guest1Info: {
              ...DefaultGuestInfo,
              surname: firstRecord.customerName,
              gender: firstRecord.gender,
              project: firstRecord.project,
              technician: firstRecord.technicianName || '',
              isClockIn: isClockInValue,
            },
            guest2Info: {
              ...DefaultGuestInfo,
              surname: firstRecord.customerName,
              gender: firstRecord.gender,
              project: firstRecord.project,
              technician: validRecords[1].technicianName || '',
              isClockIn: secondIsClockIn,
            },
            currentProjectIsEssentialOilOnly: isEssentialOilOnly,
            currentProjectNeedEssentialOil: selectedProject?.needEssentialOil || false,
            currentReservationIds: reserveIds
          });
        } else {
          this.page.setData({
            consultationInfo: {
              ...DefaultConsultationInfo,
              surname: firstRecord.customerName,
              gender: firstRecord.gender,
              phone: firstRecord.phone,
              project: firstRecord.project,
              technician: firstRecord.technicianName || '',
              isClockIn: isClockInValue,
            },
            currentProjectIsEssentialOilOnly: isEssentialOilOnly,
            currentProjectNeedEssentialOil: selectedProject?.needEssentialOil || false,
            currentReservationIds: reserveIds
          });
        }
        await this.loadTechnicianList();
      }
    } catch (error) {
    } finally {
      this.page.setData({ loading: false });
    }
  }
}
