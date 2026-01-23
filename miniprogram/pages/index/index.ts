import {formatTime, parseProjectDuration} from "../../utils/util";
import {db, Collections} from "../../utils/db";
const GBK = require("gbk.js");

// 定义每日咨询单集合
type DailyConsultations = {
  [date: string]: ConsultationRecord[];
};

const DefaultConsultationInfo: ConsultationInfo = {
  surname: "",
  gender: "male",
  project: "70min精油",
  technician: "星野",
  room: "苏梅",
  massageStrength: "standard",
  essentialOil: "lavender",
  selectedParts: {},
  isClockIn: false, // 默认不勾选点钟
  remarks: "", // 默认无备注
  phone: "", // 默认无手机号
  couponCode: "", // 默认无券码
  couponPlatform: "meituan", // 默认无平台
};

Component({
  data: {
    consultationInfo: {...DefaultConsultationInfo, selectedParts: {}},
    isPrinterConnected: false,
    printerDeviceId: "",
    printerServiceId: "",
    printerCharacteristicId: "",
    editId: "", // 正在编辑的记录ID
    technicianList: [] as any[], // 动态技师列表
  },

  lifetimes: {
    attached() {
      this.loadTechnicianList();
    }
  },

  pageLifetimes: {
    show() {
      this.loadTechnicianList();
    }
  },

  methods: {
    // 加载并检查技师可用性
    loadTechnicianList() {
      const now = new Date();
      const today = this.formatDate(now);
      const currentTimeStr = formatTime(now, false);

      // 获取当前选中的项目时长
      const projectDuration = parseProjectDuration(this.data.consultationInfo.project) || 60;
      const proposedEndTime = new Date(now.getTime() + (projectDuration + 10) * 60 * 1000);
      const proposedEndTimeStr = formatTime(proposedEndTime, false);

      // 1. 获取今日所有单据和预约
      const history = (wx.getStorageSync('consultationHistory') as any) || {};
      const todayRecords = (history[today] || []) as ConsultationRecord[];
      const activeRecords = todayRecords.filter(r => !r.isVoided);
      const reservations = db.find<ReservationRecord>(Collections.RESERVATIONS, {date: today});

      // 2. 获取轮排顺序
      const activeStaff = db.getAll<StaffInfo>(Collections.STAFF).filter(s => s.status === 'active');
      const savedRotation = wx.getStorageSync(`rotation_${ today }`) as string[];

      // 3. 构建技师列表并检查冲突
      let list = activeStaff.map(staff => {
        // 检查冲突：查找是否有重叠的任务
        const hasConflict = [...activeRecords, ...reservations].some(r => {
          const rName = (r as any).technician || (r as any).technicianName;
          if (rName !== staff.name) return false;

          // 时间重叠检查: (StartA < EndB) && (EndA > StartB)
          return currentTimeStr < r.endTime && proposedEndTimeStr > r.startTime;
        });

        return {
          id: staff.id,
          name: staff.name,
          isOccupied: hasConflict
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

      this.setData({technicianList: list});

      // 如果当前选中的技师不存在于列表中或有冲突，且不是在编辑模式下，可以考虑清空选中（可选）
      // if (!this.data.editId && this.data.consultationInfo.technician) {
      //   const current = list.find(t => t.name === this.data.consultationInfo.technician);
      //   if (!current || current.isOccupied) {
      //     this.setData({ "consultationInfo.technician": "" });
      //   }
      // }
    },
    // 页面加载时获取参数
    onLoad(options: Record<string, string | undefined>) {
      if (options.editId) {
        // 加载编辑数据
        this.loadEditData(options.editId);
      }
    },
    // 检查数组是否包含某个元素（替代数组的includes方法）
    arrayIncludes(array: string[], element: string): boolean {
      if (!array || !Array.isArray(array)) {
        return false;
      }
      for (let i = 0; i < array.length; i++) {
        if (array[i] === element) {
          return true;
        }
      }
      return false;
    },

    // 姓氏输入
    onSurnameInput(e: any) {
      this.setData({
        "consultationInfo.surname": e.detail.value,
      });
    },

    // 性别选择
    onGenderSelect(e: any) {
      this.setData({
        "consultationInfo.gender": e.currentTarget.dataset.gender,
      });
    },

    // 项目选择
    onProjectSelect(e: any) {
      const project = e.currentTarget.dataset.project;
      this.setData({
        "consultationInfo.project": project,
      });
      this.loadTechnicianList(); // 项目变更可能影响可用性（时长不同）
    },

    // 技师选择
    onTechnicianSelect(e: any) {
      const {technician, occupied} = e.currentTarget.dataset;
      if (occupied) {
        wx.showToast({title: '该技师当前时段已有安排', icon: 'none'});
        return;
      }
      this.setData({
        "consultationInfo.technician": technician,
      });
    },

    // 点钟选择
    onClockInSelect() {
      this.setData({
        "consultationInfo.isClockIn": !this.data.consultationInfo.isClockIn,
      });
    },

    // 备注输入
    onRemarksInput(e: any) {
      this.setData({
        "consultationInfo.remarks": e.detail.value,
      });
    },

    // 手机号输入
    onPhoneInput(e: any) {
      this.setData({
        "consultationInfo.phone": e.detail.value,
      });
    },

    // 券码输入
    onCouponCodeInput(e: any) {
      this.setData({
        "consultationInfo.couponCode": e.detail.value,
      });
    },

    // 券码平台选择
    onCouponPlatformSelect(e: any) {
      const platform = e.currentTarget.dataset.platform;
      // 如果点击已选中的平台，则取消选择
      const currentPlatform = this.data.consultationInfo.couponPlatform;
      this.setData({
        "consultationInfo.couponPlatform": currentPlatform === platform ? "" : platform,
      });
    },

    // 房间选择
    onRoomSelect(e: any) {
      const room = e.currentTarget.dataset.room;
      this.setData({
        "consultationInfo.room": room,
      });
    },

    // 按摩力度选择
    onMassageStrengthSelect(e: any) {
      const strength = e.currentTarget.dataset.strength;
      this.setData({
        "consultationInfo.massageStrength": strength,
      });
    },

    // 精油选择（单选）
    onEssentialOilSelect(e: any) {
      const oil = e.currentTarget.dataset.oil;
      this.setData({
        "consultationInfo.essentialOil": oil,
      });
    },

    // 加强部位选择（使用字段map控制）
    onBodyPartSelect(e: any) {
      const part = e.currentTarget.dataset.part;
      const selectedParts: Record<string, boolean> = {
        ...this.data.consultationInfo.selectedParts,
      };
      selectedParts[part] = !selectedParts[part];

      const updatedInfo = {
        ...this.data.consultationInfo,
        selectedParts: selectedParts,
      };

      this.setData({
        consultationInfo: updatedInfo,
      });
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
      const {
        consultationInfo,
        printerDeviceId,
        printerServiceId,
        printerCharacteristicId,
      } = this.data;

      // 构建打印内容
      const printContent = this.buildPrintContent(consultationInfo);

      // 转换为ArrayBuffer
      const buffer = new Uint8Array(GBK.encode(printContent)).buffer;

      // 发送打印数据
      wx.writeBLECharacteristicValue({
        deviceId: printerDeviceId,
        serviceId: printerServiceId,
        characteristicId: printerCharacteristicId,
        value: buffer,
        success: () => {
          wx.showToast({
            title: "打印成功",
            icon: "success",
          });
        },
        fail: (err) => {
          wx.showToast({
            title: "打印失败",
            icon: "none",
          });
          console.error("打印失败:", err);
        },
      });
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
            });
            wx.showToast({
              title: "咨询单已重置",
              icon: "success",
            });
          }
        },
      });
    },

    // 保存咨询单到缓存（支持新建和更新）
    saveConsultationToCache(consultation: ConsultationInfo, editId?: string) {
      try {
        const now = new Date();
        const currentDate = this.formatDate(now);
        const timestamp = now.toISOString();

        // 获取现有缓存数据
        const cachedData =
          (wx.getStorageSync("consultationHistory") as DailyConsultations) ||
          {};

        // 计算开始时间和结束时间
        const startTimeStr = formatTime(now, false);
        const projectDuration = parseProjectDuration(consultation.project);
        const totalDuration = projectDuration + 10; // 项目时长 + 10分钟
        const endTimeDate = new Date(now.getTime() + totalDuration * 60 * 1000);
        const endTimeStr = formatTime(endTimeDate, false);

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
            overtime: 0, // 初始化加班数
            startTime: startTimeStr, // 报钟时间
            endTime: endTimeStr, // 结束时间
          };

          // 确保当天的数组存在
          if (!cachedData[currentDate]) {
            cachedData[currentDate] = [];
          }

          // 添加新记录
          cachedData[currentDate].push(record);
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
    loadEditData(editId: string) {
      console.log("loadEditData", editId);
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
          // 设置表单数据和编辑ID
          this.setData({
            consultationInfo: {
              surname: foundRecord.surname,
              gender: foundRecord.gender,
              project: foundRecord.project,
              technician: foundRecord.technician,
              room: foundRecord.room,
              massageStrength: foundRecord.massageStrength,
              essentialOil: foundRecord.essentialOil,
              selectedParts: foundRecord.selectedParts,
              isClockIn: foundRecord.isClockIn,
              remarks: foundRecord.remarks,
              phone: foundRecord.phone || "",
              couponCode: foundRecord.couponCode || "",
              couponPlatform: foundRecord.couponPlatform || "",
            },
            editId: editId,
          });
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

    // 取消编辑
    cancelEdit() {
      wx.navigateBack();
    },

    // 格式化日期为 YYYY-MM-DD 格式
    formatDate(date: Date): string {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${ year }-${ month }-${ day }`;
    },

    // 清理超过30天的历史数据
    cleanupOldData(data: DailyConsultations) {
      const today = new Date();
      const thirtyDaysAgo = new Date(
        today.getTime() - 30 * 24 * 60 * 60 * 1000,
      );
      const cutoffDate = this.formatDate(thirtyDaysAgo);

      // 删除超过30天的日期键
      for (const date in data) {
        if (date < cutoffDate) {
          delete data[date];
        }
      }
    },

    // 报钟功能
    onClockIn() {
      const {consultationInfo, editId} = this.data;

      // 验证必填信息（与预览功能统一）
      if (!consultationInfo.gender) {
        wx.showToast({
          title: "请选择称呼",
          icon: "none",
        });
        return;
      }

      if (!consultationInfo.project) {
        wx.showToast({
          title: "请选择项目",
          icon: "none",
        });
        return;
      }

      if (!consultationInfo.technician) {
        wx.showToast({
          title: "请选择技师",
          icon: "none",
        });
        return;
      }

      if (!consultationInfo.room) {
        wx.showToast({
          title: "请选择房间",
          icon: "none",
        });
        return;
      }

      // 格式化上钟信息
      const clockInInfo = this.formatClockInInfo(consultationInfo);

      // 保存到缓存（支持编辑）
      const success = this.saveConsultationToCache(consultationInfo, editId);

      if (success) {
        // 如果是新纪录且是轮钟（!isClockIn），更新轮排顺序
        if (!editId && !consultationInfo.isClockIn) {
          this.updateRotationOrder(consultationInfo.technician);
        }

        // 复制到剪贴板
        wx.setClipboardData({
          data: clockInInfo,
          success: () => {
            wx.showToast({
              title: "上钟信息已复制",
              icon: "success",
            });
            // 刷新列表
            this.loadTechnicianList();
          },
          fail: (err) => {
            wx.showToast({
              title: "复制失败",
              icon: "none",
            });
            console.error("复制到剪贴板失败:", err);
          },
        });
      }
    },

    // 更新轮排顺序：将技师移到末尾
    updateRotationOrder(technicianName: string) {
      const now = new Date();
      const today = this.formatDate(now);
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
        console.log(`[Rotation] 技师 ${ technicianName } 已移至轮排末尾`);
      }
    },

    // 计算技师当日的报钟数量
    getTechnicianDailyCount(technician: string) {
      try {
        const currentDate = this.formatDate(new Date());
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

      // 添加备注信息（仅当有内容时显示）
      if (info.remarks) {
        content += `\n备注: ${ info.remarks }`;
      }

      content += "\n================\n";
      content += `打印时间: ${ formatTime(new Date(), false) }



      

`;

      return content;
    },
  },
});
