import { PrintContentBuilder } from "../../services/print-content-builder";
import { ReservationService } from "../../services/reservation.service";
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
  room: "",
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
    massageStrength: data.massageStrength || "standard",
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
    // 多人模式相关
    guestCount: 1,  // 顾客人数（1=单人模式）
    activeGuest: 1 as number, // 当前激活的顾客
    guestInfos: [{ ...DefaultGuestInfo, selectedParts: {} }] as GuestInfo[], // 每位顾客独立信息
    // 顾客匹配相关
    matchedCustomer: null as CustomerRecord | null, // 匹配到的顾客信息
    matchedCustomerApplied: false, // 是否已应用匹配的顾客信息
    // 报钟时间选择相关
    timePickerModal: {
      show: false,
      currentTime: '', // 当前选择的时间 HH:mm
      currentDate: ''  // 当前选择的日期 YYYY-MM-DD
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
    // 表单提交状态锁
    submitting: false,
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

  // 添加顾客
  addGuest() {
    const { guestCount, guestInfos, consultationInfo } = this.data;
    if (guestCount === 1) {
      // 从单人模式切换：将当前咨询单信息复制到顾客1
      const guest1: GuestInfo = {
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
        room: consultationInfo.room,
      };
      const newGuestInfos = [guest1, { ...DefaultGuestInfo, selectedParts: {} }];
      this.setData({
        guestCount: 2,
        activeGuest: 1,
        guestInfos: newGuestInfos,
        matchedCustomer: null,
        matchedCustomerApplied: false
      });
    } else {
      // 继续添加新顾客
      const newGuestInfos = [...guestInfos, { ...DefaultGuestInfo, selectedParts: {} }];
      this.setData({
        guestCount: guestCount + 1,
        activeGuest: guestCount + 1,
        guestInfos: newGuestInfos,
        matchedCustomer: null,
        matchedCustomerApplied: false
      });
    }
  },

  // 移除顾客
  removeGuest() {
    const { guestCount, guestInfos, activeGuest } = this.data;
    if (guestCount <= 1) return;
    if (guestCount === 2) {
      // 回到单人模式：将顾客1信息复制回咨询单
      const guest1 = guestInfos[0];
      this.setData({
        guestCount: 1,
        activeGuest: 1,
        guestInfos: [{ ...DefaultGuestInfo, selectedParts: {} }],
        'consultationInfo.surname': guest1.surname,
        'consultationInfo.gender': guest1.gender,
        'consultationInfo.selectedParts': { ...guest1.selectedParts },
        'consultationInfo.massageStrength': guest1.massageStrength,
        'consultationInfo.essentialOil': guest1.essentialOil,
        'consultationInfo.remarks': guest1.remarks,
        'consultationInfo.technician': guest1.technician,
        'consultationInfo.isClockIn': guest1.isClockIn,
        'consultationInfo.couponCode': guest1.couponCode,
        'consultationInfo.couponPlatform': guest1.couponPlatform,
        'consultationInfo.project': guest1.project,
        'consultationInfo.room': guest1.room,
        matchedCustomer: null,
        matchedCustomerApplied: false
      });
    } else {
      // 移除最后一位顾客
      const newGuestInfos = guestInfos.slice(0, guestCount - 1);
      const newActive = Math.min(activeGuest, guestCount - 1);
      this.setData({
        guestCount: guestCount - 1,
        activeGuest: newActive,
        guestInfos: newGuestInfos,
        matchedCustomer: null,
        matchedCustomerApplied: false
      });
    }
  },

  // 切换顾客标签
  switchGuest(e: WechatMiniprogram.CustomEvent) {
    const guest = parseInt(e.currentTarget.dataset.guest);
    const { guestInfos, projects } = this.data;
    const currentGuestInfo = guestInfos[guest - 1];
    const currentGuestProject = currentGuestInfo?.project || '';
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
    const { guestCount, guestInfos, consultationInfo, projects } = this.data;

    const validationResult = validateConsultationForPrint(consultationInfo, this.data.currentProjectIsEssentialOilOnly, this.data.currentProjectNeedEssentialOil, guestCount, guestInfos);
    if (!showValidationError(validationResult)) {
      return;
    }

    try {
      const printContents: string[] = [];

      if (guestCount > 1) {
        for (const guestInfo of guestInfos) {
          const guestProject = projects.find((p) => p.name === guestInfo.project);
          const isEssentialOilOnly = guestProject?.isEssentialOilOnly || false;
          const needEssentialOil = guestProject?.needEssentialOil || false;

          const info: Add<ConsultationInfo> = {
            ...consultationInfo,
            surname: guestInfo.surname,
            gender: guestInfo.gender,
            project: guestInfo.project,
            selectedParts: guestInfo.selectedParts,
            massageStrength: guestInfo.massageStrength,
            essentialOil: guestInfo.essentialOil,
            remarks: guestInfo.remarks,
            technician: guestInfo.technician,
            isClockIn: guestInfo.isClockIn,
            couponCode: guestInfo.couponCode,
            couponPlatform: guestInfo.couponPlatform,
            room: guestInfo.room,
          };
          printContents.push(await this.printContentBuilder!.buildContent({ info, isEssentialOilOnly, needEssentialOil }));
        }
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
      // 重置多人模式相关数据
      guestCount: 1,
      activeGuest: 1,
      guestInfos: [{ ...DefaultGuestInfo, selectedParts: {} }],
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
      // 检查提交锁，防止重复提交
      if (this.data.submitting && !editId) {
        wx.showToast({
          title: '正在提交中，请勿重复点击',
          icon: 'none'
        });
        return false;
      }

      // 设置提交锁
      if (!editId) {
        this.setData({ submitting: true });
      }

      // 使用传入的 consultation 中的日期和时间，如果存在的话
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

      // 检查重复记录（仅新建时检查）
      if (!editId) {
        const isDuplicate = await this.checkDuplicateRecord(
          currentDate,
          startTimeStr,
          consultation.technician,
          consultation.project
        );
        if (isDuplicate) {
          this.setData({ submitting: false });
          wx.showToast({
            title: '该技师在同一时间已有相同项目的记录，请勿重复报钟',
            icon: 'none'
          });
          return false;
        }
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

        // 报钟后触发重排，确保预约分配及时更新
        try {
          await this.triggerRearrange(currentDate);
        } catch (error) {
          console.error('重排失败:', error);
        }
      } else {
        // 编辑模式下也触发重排
        try {
          await this.triggerRearrange(currentDate);
        } catch (error) {
          console.error('重排失败:', error);
        }
      }

      // 如果顾客有手机号，则自动新增/更新顾客信息
      if (consultation.phone && consultation.phone.trim()) {
        await this.saveCustomerInfo(consultation);
      }

      return true;

    } catch (error: any) {
      this.setData({ loading: false, submitting: false });
      const errorMessage = error?.message || '保存失败';
      wx.showToast({
        title: errorMessage,
        icon: 'none'
      });
      return false;
    } finally {
      // 释放提交锁
      if (!editId) {
        this.setData({ submitting: false });
      }
    }
  },

  // 检查重复记录
  async checkDuplicateRecord(
    date: string,
    startTime: string,
    technician: string,
    project: string
  ): Promise<boolean> {
    try {
      const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(date);
      
      return records.some(record => 
        !record.isVoided &&
        record.technician === technician &&
        record.startTime === startTime &&
        record.project === project
      );
    } catch (error) {
      console.error('检查重复记录失败:', error);
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
    const { consultationInfo, guestCount, activeGuest, guestInfos } = this.data;

    const matchedCustomer = await CustomerUtils.searchCustomer(
      consultationInfo,
      guestCount,
      activeGuest,
      guestInfos
    );

    this.setData({
      matchedCustomer,
      matchedCustomerApplied: false
    });
  },

  // 应用匹配的顾客信息
  applyMatchedCustomer() {
    const { matchedCustomer, guestCount, activeGuest } = this.data;

    if (!matchedCustomer) return;

    const updates = CustomerUtils.buildCustomerUpdates(matchedCustomer, guestCount, activeGuest);
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
    const { consultationInfo, guestCount, guestInfos, editId } = this.data;

    const validationResult = validateConsultationForPrint(consultationInfo, this.data.currentProjectIsEssentialOilOnly, this.data.currentProjectNeedEssentialOil, guestCount, guestInfos);
    if (!showValidationError(validationResult)) {
      return;
    }

    // 编辑模式以单据报钟时间为默认值，否则以当前时间
    let defaultTime: string;
    let defaultDate: string;
    let defaultHour: number;
    let defaultMinute: number;

    if (editId && consultationInfo.startTime && consultationInfo.date) {
      const [h, m] = consultationInfo.startTime.split(':').map(Number);
      defaultTime = consultationInfo.startTime;
      defaultDate = consultationInfo.date;
      defaultHour = h;
      defaultMinute = m;
    } else {
      const now = new Date();
      defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      defaultDate = consultationInfo.date || formatDate(now);
      defaultHour = now.getHours();
      defaultMinute = now.getMinutes();
    }

    this.setData({
      timePickerModal: {
        show: true,
        currentTime: defaultTime,
        currentDate: defaultDate
      },
      selectedHour: defaultHour,
      selectedMinute: defaultMinute
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

  onDatePickerChange(e: WechatMiniprogram.CustomEvent) {
    this.modalHandler?.onDatePickerChange(e);
  },

  // 多人模式报钟
  async doMultiClockIn(startTimeDate?: Date, editId?: string) {
    const { consultationInfo, guestInfos } = this.data;

    const { infos } = ClockInUtils.buildMultiClockInInfo(
      consultationInfo,
      guestInfos,
      startTimeDate,
      editId
    );

    // 顺序执行保存，避免并发更新轮牌导致数据不一致
    for (let i = 0; i < infos.length; i++) {
      const success = await this.saveConsultation(infos[i], editId);
      if (!success) {
        wx.showToast({ title: `保存顾客${i + 1}失败`, icon: 'error' });
        return;
      }
    }

    await this.dataLoader?.loadTechnicianList();
    await this.triggerRearrange(infos[0].date);
    
    const { licensePlate } = this.data;
    // 如果是新增且有车牌号，显示车牌号录入提醒
    if (!editId && licensePlate && licensePlate.trim()) {
      this.setData({
        'plateReminderModal.show': true,
        'plateReminderModal.licensePlate': licensePlate
      });
    } else {
      wx.showToast({ title: '报钟成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    }
  },

  showPlateInputModal() {
    this.modalHandler?.showPlateInputModal();
  },

  hidePlateInputModal() {
    this.modalHandler?.hidePlateInputModal();
  },

  async triggerRearrange(date: string): Promise<void> {
    return ReservationService.triggerRearrange(date);
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
