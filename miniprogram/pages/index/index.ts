import { PrintContentBuilder } from "../../services/print-content-builder";
import { printerService } from "../../services/printer-service";
import { checkLogin } from "../../utils/auth";
import { cloudDb } from "../../utils/cloud-db";
import { requirePagePermission } from "../../utils/permission";
import { calculateProjectEndTime, formatDate, formatTime } from "../../utils/util";
import { showValidationError, validateConsultationForPrint } from "../../utils/validators";
import { FormHandler } from "./handlers/form.handler";
import { ModalHandler } from "./handlers/modal.handler";
import { DataLoaderService } from "./services/data-loader.service";
import { ClockInUtils } from "./utils/clockin-utils";
import { CustomerUtils } from "./utils/customer-utils";
import { ReservationUtils } from "./utils/reservation-utils";

const app = getApp<IAppOption>();
const DefaultConsultationInfo: Add<ConsultationInfo> = {
  surname: "",
  gender: "male",
  project: "",
  technician: "",
  room: "",
  massageStrength: "standard",
  essentialOil: "",
  selectedParts: {},
  isClockIn: false,
  remarks: "",
  phone: "",
  couponCode: "",
  extraTime: 0,
  couponPlatform: "meituan",
  date: formatDate(new Date()),
  startTime: "",
  endTime: "",
};

const DefaultGuestInfo: GuestInfo = {
  surname: "",
  gender: "male",
  selectedParts: {},
  massageStrength: "standard",
  essentialOil: "",
  remarks: "",
  technician: "",
  isClockIn: false,
  couponCode: "",
  couponPlatform: "meituan",
  project: "",
};

function ensureConsultationInfoCompatibility(data: ConsultationInfo, projects: Project[] = []): Update<ConsultationInfo> {
  const defaultProject = projects.length > 1 ? projects[1].name : '';
  return {
    surname: data.surname || "",
    gender: data.gender || "",
    project: data.project || defaultProject,
    technician: data.technician || "",
    room: data.room || "",
    extraTime: data.extraTime || 0,
    massageStrength: data.massageStrength || "",
    essentialOil: data.essentialOil || "",
    selectedParts: data.selectedParts || {},
    isClockIn: data.isClockIn || false,
    remarks: data.remarks || "",
    phone: data.phone || "",
    couponCode: data.couponCode || "",
    couponPlatform: data.couponPlatform || "",
    date: data.date || formatDate(new Date()),
    startTime: data.startTime || "",
    endTime: data.endTime || "",
  };
}



