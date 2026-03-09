import { formatDate, formatTime, parseProjectDuration } from "../../../utils/util";
import { DataLoaderService } from "../services/data-loader.service";
import { ClockInUtils } from "../utils/clockin-utils";

const SPARE_TIME = 15;

export class ModalHandler {
  private page: IndexPage<DataLoaderService>;
  private dataLoader: DataLoaderService | null;

  constructor(page: IndexPage<DataLoaderService>, dataLoader: DataLoaderService | null) {
    this.page = page;
    this.dataLoader = dataLoader;
  }

  async onTimePickerConfirm() {
    const { timePickerModal, consultationInfo, editId, isDualMode, licensePlate } = this.page.data;
    const { currentTime: selectedTime } = timePickerModal;

    this.page.setData({ 'timePickerModal.show': false });
    const [hours, minutes] = selectedTime.split(':').map(Number);
    let startTimeDate: Date;

    if (editId) {
      const recordDate = consultationInfo.date || formatDate(new Date());
      const [year, month, day] = recordDate.split('-').map(Number);
      startTimeDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    } else {
      startTimeDate = new Date();
      startTimeDate.setHours(hours, minutes, 0, 0);
    }

    this.page.setData({ loading: true, loadingText: '报钟中...' });
    try {
      if (isDualMode) {
        await this.page.doDualClockIn(startTimeDate, editId);
      } else {
        const projectDuration = parseProjectDuration(consultationInfo.project) || 60;
        const extraTime = consultationInfo.extraTime || 0;
        const totalDuration = projectDuration + extraTime + SPARE_TIME;
        const endTimeDate = new Date(startTimeDate.getTime() + totalDuration * 60 * 1000);
        const endTime = formatTime(endTimeDate, false);
        const updatedInfo = {
          ...consultationInfo, 
          startTime: selectedTime, 
          licensePlate: licensePlate || '', 
          isNewEnergyVehicle: licensePlate?.length === 8 || false,
          date: editId ? consultationInfo.date : formatDate(new Date()),
          endTime,
        };
        const clockInInfo = await ClockInUtils.formatClockInInfo(updatedInfo, editId);
        const success = await this.page.saveConsultation(updatedInfo, editId);

        if (success) {
          this.page.setData({
            'clockInModal.show': true,
            'clockInModal.content': clockInInfo,
            clockInSubmitting: true
          });
          if (this.dataLoader) {
            await this.dataLoader.loadTechnicianList();
          }
        }
      }
    } finally {
      this.page.setData({ loading: false });
    }
  }

  onTimePickerCancel() {
    this.page.setData({ 'timePickerModal.show': false });
  }

  onTimePickerChange(e: WechatMiniprogram.CustomEvent) {
    const { value } = e.detail;
    const now = new Date();
    now.setHours(value[0], value[1], 0, 0);
    const currentTime = `${String(value[0]).padStart(2, '0')}:${String(value[1]).padStart(2, '0')}`;
    this.page.setData({ 'timePickerModal.currentTime': currentTime });
  }

  onTimeColumnChange(e: WechatMiniprogram.CustomEvent) {
    const { column, value } = e.detail;
    if (column === 0) {
      this.page.setData({ selectedHour: value });
    } else if (column === 1) {
      this.page.setData({ selectedMinute: value });
    }
  }

  showPlateInputModal() {
    this.page.setData({ licensePlateInputVisible: true });
  }

  hidePlateInputModal() {
    this.page.setData({ licensePlateInputVisible: false });
  }

  onPlateConfirm(e: WechatMiniprogram.CustomEvent) {
    const { value } = e.detail;
    const isNewEnergyVehicle = value.length === 8;
    const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
    const plateNumber = Array(maxPlateLength).fill('');
    
    if (value) {
      const plateChars = value.split('');
      plateChars.forEach((char: string, index: number) => {
        if (index < maxPlateLength) {
          plateNumber[index] = char;
        }
      });
    }
    
    this.page.setData({
      licensePlateInputVisible: false,
      licensePlate: value,
      plateNumber: plateNumber
    });
  }

  onClockInModalCancel() {
    const { editId } = this.page.data;

    this.page.setData({
      'clockInModal.show': false,
      'clockInModal.content': '',
      clockInSubmitting: false
    });

    if (editId) {
      wx.navigateBack();
    } else {
      this.page.resetForm();
    }
  }

  onClockInContentInput(e: WechatMiniprogram.CustomEvent) {
    const value = e.detail.value;
    this.page.setData({
      'clockInModal.content': value
    });
  }

  async onClockInModalConfirm() {
    const { content } = this.page.data.clockInModal;
    const { editId } = this.page.data;

    this.page.setData({ 'clockInModal.loading': true });

    try {
      const success = await this.page.sendToWechatWebhook(content);

      this.page.setData({ 'clockInModal.loading': false });

      if (success) {
        wx.showToast({ title: '推送成功', icon: 'success' });

        setTimeout(() => {
          this.page.setData({
            'clockInModal.show': false,
            'clockInModal.content': '',
            clockInSubmitting: false
          });

          if (editId) {
            wx.navigateBack();
          } else {
            this.page.resetForm();
          }
        }, 1500);
      } else {
        wx.showToast({ title: '推送失败，请重试', icon: 'error' });
      }
    } catch (error) {
      this.page.setData({ 'clockInModal.loading': false });
      wx.showToast({ title: '推送失败，请重试', icon: 'error' });
    }
  }
}
