import { cloudDb, Collections } from "../../utils/cloud-db";
import { checkLogin } from "../../utils/auth";
import { requirePagePermission } from "../../utils/permission";
import { SPARE_TIME, calculateProjectEndTime, formatDate, formatTime, parseProjectDuration, SHIFT_END_TIMES, SHIFT_START_TIMES } from "../../utils/util";
import { showValidationError, validateConsultationForPrint } from "../../utils/validators";
import { printerService } from "../../services/printer-service";
import { PrintContentBuilder } from "../../services/print-content-builder";

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
  upgradeHimalayanSaltStone: false,
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
  upgradeHimalayanSaltStone: false,
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
    upgradeHimalayanSaltStone: data.upgradeHimalayanSaltStone || false,
    date: data.date || formatDate(new Date()),
    startTime: data.startTime || "",
    endTime: data.endTime || "",
  };
}

type GuestContext = {
  isDualMode: boolean;
  activeGuest: 1 | 2;
  guest1Info: GuestInfo;
  guest2Info: GuestInfo;
  consultationInfo: Add<ConsultationInfo>;
};


function updateGuestField(context: GuestContext, fieldName: string, value: any) {
  if (context.isDualMode) {
    const guestKey = context.activeGuest === 1 ? 'guest1Info' : 'guest2Info';
    return {
      [`${guestKey}.${fieldName}`]: value
    };
  }
  return {
    [`consultationInfo.${fieldName}`]: value
  };
}

function toggleGuestBooleanField(context: GuestContext, fieldName: keyof GuestInfo) {
  const currentValue = getGuestFieldValue(context, fieldName);
  return updateGuestField(context, fieldName, !currentValue);
}

