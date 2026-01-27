import {PROJECTS} from "../../utils/constants";
import {Collections, db} from "../../utils/db";
import {cloudDb as cloudDbService} from '../../utils/cloud-db';
import {AppConfig} from '../../config/index';
import {calculateOvertimeUnits, calculateProjectEndTime, formatDate, formatTime, isTimeOverlapping, parseProjectDuration, SHIFT_END_TIMES} from "../../utils/util";
const GBK = require("gbk.js");

// 定义每日咨询单集合
type DailyConsultations = {
  [date: string]: ConsultationRecord[];
};

const DefaultConsultationInfo: ConsultationInfo = {
  surname: "",
  gender: "male",
  project: PROJECTS[1].name, // 70min精油
  technician: "",
  room: "",
  massageStrength: "standard",
  essentialOil: "lavender",
  selectedParts: {},
  isClockIn: false, // 默认不勾选点钟
  remarks: "", // 默认无备注
  phone: "", // 默认无手机号
  couponCode: "", // 默认无券码
  couponPlatform: "meituan", // 默认无平台
  upgradeHimalayanSaltStone: false,
};

const DefaultGuestInfo: GuestInfo = {
  surname: "",
  gender: "male",
  selectedParts: {},
  massageStrength: "standard",
  essentialOil: "lavender",
  remarks: "",
  technician: "",
  isClockIn: false,
  couponCode: "",
  couponPlatform: "",
  upgradeHimalayanSaltStone: false,
  project: PROJECTS[1].name, // 70min精油
};

function ensureConsultationInfoCompatibility(data: any): ConsultationInfo {
  return {
    surname: data.surname || "",
    gender: data.gender || "male",
    project: data.project || PROJECTS[1].name,
    technician: data.technician || "",
    room: data.room || "",
    massageStrength: data.massageStrength || "standard",
    essentialOil: data.essentialOil || "lavender",
    selectedParts: data.selectedParts || {},
    isClockIn: data.isClockIn || false,
    remarks: data.remarks || "",
    phone: data.phone || "",
    couponCode: data.couponCode || "",
    couponPlatform: data.couponPlatform || "meituan",
    upgradeHimalayanSaltStone: data.upgradeHimalayanSaltStone || false,
  };
}

type GuestContext = {
  isDualMode: boolean;
  activeGuest: 1 | 2;
  guest1Info: GuestInfo;
  guest2Info: GuestInfo;
  consultationInfo: ConsultationInfo;
};


function updateGuestField(context: GuestContext, fieldName: string, value: any): any {
  if (context.isDualMode) {
    const guestKey = context.activeGuest === 1 ? 'guest1Info' : 'guest2Info';
    return {
      [`${ guestKey }.${ fieldName }`]: value
    };
  }
  return {
    [`consultationInfo.${ fieldName }`]: value
  };
}

function toggleGuestBooleanField(context: GuestContext, fieldName: string): any {
  const currentValue = getGuestFieldValue(context, fieldName);
  return updateGuestField(context, fieldName, !currentValue);
}

function getGuestFieldValue(context: GuestContext, fieldName: string): any {
  if (context.isDualMode) {
    const guestInfo = context.activeGuest === 1 ? context.guest1Info : context.guest2Info;
    return (guestInfo as any)[fieldName];
  }
  return (context.consultationInfo as any)[fieldName];
}