Page({
  data: {
    projects: [] as Project[],
    consultationInfo: { ...DefaultConsultationInfo, selectedParts: {} },
    editId: "", // 正在编辑的记录ID
    technicianList: [] as StaffAvailability[], // 动态技师列表
    currentReservationIds: [] as string[], // 当前加载的预约ID列表（用于冲突检查时排除）
    loadingTechnicians: false, // 加载技师状态
    loading: false, // 全局loading状态
    loadingText: '加载中...', // loading提示文字
    // 专用精油相关
    currentProjectIsEssentialOilOnly: false, // 当前项目是否为专用精油项目
    currentProjectNeedEssentialOil: false, // 当前项目是否需要精油
    // 双人模式相关
    isDualMode: false, // 是否为双人模式
    activeGuest: 1 as 1 | 2, // 当前活跃的顾客标签
    guest1Info: { ...DefaultGuestInfo, selectedParts: {} } as GuestInfo, // 顾客1独立信息
    guest2Info: { ...DefaultGuestInfo, selectedParts: {} } as GuestInfo, // 顾客2独立信息
    // 顾客匹配相关
    matchedCustomer: null as CustomerRecord | null, // 匹配到的顾客信息
    matchedCustomerApplied: false, // 是否已应用匹配的顾客信息
    // 报钟时间选择相关
    timePickerModal: {
      show: false,
      currentTime: '' // 当前选择的时间 HH:mm
    },
    hours: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
    minutes: Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')),
    selectedHour: 0,
    selectedMinute: 0,
    licensePlate: '',
    licensePlateInputVisible: false,
    plateNumber: ['', '', '', '', '', '', '', ''],
    // 报钟推送弹窗
    clockInModal: {
      show: false,
      content: '',
      loading: false
    },
    clockInSubmitting: false,
    // 车牌号提醒弹窗
    plateReminderModal: {
      show: false,
      licensePlate: ''
    }
  },
  printContentBuilder: null as PrintContentBuilder | null,
  formHandler: null as FormHandler | null,
  modalHandler: null as ModalHandler | null,
  dataLoader: null as DataLoaderService | null,

  onShow() {
    this.dataLoader?.loadTechnicianList();
  },

  // 页面加载
  async onLoad(options: Record<string, string>) {
    const isLoggedIn = await checkLogin();
    if (!isLoggedIn) return;

    if (!requirePagePermission('index')) return;

    this.formHandler = new FormHandler(this);
    this.dataLoader = new DataLoaderService(this);
    this.modalHandler = new ModalHandler(this, this.dataLoader);
    this.dataLoader.loadTechnicianList();
    this.dataLoader.loadProjects();
    app.getEssentialOils().then((oils) => {
      this.printContentBuilder = new PrintContentBuilder(oils);
    });
    if (options.editId) {
      this.dataLoader.loadEditData(options.editId, ensureConsultationInfoCompatibility);
    } else if (options.reserveIds) {
      this.dataLoader.loadReservationData(options.reserveIds, DefaultConsultationInfo, DefaultGuestInfo);
    } else if (options.reserveId) {
      this.dataLoader.loadReservationData(options.reserveId, DefaultConsultationInfo, DefaultGuestInfo);
    }
  },

  // 切换双人模式
  toggleDualMode() {
    const newMode = !this.data.isDualMode;
    if (newMode) {
      // 启用双人模式时，将当前咨询单信息复制到顾客1
      const { consultationInfo } = this.data;
      this.setData({
        isDualMode: true,
        activeGuest: 1,
        guest1Info: {
          surname: consultationInfo.surname,
          gender: (consultationInfo.gender || 'male') as 'male' | 'female',
          selectedParts: { ...consultationInfo.selectedParts },
          massageStrength: (consultationInfo.massageStrength || 'standard') as 'standard' | 'soft' | 'gravity',
          essentialOil: consultationInfo.essentialOil,
          remarks: consultationInfo.remarks,
          technician: consultationInfo.technician,
          isClockIn: consultationInfo.isClockIn,
          couponCode: consultationInfo.couponCode,
          couponPlatform: consultationInfo.couponPlatform,
          project: consultationInfo.project,
        },
        guest2Info: { ...DefaultGuestInfo, selectedParts: {} },
        matchedCustomer: null,
        matchedCustomerApplied: false
      });
    } else {
      // 关闭双人模式时，将顾客1信息复制回咨询单
      const { guest1Info } = this.data;
      this.setData({
        isDualMode: false,
        activeGuest: 1,
        'consultationInfo.surname': guest1Info.surname,
        'consultationInfo.gender': guest1Info.gender,
        'consultationInfo.selectedParts': { ...guest1Info.selectedParts },
        'consultationInfo.massageStrength': guest1Info.massageStrength,
        'consultationInfo.essentialOil': guest1Info.essentialOil,
        'consultationInfo.remarks': guest1Info.remarks,
        'consultationInfo.technician': guest1Info.technician,
        'consultationInfo.isClockIn': guest1Info.isClockIn,
        'consultationInfo.couponCode': guest1Info.couponCode,
        'consultationInfo.couponPlatform': guest1Info.couponPlatform,
        'consultationInfo.project': guest1Info.project,
        matchedCustomer: null,
        matchedCustomerApplied: false
      });
    }
  },

  // 切换顾客标签
  switchGuest(e: WechatMiniprogram.CustomEvent) {
    const guest = parseInt(e.currentTarget.dataset.guest) as 1 | 2;
    const { guest1Info, guest2Info, projects } = this.data;
    const currentGuestProject = guest === 1 ? guest1Info.project : guest2Info.project;
    const selectedProject = projects.find((p) => p.name === currentGuestProject);
    const isEssentialOilOnly = selectedProject?.isEssentialOilOnly || false;
    const needEssentialOil = selectedProject?.needEssentialOil || false;
    this.setData({ activeGuest: guest, currentProjectIsEssentialOilOnly: isEssentialOilOnly, currentProjectNeedEssentialOil: needEssentialOil });
  },

  // 姓氏输入
  onSurnameInput(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onSurnameInput(e);
  },

  onGenderSelect(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onGenderSelect(e);
  },

  onProjectSelect(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onProjectSelect(e);
  },

  onTechnicianSelect(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onTechnicianSelect(e);
  },

  onClockInSelect() {
    this.formHandler?.onClockInSelect();
  },

  onRemarksInput(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onRemarksInput(e);
  },

  onPhoneInput(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onPhoneInput(e);
  },

  onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onCouponCodeInput(e);
  },

  onCouponPlatformSelect(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onCouponPlatformSelect(e);
  },

  onRoomSelect(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onRoomSelect(e);
  },

  onMassageStrengthSelect(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onMassageStrengthSelect(e);
  },

  onEssentialOilSelect(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onEssentialOilSelect(e);
  },

  onBodyPartSelect(e: WechatMiniprogram.CustomEvent) {
    this.formHandler?.onBodyPartSelect(e);
  },

  // 打印咨询单
  async printConsultation() {
    const { isDualMode, consultationInfo, guest1Info, guest2Info, projects } = this.data;

    const validationResult = validateConsultationForPrint(consultationInfo, this.data.currentProjectIsEssentialOilOnly, this.data.currentProjectNeedEssentialOil, isDualMode, guest1Info, guest2Info);
    if (!showValidationError(validationResult)) {
      return;
    }

    try {
      const printContents: string[] = [];

      if (isDualMode) {
        const guest1Project = projects.find((p) => p.name === guest1Info.project);
        const guest1IsEssentialOilOnly = guest1Project?.isEssentialOilOnly || false;

        const guest2Project = projects.find((p) => p.name === guest2Info.project);
        const guest2IsEssentialOilOnly = guest2Project?.isEssentialOilOnly || false;

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
        printContents.push(await this.printContentBuilder!.buildContent({ info: info1, isEssentialOilOnly: guest1IsEssentialOilOnly, needEssentialOil: guest1Project?.needEssentialOil || true }));

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
        printContents.push(await this.printContentBuilder!.buildContent({ info: info2, isEssentialOilOnly: guest2IsEssentialOilOnly, needEssentialOil: guest2Project?.needEssentialOil || true }));
      } else {
        const { currentProjectIsEssentialOilOnly, currentProjectNeedEssentialOil } = this.data;
        printContents.push(await this.printContentBuilder!.buildContent({ info: consultationInfo, isEssentialOilOnly: currentProjectIsEssentialOilOnly, needEssentialOil: currentProjectNeedEssentialOil }));
      }

      await printerService.printMultiple(printContents);
    } catch (error) {
      wx.showToast({
        title: "打印失败",
        icon: "none",
      });
    }
  },

  // 刷新表单内容
  onRefresh() {
    wx.showModal({
      title: "确认刷新",
      content: "确定要重置咨询单内容吗？",
      success: (res) => {
        if (res.confirm) {
          this.resetForm();
        }
      },
    });
  },

  // 重置表单
  resetForm() {
    this.setData({
      consultationInfo: {
        ...DefaultConsultationInfo,
        selectedParts: {},
      },
      editId: "",
      // 重置双人模式相关数据
      isDualMode: false,
      activeGuest: 1,
      guest1Info: { ...DefaultGuestInfo, selectedParts: {} },
      guest2Info: { ...DefaultGuestInfo, selectedParts: {} },
      // 重置车牌号相关数据
      licensePlate: '',
      plateNumber: ['', '', '', '', '', '', '', ''],
      // 重置顾客匹配相关数据
      matchedCustomer: null,
      matchedCustomerApplied: false,
      // 重置专用精油相关
      currentProjectIsEssentialOilOnly: false,
      currentProjectNeedEssentialOil: false
    });
    wx.showToast({
      title: "咨询单已重置",
      icon: "success",
    });
  },

  // 删除预约（到店报钟后调用）
  async markReservationAsArrived() {
    const { currentReservationIds } = this.data;
    const deletedCount = await ReservationUtils.markReservationAsArrived(currentReservationIds);
    if (deletedCount > 0) {
      this.setData({ currentReservationIds: [] });
    }
  },

  // 重新分配未来的非点钟预约
  async reassignFutureReservations(date: string, currentTime: string) {
    return ReservationUtils.reassignFutureReservations(date, currentTime);
  },

  // 计算加班时长（根据排班和起始时间）
  async calculateOvertime(record: Add<ConsultationRecord>): Promise<number> {
    return ClockInUtils.calculateOvertime(record);
  },

  // 保存咨询单（支持新建和更新）
  async saveConsultation(consultation: Add<ConsultationInfo>, editId?: string) {
    try {

      // 使用传入的consultation中的日期和时间，如果存在的话
      let currentDate: string;
      let startTimeStr: string;
      let endTimeStr: string;

      if (consultation.date && consultation.startTime && consultation.endTime) {
        // 使用已存在的日期和时间
        currentDate = consultation.date;
        startTimeStr = consultation.startTime;

        // 计算结束时间
        const [year, month, day] = currentDate.split('-').map(Number);
        const [hours, minutes] = startTimeStr.split(':').map(Number);
        const startTimeDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
        const endTimeDate = calculateProjectEndTime(startTimeDate, consultation.project);
        endTimeStr = formatTime(endTimeDate, false);
      } else {
        // 使用当前时间
        const now = new Date();
        currentDate = formatDate(now);
        startTimeStr = formatTime(now, false);
        const endTimeDate = calculateProjectEndTime(now, consultation.project);
        endTimeStr = formatTime(endTimeDate, false);
      }

      const recordData: Add<ConsultationRecord> = {
        ...consultation,
        date: currentDate,
        isVoided: false,
        extraTime: 0,
        overtime: 0,
        guasha: false,
        startTime: startTimeStr,
        endTime: endTimeStr,
      };
      const calculatedOvertime = await this.calculateOvertime(recordData);
      recordData.overtime = calculatedOvertime;

      const result = await cloudDb.saveConsultation(recordData, editId);

      if (!result) {
        return false;
      }

      if (!editId) {
        await this.markReservationAsArrived();

        // 更新轮牌系统
        if (consultation.technician) {
          try {
            const staffList = await app.getActiveStaffs();
            const staff = staffList.find(s => s.name === consultation.technician);
            if (staff) {
              await app.serveCustomer(
                currentDate,
                staff._id,
                consultation.isClockIn || false
              );

              await app.loadGlobalData();
            }
          } catch (error) {
            console.warn('[轮牌] 服务顾客更新轮牌失败:', error);
          }
        }

        // 重新分配未来的非点钟预约
        try {
          await this.reassignFutureReservations(currentDate, startTimeStr);
        } catch (error) {
          console.error('重新分配预约失败:', error);
        }
      } else {
        // 编辑模式下也需要重新分配未来的非点钟预约
        try {
          await this.reassignFutureReservations(currentDate, startTimeStr);
        } catch (error) {
          console.error('重新分配预约失败:', error);
        }
      }

      // 如果顾客有手机号，则自动新增/更新顾客信息
      if (consultation.phone && consultation.phone.trim()) {
        await this.saveCustomerInfo(consultation);
      }

      return true;

    } catch (error) {
      this.setData({ loading: false });
      return false;
    }
  },

  // 保存顾客信息到customers集合
  async saveCustomerInfo(consultation: Add<ConsultationInfo>) {
    const consultationWithPlate = {
      ...consultation,
      licensePlate: this.data.licensePlate || ''
    };
    return ReservationUtils.saveCustomerInfo(consultationWithPlate);
  },

  // 跳转到历史页面
  goToHistory() {
    wx.navigateTo({
      url: "/pages/history/history",
    });
  },

  // 跳转到门店配置页面
  goToStoreConfig() {
    wx.navigateTo({
      url: "/pages/store-config/store-config",
    });
  },

  // 保存编辑（不复制报钟信息）
  async saveEdit() {
    const { consultationInfo, editId } = this.data;

    if (!consultationInfo.gender) {
      wx.showToast({ title: "请选择称呼", icon: "none" });
      return;
    }
    if (!consultationInfo.project) {
      wx.showToast({ title: "请选择项目", icon: "none" });
      return;
    }
    if (!consultationInfo.technician) {
      wx.showToast({ title: "请选择技师", icon: "none" });
      return;
    }
    if (!consultationInfo.room) {
      wx.showToast({ title: "请选择房间", icon: "none" });
      return;
    }

    const success = await this.saveConsultation(consultationInfo, editId);

    if (success) {
      wx.showToast({
        title: "保存成功",
        icon: "success",
        success: () => {
          // 延迟返回，让用户看到提示
          setTimeout(() => {
            wx.navigateBack();
          }, 1000);
        }
      });
    } else {
      wx.showToast({
        title: "保存失败",
        icon: "error"
      });
    }
  },

  // 时间选择器确认
  onTimePickerConfirm() {
    this.modalHandler?.onTimePickerConfirm();
  },

  // 取消编辑
  cancelEdit() {
    wx.navigateBack();
  },

  // 搜索匹配顾客
  async searchCustomer() {
    const { consultationInfo, isDualMode, activeGuest, guest1Info, guest2Info } = this.data;

    const matchedCustomer = await CustomerUtils.searchCustomer(
      consultationInfo,
      isDualMode,
      activeGuest,
      guest1Info,
      guest2Info
    );

    this.setData({
      matchedCustomer,
      matchedCustomerApplied: false
    });
  },

  // 应用匹配的顾客信息
  applyMatchedCustomer() {
    const { matchedCustomer, isDualMode, activeGuest } = this.data;

    if (!matchedCustomer) return;

    const updates = CustomerUtils.buildCustomerUpdates(matchedCustomer, isDualMode, activeGuest);
    this.setData(updates);

    wx.showToast({
      title: '已应用顾客信息',
      icon: 'success'
    });
  },

  clearMatchedCustomer() {
    this.setData({
      matchedCustomer: null,
      matchedCustomerApplied: false
    });
  },

  // 报钟功能
  async onClockIn() {
    const { consultationInfo, isDualMode, guest1Info, guest2Info } = this.data;

    const validationResult = validateConsultationForPrint(consultationInfo, this.data.currentProjectIsEssentialOilOnly, this.data.currentProjectNeedEssentialOil, isDualMode, guest1Info, guest2Info);
    if (!showValidationError(validationResult)) {
      return;
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    this.setData({
      timePickerModal: {
        show: true,
        currentTime: currentTime
      },
      selectedHour: now.getHours(),
      selectedMinute: now.getMinutes()
    });
  },

  onTimePickerCancel() {
    this.modalHandler?.onTimePickerCancel();
  },

  onTimePickerChange(e: WechatMiniprogram.CustomEvent) {
    this.modalHandler?.onTimePickerChange(e);
  },

  onTimeColumnChange(e: WechatMiniprogram.CustomEvent) {
    this.modalHandler?.onTimeColumnChange(e);
  },

  // 双人模式报钟
  async doDualClockIn(startTimeDate?: Date, editId?: string) {
    const { consultationInfo, guest1Info, guest2Info } = this.data;

    const { info1, info2 } = ClockInUtils.buildDualClockInInfo(
      consultationInfo,
      guest1Info,
      guest2Info,
      startTimeDate,
      editId
    );

    // 顺序执行保存，避免并发更新轮牌导致数据不一致
    const success1 = await this.saveConsultation(info1, editId);
    if (!success1) {
      wx.showToast({ title: '保存顾客1失败', icon: 'error' });
      return;
    }

    const success2 = await this.saveConsultation(info2, editId);
    if (!success2) {
      wx.showToast({ title: '保存顾客2失败', icon: 'error' });
      return;
    }

    const [clockInInfo1, clockInInfo2] = await Promise.all([
      ClockInUtils.formatClockInInfo(info1, this.data.editId, false),
      ClockInUtils.formatClockInInfo(info2, this.data.editId, false)
    ]);
    const combinedInfo = `【顾客1】
${clockInInfo1}

【顾客2】
${clockInInfo2}`;

    this.setData({
      'clockInModal.show': true,
      'clockInModal.content': combinedInfo,
      clockInSubmitting: true
    });
    await this.dataLoader?.loadTechnicianList();
  },

  showPlateInputModal() {
    this.modalHandler?.showPlateInputModal();
  },

  hidePlateInputModal() {
    this.modalHandler?.hidePlateInputModal();
  },

  onPlateConfirm(e: WechatMiniprogram.CustomEvent) {
    this.modalHandler?.onPlateConfirm(e);
  },

  onClockInModalCancel() {
    this.modalHandler?.onClockInModalCancel();
  },

  onClockInContentInput(e: WechatMiniprogram.CustomEvent) {
    this.modalHandler?.onClockInContentInput(e);
  },

  async onClockInModalConfirm() {
    this.modalHandler?.onClockInModalConfirm();
  },

  // 发送到企业微信机器人
  async sendToWechatWebhook(content: string): Promise<boolean> {

    try {
      const res = await wx.cloud.callFunction({
        name: 'sendWechatMessage',
        data: {
          content: content
        }
      });

      if (res.result && typeof res.result === 'object') {
        const result = res.result as { code: number; message?: string };
        return result.code === 0;
      }

      return false;
    } catch (error) {
      return false;
    }
  },
  onPlateReminderConfirm() {
    this.setData({
      'plateReminderModal.show': false,
      'plateReminderModal.licensePlate': ''
    });
    this.resetForm();
  }
});