function getGuestFieldValue(context: GuestContext, fieldName: keyof GuestInfo) {
  if (context.isDualMode) {
    const guestInfo = context.activeGuest === 1 ? context.guest1Info : context.guest2Info;
    return (guestInfo)[fieldName];
  }
  return (context.consultationInfo)[fieldName];
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
    clockInSubmitting: false
  },
  printContentBuilder: null as PrintContentBuilder | null,

  onShow() {
    this.loadTechnicianList();
  },

  // 页面加载
  async onLoad(options: Record<string, string>) {
    const isLoggedIn = await checkLogin();
    if (!isLoggedIn) return;

    if (!requirePagePermission('index')) return;
    this.loadProjects();
    app.getEssentialOils().then((oils) => {
      this.printContentBuilder = new PrintContentBuilder(oils);
    });
    if (options.editId) {
      this.loadEditData(options.editId);
    } else if (options.reserveIds) {
      this.loadReservationData(options.reserveIds);
    } else if (options.reserveId) {
      this.loadReservationData(options.reserveId);
    }
  },

  // 加载并检查技师可用性
  async loadTechnicianList() {
    try {
      const { editId, consultationInfo } = this.data;

      // 使用单据日期或当前日期
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

      this.setData({ loadingTechnicians: true });

      const projectDuration = parseProjectDuration(this.data.consultationInfo.project) || 60;

      const res = await wx.cloud.callFunction({
        name: 'getAvailableTechnicians',
        data: {
          date: targetDate,
          currentTime: currentTimeStr,
          projectDuration: projectDuration,
          currentReservationIds: this.data.currentReservationIds,
          currentConsultationId: this.data.editId || undefined
        }
      });
      if (!res.result || typeof res.result !== 'object') {
        throw new Error('获取技师列表失败');
      }
      if (res.result.code === 0) {
        const list = res.result.data as StaffAvailability[];
        this.setData({ technicianList: list, loadingTechnicians: false });
      } else {
        wx.showToast({
          title: res.result.message || '加载技师列表失败',
          icon: 'none'
        });
        this.setData({ loadingTechnicians: false });
      }
    } catch (error) {
      console.error('加载技师列表失败:', error);
      this.setData({ loadingTechnicians: false });
      wx.showToast({
        title: '加载技师列表失败',
        icon: 'none'
      });
    }
  },

  async loadProjects() {
    try {
      const app = getApp<IAppOption>();
      const allProjects = await app.getProjects();
      this.setData({ projects: allProjects });
    } catch (error) {
      console.error('加载项目失败:', error);
      this.setData({ projects: [] });
    }
  },

  // 页面加载时获取参数

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
          upgradeHimalayanSaltStone: consultationInfo.upgradeHimalayanSaltStone,
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
        'consultationInfo.upgradeHimalayanSaltStone': guest1Info.upgradeHimalayanSaltStone,
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
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.surname' : 'guest2Info.surname';
      this.setData({ [key]: e.detail.value });
    } else {
      this.setData({ "consultationInfo.surname": e.detail.value });
    }
    // 触发顾客匹配
    this.searchCustomer();
  },

  // 性别选择
  onGenderSelect(e: WechatMiniprogram.CustomEvent) {
    const gender = e.detail.value;
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.gender' : 'guest2Info.gender';
      this.setData({ [key]: gender });
    } else {
      this.setData({ "consultationInfo.gender": gender });
    }
    // 触发顾客匹配
    this.searchCustomer();
  },

  // 项目选择
  onProjectSelect(e: WechatMiniprogram.CustomEvent) {
    const project = e.detail.project || e.currentTarget.dataset.project;
    const { isDualMode, activeGuest, projects } = this.data;

    const selectedProject = projects.find((p) => p.name === project);
    const isEssentialOilOnly = selectedProject?.isEssentialOilOnly || false;

    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.project' : 'guest2Info.project';
      this.setData({ [key]: project, currentProjectIsEssentialOilOnly: isEssentialOilOnly, currentProjectNeedEssentialOil: selectedProject?.needEssentialOil || false });
    } else {
      this.setData({ "consultationInfo.project": project, currentProjectIsEssentialOilOnly: isEssentialOilOnly, currentProjectNeedEssentialOil: selectedProject?.needEssentialOil || false });
    }
    this.loadTechnicianList(); // 项目变更可能影响可用性（时长不同）
  },

  // 技师选择
  onTechnicianSelect(e: WechatMiniprogram.CustomEvent) {
    const { technician, occupied, reason } = e.detail.technician ? e.detail : e.currentTarget.dataset;
    if (occupied) {
      wx.showToast({ title: reason || '该技师当前时段已有安排', icon: 'none', duration: 2500 });
      return;
    }
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.technician' : 'guest2Info.technician';
      this.setData({ [key]: technician });
    } else {
      this.setData({ "consultationInfo.technician": technician });
    }
  },

  // 点钟选择
  onClockInSelect() {
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const currentInfo = activeGuest === 1 ? this.data.guest1Info : this.data.guest2Info;
      const key = activeGuest === 1 ? 'guest1Info.isClockIn' : 'guest2Info.isClockIn';
      this.setData({ [key]: !currentInfo.isClockIn });
    } else {
      this.setData({ "consultationInfo.isClockIn": !this.data.consultationInfo.isClockIn });
    }
  },

  // 备注输入
  onRemarksInput(e: WechatMiniprogram.CustomEvent) {
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.remarks' : 'guest2Info.remarks';
      this.setData({ [key]: e.detail.value });
    } else {
      this.setData({ "consultationInfo.remarks": e.detail.value });
    }
  },

  // 手机号输入
  onPhoneInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({
      "consultationInfo.phone": e.detail.value,
    });
    // 触发顾客匹配
    this.searchCustomer();
  },

  // 券码输入
  onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.couponCode' : 'guest2Info.couponCode';
      this.setData({ [key]: e.detail.value });
    } else {
      this.setData({ "consultationInfo.couponCode": e.detail.value });
    }
  },

  // 券码平台选择
  onCouponPlatformSelect(e: WechatMiniprogram.CustomEvent) {
    const platform = e.detail.value;
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const currentInfo = activeGuest === 1 ? this.data.guest1Info : this.data.guest2Info;
      const key = activeGuest === 1 ? 'guest1Info.couponPlatform' : 'guest2Info.couponPlatform';
      this.setData({ [key]: currentInfo.couponPlatform === platform ? '' : platform });
    } else {
      const currentPlatform = this.data.consultationInfo.couponPlatform;
      this.setData({ "consultationInfo.couponPlatform": currentPlatform === platform ? '' : platform });
    }
  },

  // 房间选择
  onRoomSelect(e: WechatMiniprogram.CustomEvent) {
    const room = e.detail.room || e.currentTarget.dataset.room;
    this.setData({
      "consultationInfo.room": room,
    });
  },

  // 按摩力度选择
  onMassageStrengthSelect(e: WechatMiniprogram.CustomEvent) {
    const strength = e.detail.strength || e.currentTarget.dataset.strength;
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.massageStrength' : 'guest2Info.massageStrength';
      this.setData({ [key]: strength });
    } else {
      this.setData({ "consultationInfo.massageStrength": strength });
    }
  },

  // 精油选择（单选）
  onEssentialOilSelect(e: WechatMiniprogram.CustomEvent) {
    const oil = e.detail.oil || e.currentTarget.dataset.oil;
    const { isDualMode, activeGuest } = this.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.essentialOil' : 'guest2Info.essentialOil';
      this.setData({ [key]: oil });
    } else {
      this.setData({ "consultationInfo.essentialOil": oil });
    }
  },

  // 升级选项选择
  onUpgradeSelect() {
    const context: GuestContext = {
      isDualMode: this.data.isDualMode,
      activeGuest: this.data.activeGuest,
      guest1Info: this.data.guest1Info,
      guest2Info: this.data.guest2Info,
      consultationInfo: this.data.consultationInfo
    };
    this.setData(toggleGuestBooleanField(context, 'upgradeHimalayanSaltStone'));
  },

  // 加强部位选择（使用字段map控制）
  onBodyPartSelect(e: WechatMiniprogram.CustomEvent) {
    const part = e.detail.part || e.currentTarget.dataset.part;
    const { isDualMode, activeGuest } = this.data;

    if (isDualMode) {
      const infoKey = activeGuest === 1 ? 'guest1Info' : 'guest2Info';
      const currentInfo = activeGuest === 1 ? this.data.guest1Info : this.data.guest2Info;
      const selectedParts = { ...currentInfo.selectedParts };
      selectedParts[part] = !selectedParts[part];
      this.setData({ [`${infoKey}.selectedParts`]: selectedParts });
    } else {
      const selectedParts: Record<string, boolean> = {
        ...this.data.consultationInfo.selectedParts,
      };
      selectedParts[part] = !selectedParts[part];
      const updatedInfo = {
        ...this.data.consultationInfo,
        selectedParts: selectedParts,
      };
      this.setData({ consultationInfo: updatedInfo });
    }
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
      console.error("打印失败:", error);
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
  async deleteReservations() {
    const { currentReservationIds } = this.data;
    if (!currentReservationIds || currentReservationIds.length === 0) {
      return;
    }

    try {
      let deletedCount = 0;
      for (const reserveId of currentReservationIds) {
        const success = await cloudDb.deleteById(Collections.RESERVATIONS, reserveId);
        if (success) {
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        // 清空当前预约ID列表
        this.setData({ currentReservationIds: [] });
      }
    } catch (error) {
      console.error("删除预约失败:", error);
    }
  },

  // 计算加班时长（根据排班和起始时间）
  async calculateOvertime(record: Add<ConsultationRecord>): Promise<number> {
    try {
      // 获取技师信息以匹配 staffId
      const staff = await app.getActiveStaffs().then(staffs => staffs.find(s => s.name === record.technician));

      if (!staff) {
        return 0; // 未找到技师或排班不匹配
      }
      // 获取当日排班
      const schedules = await cloudDb.find<ScheduleRecord>(Collections.SCHEDULE, {
        date: record.date,
      });
      const schedule = schedules.find(s => s.staffId === staff._id);
      if (!schedule) {
        console.log('未找到排班');
        return 0; // 没有排班，不计算加班
      }
      console.log('排班:', schedule.shift);


      const { startTime, endTime } = record;
      const shiftStartTime = SHIFT_START_TIMES[schedule.shift], shiftEndTime = SHIFT_END_TIMES[schedule.shift];
      if (!startTime || !endTime || !shiftStartTime || !shiftEndTime) return 0;
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const [shiftStartHour] = shiftStartTime.split(":").map(Number);
      const [shiftEndHour] = shiftEndTime.split(":").map(Number);
      let totalOvertimeMins = 0;
      if (startHour <= endHour) {
        console.log('当天内加班');
        if (endHour < 6) {
          // 凌晨加班，使用结束时间计算加班
          console.log('凌晨加班');
          totalOvertimeMins += endHour * 60 + endMin;
        } else if (startHour < shiftStartHour) {
          // 上班前加班，使用开始时间计算加班
          console.log('上班前加班');
          totalOvertimeMins += (shiftStartHour - startHour) * 60 - startMin;
        } else if (endHour >= shiftEndHour) {
          // 下班后加班，使用结束时间计算加班
          console.log('下班后加班');
          totalOvertimeMins += (endHour - shiftEndHour) * 60 + endMin;
        } else {
          console.log('正常上班');
        }
      } else {
        // 跨天加班，使用结束时间计算加班
        console.log('跨天加班');
        totalOvertimeMins += (24 - shiftEndHour + endHour) * 60 + endMin;
      }
      // 加班时长必须是30分钟的倍数
      console.log('加班分钟数:', totalOvertimeMins);
      return Math.floor(totalOvertimeMins / 30);
    } catch (error) {
      console.error('计算加班时长失败:', error);
      return 0;
    }
  },

  // 保存咨询单（支持新建和更新）
  async saveConsultation(consultation: Add<ConsultationInfo>, editId?: string) {
    try {
      this.setData({ loading: true });

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
        startTime: startTimeStr,
        endTime: endTimeStr,
      };
      const calculatedOvertime = await this.calculateOvertime(recordData);
      recordData.overtime = calculatedOvertime;

      const result = await cloudDb.saveConsultation(recordData, editId);
      this.setData({ loading: false });

      if (!result) {
        console.error("保存咨询单失败");
        return false;
      }

      if (!editId) {
        await this.deleteReservations();

        // 更新员工权重（非点钟）
        if (!consultation.isClockIn && consultation.technician) {
          try {
            const staffList = await app.getActiveStaffs();
            const staff = staffList.find(s => s.name === consultation.technician);
            if (staff) {
              await wx.cloud.callFunction({
                name: 'updateStaffWeight',
                data: {
                  action: 'consultation',
                  staffId: staff._id,
                  isClockIn: consultation.isClockIn || false
                }
              });
              // 刷新全局数据中的员工信息
              await app.loadGlobalData();

            }
          } catch (error) {
            console.error('更新员工权重失败:', error);
          }
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
    try {
      const phone = consultation.phone.trim();
      if (!phone) return;

      // 检查是否已存在该手机号的顾客
      const existingCustomers = await cloudDb.find<CustomerRecord>(Collections.CUSTOMERS, { phone });

      const customerData: Update<CustomerRecord> = {
        phone: phone,
        name: consultation.surname + (consultation.gender === 'male' ? '先生' : '女士'),
        gender: consultation.gender || '',
        responsibleTechnician: consultation.technician || '',
        licensePlate: this.data.licensePlate || '',
        remarks: consultation.remarks || '',
      };

      if (existingCustomers && existingCustomers.length > 0) {
        // 更新已有顾客信息
        const existingCustomer = existingCustomers[0];
        await cloudDb.updateById<CustomerRecord>(Collections.CUSTOMERS, existingCustomer._id, customerData);
      } else {
        // 新增顾客
        const newCustomer: Add<CustomerRecord> = {
          ...customerData,
        };
        await cloudDb.insert<CustomerRecord>(Collections.CUSTOMERS, newCustomer);
      }
    } catch (error) {
      console.error('保存顾客信息失败:', error);
    }
  },

  // 加载编辑数据
  async loadEditData(editId: string) {
    try {
      const foundRecord = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, editId) as ConsultationRecord | null;
      if (foundRecord) {
        const selectedProject = this.data.projects.find((p) => p.name === foundRecord.project);
        const isEssentialOilOnly = selectedProject?.isEssentialOilOnly || false;

        const updateData: any = {
          consultationInfo: ensureConsultationInfoCompatibility(foundRecord, this.data.projects),
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
          plateChars.forEach((char, index) => {
            if (index < maxPlateLength) {
              plateNumber[index] = char;
            }
          });
          updateData.plateNumber = plateNumber;
        }

        this.setData(updateData);
        this.loadTechnicianList();
      } else {
        console.error("未找到要编辑的记录:", editId);
        wx.showToast({
          title: "编辑记录不存在",
          icon: "error",
        });
      }
    } catch (error) {
      console.error("加载编辑数据失败:", error);
      wx.showToast({
        title: "加载失败",
        icon: "error",
      });
    }
  },

  // 加载预约数据
  async loadReservationData(reserveIdOrIds: string) {
    try {
      const reserveIds = reserveIdOrIds.includes(',') ? reserveIdOrIds.split(',') : [reserveIdOrIds];
      const records = await Promise.all(
        reserveIds.map(_id => cloudDb.findById<ReservationRecord>(Collections.RESERVATIONS, _id))
      );
      const validRecords = records.filter(r => r !== null) as ReservationRecord[];

      if (validRecords.length > 0) {
        const firstRecord = validRecords[0];
        const selectedProject = this.data.projects.find((p) => p.name === firstRecord.project);
        const isEssentialOilOnly = selectedProject?.isEssentialOilOnly || false;
        const isClockInValue = firstRecord.isClockIn || false;

        if (validRecords.length > 1) {
          const secondIsClockIn = validRecords[1].isClockIn || false;
          this.setData({
            isDualMode: true,
            activeGuest: 1 as 1 | 2,
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
          this.setData({
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
      } else {
        console.error("未找到要加载的预约:", reserveIdOrIds);
      }
    } catch (error) {
      console.error("加载预约数据失败:", error);
    }
  },

  // 跳转到历史页面
  goToHistory() {
    wx.navigateTo({
      url: "/pages/history/history",
    });
  },

  goToCashier() {
    wx.navigateTo({
      url: "/pages/cashier/cashier",
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
  async onTimePickerConfirm() {
    const { timePickerModal, consultationInfo, editId, isDualMode, licensePlate } = this.data;
    const { currentTime: selectedTime } = timePickerModal;

    this.setData({ 'timePickerModal.show': false });

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

    this.setData({ loading: true, loadingText: '报钟中...' });
    try {
      if (isDualMode) {
        await this.doDualClockIn(startTimeDate, editId);
      } else {
        const projectDuration = parseProjectDuration(consultationInfo.project) || 60;
        const extraTime = consultationInfo.extraTime || 0;
        const totalDuration = projectDuration + extraTime + SPARE_TIME;
        const endTimeDate = new Date(startTimeDate.getTime() + totalDuration * 60 * 1000);
        const endTime = formatTime(endTimeDate, false);
        const updatedInfo = {
          ...consultationInfo, startTime: selectedTime, licensePlate: licensePlate || '', isNewEnergyVehicle: licensePlate?.length === 8 || false,
          date: editId ? consultationInfo.date : formatDate(new Date()),
          endTime,
        };
        const clockInInfo = await this.formatClockInInfo(updatedInfo);
        const success = await this.saveConsultation(updatedInfo, editId);

        if (success) {
          this.setData({
            'clockInModal.show': true,
            'clockInModal.content': clockInInfo,
            clockInSubmitting: true
          });
          this.loadTechnicianList();
        }
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  // 取消编辑
  cancelEdit() {
    wx.navigateBack();
  },

  // 搜索匹配顾客
  async searchCustomer() {
    const { consultationInfo, isDualMode, activeGuest } = this.data;

    // 获取当前顾客信息
    let currentSurname = '';
    let currentGender = '';
    let currentPhone = '';

    if (isDualMode) {
      const guestInfo = activeGuest === 1 ? this.data.guest1Info : this.data.guest2Info;
      currentSurname = guestInfo.surname;
      currentGender = guestInfo.gender;
    } else {
      currentSurname = consultationInfo.surname;
      currentGender = consultationInfo.gender;
    }
    currentPhone = consultationInfo.phone;

    // 如果没有输入任何信息，清除匹配
    if (!currentSurname && !currentPhone) {
      this.setData({
        matchedCustomer: null,
        matchedCustomerApplied: false
      });
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'matchCustomer',
        data: {
          surname: currentSurname,
          gender: currentGender,
          phone: currentPhone
        }
      });
      if (!res.result || typeof res.result !== 'object') {
        throw new Error('匹配顾客失败');
      }
      if (res.result.code === 0 && res.result.data) {
        this.setData({
          matchedCustomer: res.result.data,
          matchedCustomerApplied: false
        });
      } else {
        this.setData({
          matchedCustomer: null,
          matchedCustomerApplied: false
        });
      }
    } catch (error) {
      console.error('匹配顾客失败:', error);
      this.setData({
        matchedCustomer: null,
        matchedCustomerApplied: false
      });
    }
  },

  // 应用匹配的顾客信息
  applyMatchedCustomer() {
    const { matchedCustomer, isDualMode, activeGuest } = this.data;

    if (!matchedCustomer) return;

    // 应用顾客信息到表单
    if (isDualMode) {
      const guestKey = activeGuest === 1 ? 'guest1Info' : 'guest2Info';

      // 更新顾客信息
      const updates: any = {
        [`${guestKey}.surname`]: matchedCustomer.name.replace(/先生|女士/g, ''),
        [`${guestKey}.gender`]: matchedCustomer.name.endsWith('女士') ? 'female' : 'male',
      };

      // 如果有责任技师，应用技师
      if (matchedCustomer.responsibleTechnician) {
        updates[`${guestKey}.technician`] = matchedCustomer.responsibleTechnician;
      }

      // 应用共享字段
      if (matchedCustomer.phone) {
        updates['consultationInfo.phone'] = matchedCustomer.phone;
      }

      // 应用车牌号信息
      if (matchedCustomer.licensePlate) {
        updates['licensePlate'] = matchedCustomer.licensePlate;

        const isNewEnergyVehicle = matchedCustomer.licensePlate.length === 8;
        const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
        const plateNumber = Array(maxPlateLength).fill('');
        const plateChars = matchedCustomer.licensePlate.split('');
        plateChars.forEach((char, index) => {
          if (index < maxPlateLength) {
            plateNumber[index] = char;
          }
        });
        updates['plateNumber'] = plateNumber;
      }

      this.setData({
        ...updates,
        matchedCustomerApplied: true
      });
    } else {
      // 单人模式
      const updates: any = {
        'consultationInfo.surname': matchedCustomer.name.replace(/先生|女士/g, ''),
        'consultationInfo.gender': matchedCustomer.name.endsWith('女士') ? 'female' : 'male',
      };

      if (matchedCustomer.phone) {
        updates['consultationInfo.phone'] = matchedCustomer.phone;
      }

      if (matchedCustomer.responsibleTechnician) {
        updates['consultationInfo.technician'] = matchedCustomer.responsibleTechnician;
      }

      // 应用车牌号信息
      if (matchedCustomer.licensePlate) {
        updates['licensePlate'] = matchedCustomer.licensePlate;

        const isNewEnergyVehicle = matchedCustomer.licensePlate.length === 8;
        const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
        const plateNumber = Array(maxPlateLength).fill('');
        const plateChars = matchedCustomer.licensePlate.split('');
        plateChars.forEach((char, index) => {
          if (index < maxPlateLength) {
            plateNumber[index] = char;
          }
        });
        updates['plateNumber'] = plateNumber;
      }

      this.setData({
        ...updates,
        matchedCustomerApplied: true
      });
    }

    wx.showToast({
      title: '已应用顾客信息',
      icon: 'success'
    });
  },

  // 清除匹配的顾客信息
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

  // 时间选择器取消
  onTimePickerCancel() {
    this.setData({ 'timePickerModal.show': false });
  },

  // 时间选择器变化
  onTimePickerChange(e: WechatMiniprogram.CustomEvent) {
    const { value } = e.detail;
    const now = new Date();
    now.setHours(value[0], value[1], 0, 0);
    const currentTime = `${String(value[0]).padStart(2, '0')}:${String(value[1]).padStart(2, '0')}`;
    this.setData({ 'timePickerModal.currentTime': currentTime });
  },

  // 时间选择器列变化
  onTimeColumnChange(e: WechatMiniprogram.CustomEvent) {
    const { column, value } = e.detail;
    if (column === 0) {
      this.setData({ selectedHour: value });
    } else if (column === 1) {
      this.setData({ selectedMinute: value });
    }
  },

  // 双人模式报钟
  async doDualClockIn(startTimeDate?: Date, editId?: string) {
    const { consultationInfo, guest1Info, guest2Info } = this.data;

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
      upgradeHimalayanSaltStone: guest1Info.upgradeHimalayanSaltStone,
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
      upgradeHimalayanSaltStone: guest2Info.upgradeHimalayanSaltStone,
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

    // 保存两条记录
    const [success1, success2] = await Promise.all([
      this.saveConsultation(info1, editId),
      this.saveConsultation(info2, editId)
    ]);

    if (success1 && success2) {
      const [clockInInfo1, clockInInfo2] = await Promise.all([
        this.formatClockInInfo(info1),
        this.formatClockInInfo(info2)
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
      await this.loadTechnicianList();
    } else {
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  async formatClockInInfo(info: Add<ConsultationInfo>): Promise<string> {
    let dailyCount = 1;

    if (info.date && info.startTime && info.technician) {
      const { editId } = this.data;

      if (editId) {
        const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(info.date) as ConsultationRecord[];

        // 获取当前正在编辑的单据的创建时间
        const currentRecord = records.find(r => r._id === editId);

        if (currentRecord) {
          // 在编辑模式下，计算该技师在此单据之前的记录数量 + 1
          dailyCount = records.filter(
            (record: ConsultationRecord) =>
              record.technician === info.technician &&
              !record.isVoided &&
              new Date(record.createdAt) < new Date(currentRecord.createdAt)
          ).length + 1;
        } else {
          // 如果找不到原单据，按正常逻辑计算
          dailyCount = records.filter(
            (record: ConsultationRecord) => record.technician === info.technician && !record.isVoided
          ).length;
        }
      } else {
        // 新增模式，计算当前记录数 + 1
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
  },

  // 跳转到主页
  goToHome() {
    wx.navigateTo({
      url: "/pages/store-config/store-config",
    });
  },
  onScreensaver() {
    wx.navigateTo({
      url: "/pages/screensaver/screensaver",
    });
  },

  // 显示车牌号输入弹窗
  showPlateInputModal() {
    this.setData({ licensePlateInputVisible: true });
  },

  // 隐藏车牌号输入弹窗
  hidePlateInputModal() {
    this.setData({ licensePlateInputVisible: false });
  },

  // 车牌号确认
  onPlateConfirm(e: WechatMiniprogram.CustomEvent) {
    const { value } = e.detail;
    this.setData({
      licensePlateInputVisible: false,
      licensePlate: value,
      plateNumber: value.split('')
    });
  },

  // 报钟弹窗 - 关闭
  onClockInModalCancel() {
    const { editId } = this.data;

    this.setData({
      'clockInModal.show': false,
      'clockInModal.content': '',
      clockInSubmitting: false
    });

    if (editId) {
      wx.navigateBack();
    } else {
      this.resetForm();
    }
  },

  // 报钟弹窗 - 内容修改
  onClockInContentInput(e: WechatMiniprogram.CustomEvent) {
    const value = e.detail.value;
    this.setData({
      'clockInModal.content': value
    });
  },

  // 报钟弹窗 - 确认推送到企业微信
  async onClockInModalConfirm() {
    const { content } = this.data.clockInModal;
    const { editId } = this.data;

    if (!content || content.trim() === '') {
      wx.showToast({ title: '报钟内容不能为空', icon: 'none' });
      return;
    }

    this.setData({ 'clockInModal.loading': true });

    try {
      const result = await this.sendToWechatWebhook(content);

      if (result) {
        wx.showToast({ title: '推送成功', icon: 'success', duration: 2000 });
        setTimeout(() => {
          this.setData({
            'clockInModal.show': false,
            'clockInModal.content': '',
            clockInSubmitting: false,
            'clockInModal.loading': false
          });

          if (editId) {
            wx.navigateBack();
          } else {
            this.resetForm();
          }
        }, 1500);
      } else {
        wx.showToast({ title: '推送失败，请重试', icon: 'none' });
        this.setData({ 'clockInModal.loading': false, clockInSubmitting: false });
      }
    } catch (error) {
      console.error('推送到企业微信失败:', error);
      wx.showToast({ title: '推送失败，请重试', icon: 'none' });
      this.setData({ 'clockInModal.loading': false, clockInSubmitting: false });
    }
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
      console.error('调用云函数失败:', error);
      return false;
    }
  }
});