Component({
  data: {
    consultationInfo: {...DefaultConsultationInfo, selectedParts: {}},
    isPrinterConnected: false,
    printerDeviceId: "",
    printerServiceId: "",
    printerCharacteristicId: "",
    editId: "", // 正在编辑的记录ID
    technicianList: [] as any[], // 动态技师列表
    currentReservationIds: [] as string[], // 当前加载的预约ID列表（用于冲突检查时排除）
    loadingTechnicians: false, // 加载技师状态
    // 双人模式相关
    isDualMode: false, // 是否为双人模式
    activeGuest: 1 as 1 | 2, // 当前活跃的顾客标签
    guest1Info: {...DefaultGuestInfo, selectedParts: {}} as GuestInfo, // 顾客1独立信息
    guest2Info: {...DefaultGuestInfo, selectedParts: {}} as GuestInfo, // 顾客2独立信息
    // 顾客匹配相关
    matchedCustomer: null as any | null, // 匹配到的顾客信息
    matchedCustomerApplied: false, // 是否已应用匹配的顾客信息
  },

  lifetimes: {
    async attached() {
      await this.loadTechnicianList();
    }
  },

  pageLifetimes: {
    async show() {
      await this.loadTechnicianList();
    }
  },

  methods: {
    // 获取数据库实例
    getDb() {
      return AppConfig.useCloudDatabase ? cloudDbService : db;
    },

    // 页面加载
    async onLoad(options: any) {
      if (options.editId) {
        await this.loadEditData(options.editId);
      } else if (options.reserveId) {
        await this.loadReservationData(options.reserveId);
      }
    },

    // 加载并检查技师可用性
    async loadTechnicianList() {
      try {
        const now = new Date();
        const today = formatDate(now);
        const currentTimeStr = formatTime(now, false);

        this.setData({loadingTechnicians: true});

        // 获取当前选中的项目时长
        const projectDuration = parseProjectDuration(this.data.consultationInfo.project) || 60;
        const proposedEndTime = new Date(now.getTime() + (projectDuration + 10) * 60 * 1000);
        const proposedEndTimeStr = formatTime(proposedEndTime, false);

        //1. 获取今日所有单据和预约
        const history = (wx.getStorageSync('consultationHistory') as any) || {};
        const todayRecords = (history[today] || []) as ConsultationRecord[];
        const activeRecords = todayRecords.filter(r => !r.isVoided);

        const database = this.getDb();
        let reservations: ReservationRecord[];
        let activeStaff: StaffInfo[];

        if (AppConfig.useCloudDatabase) {
          reservations = await database.find<ReservationRecord>(Collections.RESERVATIONS, {date: today});
          const allStaff = await database.getAll<StaffInfo>(Collections.STAFF);
          activeStaff = allStaff.filter(s => s.status === 'active');
        } else {
          reservations = await database.find<ReservationRecord>(Collections.RESERVATIONS, {date: today});
          activeStaff = (await database.getAll<StaffInfo>(Collections.STAFF)).filter(s => s.status === 'active');
        }

        // 2. 获取轮排顺序
        const savedRotation = wx.getStorageSync(`rotation_${ today }`) as string[];

        // 3. 构建技师列表并检查冲突
        // 排除当前正在加载的预约（允许选择预约技师）
        const filteredReservations = reservations.filter(r => !this.data.currentReservationIds.includes(r.id));

        let list = activeStaff.map(staff => {
          // 检查冲突：查找是否有重叠的任务
          let occupiedReason = '';
          const conflictTask = [...activeRecords, ...filteredReservations].find(r => {
            const rName = (r as any).technician || (r as any).technicianName;
            if (rName !== staff.name) return false;

            // 时间重叠检查: (StartA < EndB) && (EndA > StartB)
            return isTimeOverlapping(currentTimeStr, proposedEndTimeStr, r.startTime, r.endTime);
          });

          if (conflictTask) {
            const isReservation = !(conflictTask as any).technician;
            const customerName = (conflictTask as any).surname || (conflictTask as any).customerName || '顾客';
            const gender = conflictTask.gender === 'male' ? '先生' : '女士';
            occupiedReason = `${ conflictTask.startTime }-${ conflictTask.endTime } ${ customerName }${ gender }${ isReservation ? '(预约)' : '' }`;
          }

          return {
            id: staff.id,
            name: staff.name,
            isOccupied: !!conflictTask,
            occupiedReason
          };
        });

        // 4. 按轮排顺序排序
        if (savedRotation && savedRotation.length > 0) {
          list.sort((a, b) => {
            const idxA = savedRotation.indexOf(a.id);
            const idxB = savedRotation.indexOf(b.id);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
          });
        }

        this.setData({technicianList: list, loadingTechnicians: false});
      } catch (error) {
        console.error('加载技师列表失败:', error);
        this.setData({loadingTechnicians: false});
        wx.showToast({
          title: '加载技师列表失败',
          icon: 'none'
        });
      }
    },

    // 页面加载时获取参数

    // 切换双人模式
    toggleDualMode() {
      const newMode = !this.data.isDualMode;
      if (newMode) {
        // 启用双人模式时，将当前咨询单信息复制到顾客1
        const {consultationInfo} = this.data;
        this.setData({
          isDualMode: true,
          activeGuest: 1,
          guest1Info: {
            surname: consultationInfo.surname,
            gender: (consultationInfo.gender || 'male') as 'male' | 'female',
            selectedParts: {...consultationInfo.selectedParts},
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
          guest2Info: {...DefaultGuestInfo, selectedParts: {}},
          matchedCustomer: null,
          matchedCustomerApplied: false
        });
      } else {
        // 关闭双人模式时，将顾客1信息复制回咨询单
        const {guest1Info} = this.data;
        this.setData({
          isDualMode: false,
          activeGuest: 1,
          'consultationInfo.surname': guest1Info.surname,
          'consultationInfo.gender': guest1Info.gender,
          'consultationInfo.selectedParts': {...guest1Info.selectedParts},
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
    switchGuest(e: any) {
      const guest = parseInt(e.currentTarget.dataset.guest) as 1 | 2;
      this.setData({activeGuest: guest});
    },

    // 姓氏输入
    onSurnameInput(e: any) {
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const key = activeGuest === 1 ? 'guest1Info.surname' : 'guest2Info.surname';
        this.setData({[key]: e.detail.value});
      } else {
        this.setData({"consultationInfo.surname": e.detail.value});
      }
      // 触发顾客匹配
      this.searchCustomer();
    },

    // 性别选择
    onGenderSelect(e: any) {
      const gender = e.detail.value;
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const key = activeGuest === 1 ? 'guest1Info.gender' : 'guest2Info.gender';
        this.setData({[key]: gender});
      } else {
        this.setData({"consultationInfo.gender": gender});
      }
      // 触发顾客匹配
      this.searchCustomer();
    },

    // 项目选择
     onProjectSelect(e: any) {
      const project = e.detail.project || e.currentTarget.dataset.project;
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const key = activeGuest === 1 ? 'guest1Info.project' : 'guest2Info.project';
        this.setData({[key]: project});
      } else {
        this.setData({"consultationInfo.project": project});
      }
       this.loadTechnicianList(); // 项目变更可能影响可用性（时长不同）
    },

    // 技师选择
    onTechnicianSelect(e: any) {
      const {technician, occupied, reason} = e.detail.technician ? e.detail : e.currentTarget.dataset;
      if (occupied) {
        wx.showToast({title: reason || '该技师当前时段已有安排', icon: 'none', duration: 2500});
        return;
      }
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const key = activeGuest === 1 ? 'guest1Info.technician' : 'guest2Info.technician';
        this.setData({[key]: technician});
      } else {
        this.setData({"consultationInfo.technician": technician});
      }
    },

    // 点钟选择
    onClockInSelect() {
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const currentInfo = activeGuest === 1 ? this.data.guest1Info : this.data.guest2Info;
        const key = activeGuest === 1 ? 'guest1Info.isClockIn' : 'guest2Info.isClockIn';
        this.setData({[key]: !currentInfo.isClockIn});
      } else {
        this.setData({"consultationInfo.isClockIn": !this.data.consultationInfo.isClockIn});
      }
    },

    // 备注输入
    onRemarksInput(e: any) {
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const key = activeGuest === 1 ? 'guest1Info.remarks' : 'guest2Info.remarks';
        this.setData({[key]: e.detail.value});
      } else {
        this.setData({"consultationInfo.remarks": e.detail.value});
      }
    },

    // 手机号输入
    onPhoneInput(e: any) {
      this.setData({
        "consultationInfo.phone": e.detail.value,
      });
      // 触发顾客匹配
      this.searchCustomer();
    },

    // 券码输入
    onCouponCodeInput(e: any) {
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const key = activeGuest === 1 ? 'guest1Info.couponCode' : 'guest2Info.couponCode';
        this.setData({[key]: e.detail.value});
      } else {
        this.setData({"consultationInfo.couponCode": e.detail.value});
      }
    },

    // 券码平台选择
    onCouponPlatformSelect(e: any) {
      const platform = e.detail.value;
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const currentInfo = activeGuest === 1 ? this.data.guest1Info : this.data.guest2Info;
        const key = activeGuest === 1 ? 'guest1Info.couponPlatform' : 'guest2Info.couponPlatform';
        this.setData({[key]: currentInfo.couponPlatform === platform ? '' : platform});
      } else {
        const currentPlatform = this.data.consultationInfo.couponPlatform;
        this.setData({"consultationInfo.couponPlatform": currentPlatform === platform ? '' : platform});
      }
    },

    // 房间选择
    onRoomSelect(e: any) {
      const room = e.detail.room || e.currentTarget.dataset.room;
      this.setData({
        "consultationInfo.room": room,
      });
    },

    // 按摩力度选择
    onMassageStrengthSelect(e: any) {
      const strength = e.detail.strength || e.currentTarget.dataset.strength;
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const key = activeGuest === 1 ? 'guest1Info.massageStrength' : 'guest2Info.massageStrength';
        this.setData({[key]: strength});
      } else {
        this.setData({"consultationInfo.massageStrength": strength});
      }
    },

    // 精油选择（单选）
    onEssentialOilSelect(e: any) {
      const oil = e.detail.oil || e.currentTarget.dataset.oil;
      const {isDualMode, activeGuest} = this.data;
      if (isDualMode) {
        const key = activeGuest === 1 ? 'guest1Info.essentialOil' : 'guest2Info.essentialOil';
        this.setData({[key]: oil});
      } else {
        this.setData({"consultationInfo.essentialOil": oil});
      }
    },

    // 升级选项选择
    onUpgradeSelect() {
      const context = {
        isDualMode: this.data.isDualMode,
        activeGuest: this.data.activeGuest,
        guest1Info: this.data.guest1Info,
        guest2Info: this.data.guest2Info,
        consultationInfo: this.data.consultationInfo
      };
      this.setData(toggleGuestBooleanField(context, 'upgradeHimalayanSaltStone'));
    },

    // 加强部位选择（使用字段map控制）
    onBodyPartSelect(e: any) {
      const part = e.detail.part || e.currentTarget.dataset.part;
      const {isDualMode, activeGuest} = this.data;

      if (isDualMode) {
        const infoKey = activeGuest === 1 ? 'guest1Info' : 'guest2Info';
        const currentInfo = activeGuest === 1 ? this.data.guest1Info : this.data.guest2Info;
        const selectedParts = {...currentInfo.selectedParts};
        selectedParts[part] = !selectedParts[part];
        this.setData({[`${ infoKey }.selectedParts`]: selectedParts});
      } else {
        const selectedParts: Record<string, boolean> = {
          ...this.data.consultationInfo.selectedParts,
        };
        selectedParts[part] = !selectedParts[part];
        const updatedInfo = {
          ...this.data.consultationInfo,
          selectedParts: selectedParts,
        };
        this.setData({consultationInfo: updatedInfo});
      }
    },

    // 连接蓝牙打印机
    connectBluetooth() {
      wx.showLoading({
        title: "正在搜索打印机...",
      });

      // 初始化蓝牙适配器
      wx.openBluetoothAdapter({
        success: () => {
          // 开始搜索蓝牙设备
          wx.startBluetoothDevicesDiscovery({
            services: [],
            success: () => {
              // 监听发现蓝牙设备
              wx.onBluetoothDeviceFound((res) => {
                const devices = res.devices;
                devices.forEach((device) => {
                  // 这里可以根据设备名称筛选打印机
                  if (
                    device.name &&
                    (device.name.includes("Printer") ||
                      device.name.includes("打印机"))
                  ) {
                    // 停止搜索
                    wx.stopBluetoothDevicesDiscovery();

                    // 连接设备
                    this.connectToDevice(device.deviceId);
                  }
                });
              });
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({
                title: "搜索蓝牙设备失败",
                icon: "none",
              });
              console.error("搜索蓝牙设备失败:", err);
            },
          });
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: "蓝牙初始化失败",
            icon: "none",
          });
          console.error("蓝牙初始化失败:", err);
        },
      });
    },

    // 连接到蓝牙设备
    connectToDevice(deviceId: string) {
      wx.createBLEConnection({
        deviceId,
        success: () => {
          this.setData({
            isPrinterConnected: true,
            printerDeviceId: deviceId,
          });

          // 获取设备服务
          this.getDeviceServices(deviceId);
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: "连接打印机失败",
            icon: "none",
          });
          console.error("连接打印机失败:", err);
        },
      });
    },

    // 获取设备服务
    getDeviceServices(deviceId: string) {
      wx.getBLEDeviceServices({
        deviceId,
        success: (res) => {
          const serviceId = res.services[0].uuid;
          this.setData({
            printerServiceId: serviceId,
          });

          // 获取服务特征
          this.getDeviceCharacteristics(deviceId, serviceId);
        },
        fail: (err) => {
          wx.hideLoading();
          console.error("获取设备服务失败:", err);
        },
      });
    },

    // 获取服务特征
    getDeviceCharacteristics(deviceId: string, serviceId: string) {
      wx.getBLEDeviceCharacteristics({
        deviceId,
        serviceId,
        success: (res) => {
          res.characteristics.forEach((char) => {
            if (char.properties.write) {
              this.setData({
                printerCharacteristicId: char.uuid,
              });

              wx.hideLoading();
              wx.showToast({
                title: "打印机连接成功",
                icon: "success",
              });
            }
          });
        },
        fail: (err) => {
          wx.hideLoading();
          console.error("获取服务特征失败:", err);
        },
      });
    },

    // 打印咨询单（自动连接打印机）
    printConsultation() {
      const {printerDeviceId, printerServiceId, printerCharacteristicId} =
        this.data;

      // 检查是否已连接打印机
      if (!printerDeviceId || !printerServiceId || !printerCharacteristicId) {
        // 未连接，自动连接打印机
        this.connectAndPrint();
      } else {
        // 已连接，直接打印
        this.doPrint();
      }
    },

    // 自动连接打印机并打印
    connectAndPrint() {
      wx.showLoading({
        title: "正在连接打印机...",
      });

      // 初始化蓝牙适配器
      wx.openBluetoothAdapter({
        success: () => {
          // 开始搜索蓝牙设备
          wx.startBluetoothDevicesDiscovery({
            services: [],
            success: () => {
              // 监听发现蓝牙设备
              wx.onBluetoothDeviceFound((res) => {
                const devices = res.devices;
                devices.forEach((device) => {
                  // 这里可以根据设备名称筛选打印机
                  if (
                    device.name &&
                    (device.name.includes("Printer") ||
                      device.name.includes("打印机"))
                  ) {
                    // 停止搜索
                    wx.stopBluetoothDevicesDiscovery();
                    // 移除监听器
                    wx.offBluetoothDeviceFound();

                    // 连接设备
                    this.connectToDeviceWithPrint(device.deviceId);
                  }
                });
              });
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({
                title: "搜索蓝牙设备失败",
                icon: "none",
              });
              console.error("搜索蓝牙设备失败:", err);
            },
          });
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: "蓝牙初始化失败",
            icon: "none",
          });
          console.error("蓝牙初始化失败:", err);
        },
      });
    },

    // 连接设备并打印
    connectToDeviceWithPrint(deviceId: string) {
      wx.createBLEConnection({
        deviceId,
        success: () => {
          this.setData({
            isPrinterConnected: true,
            printerDeviceId: deviceId,
          });

          // 获取设备服务
          this.getDeviceServicesForPrint(deviceId);
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: "连接打印机失败",
            icon: "none",
          });
          console.error("连接打印机失败:", err);
        },
      });
    },

    // 获取设备服务并打印
    getDeviceServicesForPrint(deviceId: string) {
      wx.getBLEDeviceServices({
        deviceId,
        success: (res) => {
          const serviceId = res.services[0].uuid;
          this.setData({
            printerServiceId: serviceId,
          });

          // 获取服务特征
          this.getDeviceCharacteristicsForPrint(deviceId, serviceId);
        },
        fail: (err) => {
          wx.hideLoading();
          console.error("获取设备服务失败:", err);
          wx.showToast({
            title: "获取服务失败",
            icon: "none",
          });
        },
      });
    },

    // 获取服务特征并打印
    getDeviceCharacteristicsForPrint(deviceId: string, serviceId: string) {
      wx.getBLEDeviceCharacteristics({
        deviceId,
        serviceId,
        success: (res) => {
          res.characteristics.forEach((char) => {
            if (char.properties.write) {
              this.setData({
                printerCharacteristicId: char.uuid,
              });

              wx.hideLoading();
              // 连接成功，执行打印
              this.doPrint();
            }
          });
        },
        fail: (err) => {
          wx.hideLoading();
          console.error("获取服务特征失败:", err);
          wx.showToast({
            title: "获取特征失败",
            icon: "none",
          });
        },
      });
    },

    // 执行实际的打印操作
    doPrint() {
      const {isDualMode, guest1Info, guest2Info, consultationInfo, printerDeviceId, printerServiceId, printerCharacteristicId} = this.data;

      // 双人模式下构建两份打印内容
      let printContents: string[] = [];
      if (isDualMode) {
        // 顾客1打印内容（使用顾客1的项目、技师、点钟、券码）
        const info1: ConsultationInfo = {
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
        printContents.push(this.buildPrintContent(info1));

        // 顾客2打印内容（使用顾客2的项目、技师、点钟、券码）
        const info2: ConsultationInfo = {
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
        printContents.push(this.buildPrintContent(info2));
      } else {
        printContents.push(this.buildPrintContent(consultationInfo));
      }

      // 顺序打印所有内容
      this.printMultiple(printContents, printerDeviceId, printerServiceId, printerCharacteristicId);
    },

    // 顺序打印多份内容
    printMultiple(contents: string[], deviceId: string, serviceId: string, characteristicId: string, index: number = 0) {
      if (index >= contents.length) {
        const msg = contents.length > 1 ? `已打印${ contents.length }张单据` : '打印成功';
        wx.showToast({title: msg, icon: 'success'});
        return;
      }

      const printContent = contents[index];
      const uint8Array = new Uint8Array(GBK.encode(printContent));
      const chunkSize = 20;
      let offset = 0;

      const writeNextChunk = () => {
        if (offset >= uint8Array.length) {
          // 当前单据打印完成，打印下一份
          setTimeout(() => {
            this.printMultiple(contents, deviceId, serviceId, characteristicId, index + 1);
          }, 500); // 两张单据间隔500ms
          return;
        }

        const end = Math.min(offset + chunkSize, uint8Array.length);
        const chunk = uint8Array.slice(offset, end).buffer;

        wx.writeBLECharacteristicValue({
          deviceId,
          serviceId,
          characteristicId,
          value: chunk,
          success: () => {
            offset += chunkSize;
            setTimeout(writeNextChunk, 20);
          },
          fail: (err) => {
            wx.showToast({title: '打印失败', icon: 'none'});
            console.error('分片打印失败:', err);
          },
        });
      };

      writeNextChunk();
    },

    // 刷新表单内容
    onRefresh() {
      wx.showModal({
        title: "确认刷新",
        content: "确定要重置咨询单内容吗？",
        success: (res) => {
          if (res.confirm) {
            // 重置为初始值
            this.setData({
              consultationInfo: {
                ...DefaultConsultationInfo,
                selectedParts: {},
              },
              editId: "", // 重置编辑状态
              // 重置双人模式相关数据
              isDualMode: false,
              activeGuest: 1,
              guest1Info: {...DefaultGuestInfo, selectedParts: {}},
              guest2Info: {...DefaultGuestInfo, selectedParts: {}},
            });
            wx.showToast({
              title: "咨询单已重置",
              icon: "success",
            });
          }
        },
      });
    },

    // 删除预约（到店报钟后调用）
    deleteReservations() {
      const {currentReservationIds} = this.data;
      if (!currentReservationIds || currentReservationIds.length === 0) {
        return;
      }

      try {
        let deletedCount = 0;
        for (const reserveId of currentReservationIds) {
          const success = db.deleteById(Collections.RESERVATIONS, reserveId);
          if (success) {
            deletedCount++;
          }
        }

        if (deletedCount > 0) {
          // 清空当前预约ID列表
          this.setData({currentReservationIds: []});
        }
      } catch (error) {
        console.error("删除预约失败:", error);
      }
    },

    // 计算加班时长（根据排班和起始时间）
    calculateOvertime(technician: string, date: string, startTime: string): number {
      try {
        // 获取当日排班
        const schedule = db.findOne<ScheduleRecord>(Collections.SCHEDULE, {
          date: date
        });

        if (!schedule) {
          return 0; // 没有排班，不计算加班
        }

        // 获取技师信息以匹配 staffId
        const staff = db.findOne<StaffInfo>(Collections.STAFF, {
          name: technician,
          status: 'active'
        });

        if (!staff || schedule.staffId !== staff.id) {
          return 0; // 未找到技师或排班不匹配
        }

        const endTime = SHIFT_END_TIMES[schedule.shift];
        return calculateOvertimeUnits(startTime, endTime);
      } catch (error) {
        console.error('计算加班时长失败:', error);
        return 0;
      }
    },

    // 保存咨询单到缓存（支持新建和更新）
    saveConsultationToCache(consultation: ConsultationInfo, editId?: string) {
      try {
        const now = new Date();
        const currentDate = formatDate(now);
        const timestamp = now.toISOString();

        // 获取现有缓存数据
        const cachedData =
          (wx.getStorageSync("consultationHistory") as DailyConsultations) ||
          {};

        // 计算开始时间和结束时间
        const startTimeStr = formatTime(now, false);
        const endTimeDate = calculateProjectEndTime(now, consultation.project);
        const endTimeStr = formatTime(endTimeDate, false);

        // 自动计算加班
        const calculatedOvertime = this.calculateOvertime(consultation.technician, currentDate, startTimeStr);

        if (editId) {
          // 更新现有记录
          let updated = false;

          // 遍历所有日期
          Object.keys(cachedData).forEach((date) => {
            const records = cachedData[date];
            const index = records.findIndex((record) => record.id === editId);

            if (index !== -1) {
              // 更新记录
              records[index] = {
                ...records[index],
                ...consultation,
                updatedAt: timestamp,
                startTime: startTimeStr, // 报钟时间
                endTime: endTimeStr, // 结束时间
                overtime: calculatedOvertime // 自动计算的加班
              };
              updated = true;
            }
          });

          if (!updated) {
            console.error("未找到要更新的记录:", editId);
            return false;
          }
        } else {
          // 创建新记录
          const id =
            Date.now().toString() + Math.random().toString(36).substr(2, 9);

          const record: ConsultationRecord = {
            ...consultation,
            id,
            createdAt: timestamp,
            updatedAt: timestamp,
            isVoided: false,
            extraTime: 0, // 初始化加钟数
            overtime: calculatedOvertime, // 自动计算的加班
            startTime: startTimeStr, // 报钟时间
            endTime: endTimeStr, // 结束时间
          };

          // 确保当天的数组存在
          if (!cachedData[currentDate]) {
            cachedData[currentDate] = [];
          }

          // 添加新记录
          cachedData[currentDate].push(record);

          // 新建记录时删除对应的预约
          this.deleteReservations();
        }

        // 清理超过30天的历史数据
        this.cleanupOldData(cachedData);

        // 保存回缓存
        wx.setStorageSync("consultationHistory", cachedData);

        return true;
      } catch (error) {
        console.error("保存咨询单到缓存失败:", error);
        return false;
      }
    },

    // 加载编辑数据
    async loadEditData(editId: string) {
      try {
        // 获取现有缓存数据
        const cachedData =
          (wx.getStorageSync("consultationHistory") as DailyConsultations) ||
          {};
        let foundRecord: ConsultationRecord | null = null;

        // 遍历所有日期查找记录
        for (const date in cachedData) {
          if (cachedData.hasOwnProperty(date)) {
            const records = cachedData[date] as ConsultationRecord[];
            for (const record of records) {
              if (record.id === editId) {
                foundRecord = record;
                break;
              }
            }
            if (foundRecord) {
              break;
            }
          }
        }

        if (foundRecord) {
          // 设置表单数据和编辑ID，使用兼容性函数确保旧数据正确初始化
          this.setData({
            consultationInfo: ensureConsultationInfoCompatibility(foundRecord),
            editId: editId,
            matchedCustomer: null,
            matchedCustomerApplied: false
          });
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
    async loadReservationData(reserveId: string) {
      try {
        const database = this.getDb();
        const record = await database.findById<ReservationRecord>(Collections.RESERVATIONS, reserveId);
        if (record) {
          this.setData({
            consultationInfo: {
              ...DefaultConsultationInfo,
              surname: record.customerName,
              gender: record.gender,
              phone: record.phone,
              project: record.project,
              technician: record.technicianName || '',
            },
            currentReservationIds: [reserveId]
          });
          await this.loadTechnicianList();
        } else {
          console.error("未找到要加载的预约:", reserveId);
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
    saveEdit() {
      const {consultationInfo, editId} = this.data;

      // 验证必填信息
      if (!consultationInfo.gender) {
        wx.showToast({title: "请选择称呼", icon: "none"});
        return;
      }
      if (!consultationInfo.project) {
        wx.showToast({title: "请选择项目", icon: "none"});
        return;
      }
      if (!consultationInfo.technician) {
        wx.showToast({title: "请选择技师", icon: "none"});
        return;
      }
      if (!consultationInfo.room) {
        wx.showToast({title: "请选择房间", icon: "none"});
        return;
      }

      // 保存到缓存
      const success = this.saveConsultationToCache(consultationInfo, editId);

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

    // 重新报钟（编辑模式）
    reClockIn() {
      const {consultationInfo, editId} = this.data;

      // 验证必填信息
      if (!consultationInfo.gender) {
        wx.showToast({title: "请选择称呼", icon: "none"});
        return;
      }
      if (!consultationInfo.project) {
        wx.showToast({title: "请选择项目", icon: "none"});
        return;
      }
      if (!consultationInfo.technician) {
        wx.showToast({title: "请选择技师", icon: "none"});
        return;
      }
      if (!consultationInfo.room) {
        wx.showToast({title: "请选择房间", icon: "none"});
        return;
      }

      // 格式化上钟信息
      const clockInInfo = this.formatClockInInfo(consultationInfo);

      // 保存到缓存（更新现有记录）
      const success = this.saveConsultationToCache(consultationInfo, editId);

      if (success) {
        // 复制到剪贴板
        wx.setClipboardData({
          data: clockInInfo,
          success: () => {
            wx.showToast({
              title: "上钟信息已复制",
              icon: "success",
              success: () => {
                // 延迟返回
                setTimeout(() => {
                  wx.navigateBack();
                }, 1000);
              }
            });
          },
          fail: (err) => {
            wx.showToast({
              title: "复制失败",
              icon: "none",
            });
            console.error("复制到剪贴板失败:", err);
          },
        });
      } else {
        wx.showToast({
          title: "保存失败",
          icon: "error"
        });
      }
    },

    // 取消编辑
    cancelEdit() {
      wx.navigateBack();
    },

    // 搜索匹配顾客
    searchCustomer() {
      const {consultationInfo, isDualMode, activeGuest} = this.data;

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

      // 从系统存储中获取所有顾客信息
      const savedCustomers = wx.getStorageSync('customers') || {};
      const customerList = Object.keys(savedCustomers).map(key => ({
        id: key,
        ...savedCustomers[key]
      }));


      // 查找最佳匹配
      let bestMatch: any | null = null;
      let bestScore = 0;

      customerList.forEach(customer => {
        let score = 0;

        // 手机号模糊匹配（包含匹配，最高优先级）
        if (currentPhone && customer.phone && customer.phone.includes(currentPhone)) {
          // 完全匹配给最高分
          if (customer.phone === currentPhone) {
            score += 100;
          } else {
            // 模糊匹配根据输入长度给分
            const matchRatio = currentPhone.length / customer.phone.length;
            score += Math.round(matchRatio * 80);
          }
        }

        // 姓氏匹配
        if (currentSurname && customer.name && customer.name.includes(currentSurname)) {
          score += 50;
        }

        // 性别匹配
        if (currentGender && customer.name) {
          // 从姓名中推断性别（简单实现）
          const nameEndsWith = customer.name.slice(-1);
          if (currentGender === 'male' && nameEndsWith === '先生') {
            score += 30;
          } else if (currentGender === 'female' && nameEndsWith === '女士') {
            score += 30;
          }
        }


        // 更新最佳匹配
        if (score > bestScore && score >= 30) {
          bestScore = score;
          bestMatch = customer;
        }
      });

      // 如果找到匹配，更新状态
      if (bestMatch) {
        this.setData({
          matchedCustomer: bestMatch,
          matchedCustomerApplied: false
        });
      } else {
        this.setData({
          matchedCustomer: null,
          matchedCustomerApplied: false
        });
      }
    },

    // 应用匹配的顾客信息
    applyMatchedCustomer() {
      const {matchedCustomer, consultationInfo, isDualMode, activeGuest} = this.data;

      if (!matchedCustomer) return;

      // 应用顾客信息到表单
      if (isDualMode) {
        const guestInfo = activeGuest === 1 ? this.data.guest1Info : this.data.guest2Info;
        const guestKey = activeGuest === 1 ? 'guest1Info' : 'guest2Info';

        // 更新顾客信息
        const updates: any = {
          [`${ guestKey }.surname`]: matchedCustomer.name.replace(/先生|女士/g, ''),
          [`${ guestKey }.gender`]: matchedCustomer.name.endsWith('女士') ? 'female' : 'male',
        };

        // 如果有责任技师，应用技师
        if (matchedCustomer.responsibleTechnician) {
          updates[`${ guestKey }.technician`] = matchedCustomer.responsibleTechnician;
        }

        // 应用共享字段
        if (matchedCustomer.phone) {
          updates['consultationInfo.phone'] = matchedCustomer.phone;
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

    // 清理超过30天的历史数据
    cleanupOldData(data: DailyConsultations) {
      const today = new Date();
      const thirtyDaysAgo = new Date(
        today.getTime() - 30 * 24 * 60 * 60 * 1000,
      );
      const cutoffDate = formatDate(thirtyDaysAgo);

      // 删除超过30天的日期键
      for (const date in data) {
        if (date < cutoffDate) {
          delete data[date];
        }
      }
    },

    // 报钟功能
    onClockIn() {
      const {consultationInfo, editId, isDualMode, guest1Info, guest2Info} = this.data;

      // 验证必填信息（房间是共享的，项目各自选择）
      if (!consultationInfo.room) {
        wx.showToast({title: '请选择房间', icon: 'none'});
        return;
      }

      if (isDualMode) {
        // 双人模式报钟（技师和项目验证在 doDualClockIn 中进行）
        this.doDualClockIn();
      } else {
        // 单人模式验证项目
        if (!consultationInfo.project) {
          wx.showToast({title: '请选择项目', icon: 'none'});
          return;
        }
        // 单人模式报钟
        if (!consultationInfo.technician) {
          wx.showToast({title: '请选择技师', icon: 'none'});
          return;
        }
        if (!consultationInfo.gender) {
          wx.showToast({title: '请选择称呼', icon: 'none'});
          return;
        }

        const clockInInfo = this.formatClockInInfo(consultationInfo);
        const success = this.saveConsultationToCache(consultationInfo, editId);

        if (success) {
          if (!editId && !consultationInfo.isClockIn) {
            this.updateRotationOrder(consultationInfo.technician);
          }
          wx.setClipboardData({
            data: clockInInfo,
            success: async () => {
              wx.showToast({title: '上钟信息已复制', icon: 'success'});
              await this.loadTechnicianList();
            },
            fail: (err) => {
              wx.showToast({title: '复制失败', icon: 'none'});
              console.error('复制到剪贴板失败:', err);
            },
          });
        }
      }
    },

    // 双人模式报钟
    doDualClockIn() {
      const {consultationInfo, guest1Info, guest2Info} = this.data;

      // 验证两位顾客的项目
      if (!guest1Info.project) {
        wx.showToast({title: '请为顾客1选择项目', icon: 'none'});
        return;
      }
      if (!guest2Info.project) {
        wx.showToast({title: '请为顾客2选择项目', icon: 'none'});
        return;
      }

      // 验证两位顾客的技师
      if (!guest1Info.technician) {
        wx.showToast({title: '请为顾客1选择技师', icon: 'none'});
        return;
      }
      if (!guest2Info.technician) {
        wx.showToast({title: '请为顾客2选择技师', icon: 'none'});
        return;
      }

      // 构建两位顾客的完整信息（使用各自的项目、技师、点钟、券码）
      const info1: ConsultationInfo = {
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
      const info2: ConsultationInfo = {
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

      // 保存两条记录（使用相同的开始和结束时间）
      const success1 = this.saveConsultationToCache(info1);
      const success2 = this.saveConsultationToCache(info2);

      if (success1 && success2) {
        // 更新轮排顺序（两位技师都需要更新）
        if (!guest1Info.isClockIn) {
          this.updateRotationOrder(guest1Info.technician);
        }
        if (!guest2Info.isClockIn && guest2Info.technician !== guest1Info.technician) {
          this.updateRotationOrder(guest2Info.technician);
        }

        // 格式化两位顾客的报钟信息
        const clockInInfo1 = this.formatClockInInfo(info1);
        const clockInInfo2 = this.formatClockInInfo(info2);
        const combinedInfo = `【顾客1】
${ clockInInfo1 }

【顾客2】
${ clockInInfo2 }`;

        wx.setClipboardData({
          data: combinedInfo,
          success: async () => {
            wx.showToast({title: '双人报钟已复制', icon: 'success'});
            await this.loadTechnicianList();
          },
          fail: (err) => {
            wx.showToast({title: '复制失败', icon: 'none'});
            console.error('复制到剪贴板失败:', err);
          },
        });
      } else {
        wx.showToast({title: '保存失败', icon: 'error'});
      }
    },

    // 更新轮排顺序：将技师移到末尾
    updateRotationOrder(technicianName: string) {
      const now = new Date();
      const today = formatDate(now);
      const storageKey = `rotation_${ today }`;

      let rotation = wx.getStorageSync(storageKey) as string[];
      if (!rotation || rotation.length === 0) return;

      // 查找技师ID
      const staff = this.data.technicianList.find(t => t.name === technicianName);
      if (!staff) return;

      const index = rotation.indexOf(staff.id);
      if (index !== -1) {
        // 移除并加到末尾
        rotation.splice(index, 1);
        rotation.push(staff.id);
        wx.setStorageSync(storageKey, rotation);
      }
    },

    // 计算技师当日的报钟数量
    getTechnicianDailyCount(technician: string) {
      try {
        const currentDate = formatDate(new Date());
        const cachedData =
          (wx.getStorageSync("consultationHistory") as DailyConsultations) ||
          {};

        // 检查当天是否有记录
        if (!cachedData[currentDate]) {
          return 1; // 今天的第一个报钟
        }

        // 计算技师当天的有效报钟数量（排除已作废的）
        const count = cachedData[currentDate].filter(
          (record) => record.technician === technician && !record.isVoided,
        ).length;

        // 加1是因为当前报钟还未保存
        return count + 1;
      } catch (error) {
        console.error("计算技师报钟数量失败:", error);
        return 1;
      }
    },

    // 格式化报钟信息
    formatClockInInfo(info: ConsultationInfo) {
      const currentTime = new Date();
      const startTime = formatTime(currentTime, false);
      // 解析项目时长并计算结束时间
      const projectDuration = parseProjectDuration(info.project);
      const totalDuration = projectDuration + 10; // 项目时长 + 10分钟
      const endTime = new Date(
        currentTime.getTime() + totalDuration * 60 * 1000,
      );
      const formattedEndTime = formatTime(endTime, false);

      // 获取技师当日报钟数量
      const dailyCount = this.getTechnicianDailyCount(info.technician);

      let formattedInfo = "";
      formattedInfo += `顾客: ${ info.surname }${ info.gender === "male" ? "先生" : "女士"
        }\n`;
      formattedInfo += `项目: ${ info.project }\n`;
      formattedInfo += `技师: ${ info.technician }(${ dailyCount })${ info.isClockIn ? "[点]" : "" }\n`;
      formattedInfo += `房间: ${ info.room }\n`;
      formattedInfo += `时间: ${ startTime } - ${ formattedEndTime }`;

      // 添加备注信息（仅当有内容时显示）
      if (info.remarks) {
        formattedInfo += `\n备注: ${ info.remarks }`;
      }

      return formattedInfo;
    },

    // 构建打印内容
    buildPrintContent(info: ConsultationInfo) {
      const strengthMap: Record<string, string> = {
        standard: "标准",
        soft: "轻柔",
        gravity: "重力",
      };

      const oilMap: Record<string, string> = {
        lavender: "薰衣草",
        grapefruit: "葡萄柚",
        atractylodes: "白术",
        rosemary: "迷迭香",
        rosewood: "花梨木",
        seasonal: "季节特调",
      };

      const partMap: Record<string, string> = {
        head: "头部",
        neck: "颈部",
        shoulder: "肩部",
        back: "后背",
        arm: "手臂",
        abdomen: "腹部",
        waist: "腰部",
        thigh: "大腿",
        calf: "小腿",
      };

      // 添加ESC/POS命令设置大号字体
      // ESC ! 0x10 (16) - 设置双倍高度
      // ESC ! 0x20 (32) - 设置双倍宽度
      // ESC ! 0x30 (48) - 设置双倍高度和宽度
      const ESC = String.fromCharCode(0x1b);
      const setLargeFont = ESC + "!" + String.fromCharCode(0x30); // 设置双倍高度和宽度
      const setNormalFont = ESC + "!" + String.fromCharCode(0x00); // 恢复正常字体

      // 将整个打印内容都设置为大号字体
      let content = setLargeFont + "\n\n\n\n趴岛 SPA&MASSAGE\n";
      content += `${ info.surname }${ info.gender === "male" ? "先生" : "女士"
        }咨询单\n`;
      content += "================\n";
      content += `项目: ${ info.project }\n`;
      // 获取技师当日报钟数量
      const dailyCount = this.getTechnicianDailyCount(info.technician);
      content += `技师: ${ info.technician }(${ dailyCount })${ info.isClockIn ? "[点]" : "" }\n`;
      content += `房间: ${ info.room }\n`;
      content += "力度:";
      content += `${ strengthMap[info.massageStrength] || "未选择" }\n`;
      if (info.project !== "60min指压") {
        content += "精油:";
        content += `${ oilMap[info.essentialOil] || "未选择" }\n`;
      }
      content += "加强部位:";
      const selectedPartsArray = Object.keys(info.selectedParts).filter(
        (key) => info.selectedParts[key],
      );
      if (selectedPartsArray.length > 0) {
        selectedPartsArray.forEach((part) => {
          content += `${ partMap[part] }  `;
        });
      } else {
        content += "无";
      }

      // 添加升级选项（仅当勾选时显示）
      if (info.upgradeHimalayanSaltStone) {
        content += `\n升级: 冬季喜马拉雅热油盐石`;
      }

      // 添加备注信息（仅当有内容时显示）
      if (info.remarks) {
        content += `\n备注: ${ info.remarks }`;
      }

      content += "\n================\n";
      content += `打印时间: ${ formatTime(new Date(), false) }



      

`;

      return content;
    },

    // 跳转到主页
    goToHome() {
      wx.navigateTo({
        url: "/pages/store-config/store-config",
      });
    },
  },
});
