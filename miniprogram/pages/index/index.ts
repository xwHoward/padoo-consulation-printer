// index.ts
// 获取应用实例
const app = getApp<IAppOption>();

// 定义咨询单数据结构
interface ConsultationInfo {
  surname: string;
  gender: "male" | "female" | "";
  project: string;
  technician: string;
  room: string;
  massageStrength: "standard" | "soft" | "gravity" | "";
  essentialOil: string;
  selectedParts: Record<string, boolean>;
}

// 定义带ID的咨询单数据结构（用于历史记录）
interface ConsultationRecord extends ConsultationInfo {
  id: string; // 唯一标识符
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  isVoided: boolean; // 是否作废
}

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
};

Component({
  data: {
    consultationInfo: { ...DefaultConsultationInfo, selectedParts: {} },
    isPrinterConnected: false,
    printerDeviceId: "",
    printerServiceId: "",
    printerCharacteristicId: "",
    editId: "", // 正在编辑的记录ID
    showPreview: false, // 是否显示富文本预览
    previewHtml: "", // 富文本预览内容
  },

  // 组件生命周期函数，在组件实例进入页面节点树时执行
  attached() {
    // 获取页面参数
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const editId = (currentPage.options||{}).editId;

    if (editId) {
      // 加载编辑数据
      this.loadEditData(editId);
    }
  },

  methods: {
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
    },

    // 技师选择
    onTechnicianSelect(e: any) {
      const technician = e.currentTarget.dataset.technician;
      this.setData({
        "consultationInfo.technician": technician,
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
      const selectedParts = { ...this.data.consultationInfo.selectedParts };
      selectedParts[part] = !selectedParts[part];

      const updatedInfo = {
        ...this.data.consultationInfo,
        selectedParts: selectedParts,
      };

      this.setData({
        consultationInfo: updatedInfo,
      });
    },

    // 预览小票内容（富文本预览）
    previewReceipt() {
      const { consultationInfo } = this.data;

      // 简单验证 - 姓氏为选填，验证称呼、项目、技师和房间
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

      // 保存咨询单数据
      wx.setStorageSync("consultationInfo", consultationInfo);

      // 生成富文本预览内容
      const previewHtml = this.buildPreviewHtml(consultationInfo);

      // 显示富文本预览
      this.setData({
        previewHtml,
        showPreview: true,
      });
    },

    // 关闭预览
    closePreview() {
      this.setData({
        showPreview: false,
      });
    },

    // 在预览中打印
    printFromPreview() {
      this.closePreview();
      this.printConsultation();
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
      const {
        consultationInfo,
        printerDeviceId,
        printerServiceId,
        printerCharacteristicId,
      } = this.data;

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
              const discoveryListener = wx.onBluetoothDeviceFound((res) => {
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
                    wx.offBluetoothDeviceFound(discoveryListener);

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
      const buffer = this.stringToBuffer(printContent);

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

          // 保存到缓存（支持编辑）
          this.saveConsultationToCache(consultationInfo, this.data.editId);
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
              consultationInfo: { ...DefaultConsultationInfo, selectedParts: {} },

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

    // 格式化日期为 YYYY-MM-DD 格式
    formatDate(date: Date): string {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    },

    // 清理超过30天的历史数据
    cleanupOldData(data: DailyConsultations) {
      const today = new Date();
      const thirtyDaysAgo = new Date(
        today.getTime() - 30 * 24 * 60 * 60 * 1000
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
      const { consultationInfo } = this.data;

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
      this.saveConsultationToCache(consultationInfo, this.data.editId);

      // 复制到剪贴板
      wx.setClipboardData({
        data: clockInInfo,
        success: () => {
          wx.showToast({
            title: "上钟信息已复制",
            icon: "success",
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
          (record) => record.technician === technician && !record.isVoided
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
      const startTime = this.formatTime(currentTime);

      // 解析项目时长并计算结束时间
      const projectDuration = this.parseProjectDuration(info.project);
      const totalDuration = projectDuration + 10; // 项目时长 + 10分钟
      const endTime = new Date(
        currentTime.getTime() + totalDuration * 60 * 1000
      );
      const formattedEndTime = this.formatTime(endTime);

      // 获取技师当日报钟数量
      const dailyCount = this.getTechnicianDailyCount(info.technician);

      let formattedInfo = "";
      formattedInfo += `顾客: ${info.surname}${
        info.gender === "male" ? "先生" : "女士"
      }\n`;
      formattedInfo += `项目: ${info.project}\n`;
      formattedInfo += `技师: ${info.technician}(${dailyCount})\n`;
      formattedInfo += `房间: ${info.room}\n`;
      formattedInfo += `时间: ${startTime} - ${formattedEndTime}`;
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
        arm: "胳膊",
        abdomen: "腹部",
        waist: "腰部",
        thigh: "大腿",
        calf: "小腿",
      };

      let content = "\n趴岛 SPA&MASSAGE\n";
      content += "用户咨询单\n";
      content += "==========\n";
      content += `顾客: ${info.surname}${
        info.gender === "male" ? "先生" : "女士"
      }\n`;
      content += `项目: ${info.project}\n`;
      content += `技师: ${info.technician}\n`;
      content += `房间: ${info.room}\n`;
      content += "\n按摩力度:\n";
      content += `  ${strengthMap[info.massageStrength] || "未选择"}\n`;
      content += "\n精油选择:\n";
      if (info.essentialOil) {
        content += `  ${oilMap[info.essentialOil]}\n`;
      } else {
        content += "  无\n";
      }
      content += "\n加强部位:\n";
      const selectedPartsArray = Object.keys(info.selectedParts).filter(
        (key) => info.selectedParts[key]
      );
      if (selectedPartsArray.length > 0) {
        selectedPartsArray.forEach((part) => {
          content += `  ${partMap[part]}\n`;
        });
      } else {
        content += "  无\n";
      }
      content += "\n==========\n";
      content += `打印时间: ${this.formatTime(new Date())}\n\n\n\n`;

      return content;
    },

    // 构建富文本预览内容（HTML格式）
    buildPreviewHtml(info: ConsultationInfo) {
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
        arm: "胳膊",
        abdomen: "腹部",
        waist: "腰部",
        thigh: "大腿",
        calf: "小腿",
      };

      // 转换为HTML格式，模拟热敏小票效果
      let html = `
        <div class="receipt-container">
          <div class="receipt-content">
            <div class="receipt-title">趴岛 SPA&MASSAGE</div>
            <div class="receipt-subtitle">用户咨询单</div>
            <div class="receipt-divider">===============</div>
            <div class="receipt-item"><span class="strong">顾客:</span> ${info.surname}${
        info.gender === "male" ? "先生" : "女士"
      }</div>
            <div class="receipt-item"><span class="strong">项目:</span> ${
              info.project
            }</div>
            <div class="receipt-item"><span class="strong">技师:</span> ${
              info.technician
            }</div>
            <div class="receipt-item"><span class="strong">房间:</span> ${info.room}</div>
            
            <div class="receipt-item">
              <span class="strong">按摩力度:</span>
              ${strengthMap[info.massageStrength] || "未选择"}
            </div>
            
            <div class="receipt-item">
              <span class="strong">精油选择:</span>
              ${info.essentialOil ? oilMap[info.essentialOil] : "无"}
            </div>
            
            <div class="receipt-item">
              <span class="strong">加强部位:</span>
      `;

      const selectedPartsArray = Object.keys(info.selectedParts).filter(
        (key) => info.selectedParts[key]
      );

      if (selectedPartsArray.length > 0) {
        html += selectedPartsArray
          .map(
            (part) => `
          ${partMap[part]}
        `
          )
          .join("");
      } else {
        html += `无`;
      }

      html += `
              </div>
            <div class="receipt-divider">===============</div>
            <div class="receipt-time">打印时间: ${this.formatTime(
              new Date()
            )}</div>
            <div class="receipt-padding"></div>
          </div>
        </div>
      `;

      // 添加CSS样式
      html =
        `
        <style>
          .receipt-container {
            display: flex;
            justify-content: center;
            background-color: #f5f5f5;
          }
          .receipt-content {
            width: 600rpx;
            max-width: 100%;
            background-color: white;
            padding: 30rpx;
            border-radius: 10rpx;
            box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.1);
            font-family: "Courier New", monospace;
            font-size: 28rpx;
            line-height: 1.6;
            color: #333;
          }
          .receipt-title {
            text-align: center;
            font-size: 36rpx;
            font-weight: bold;
            margin-bottom: 10rpx;
          }
          .receipt-subtitle {
            text-align: center;
            font-size: 30rpx;
            margin-bottom: 20rpx;
          }
          .receipt-divider {
            text-align: center;
            margin: 20rpx 0;
            font-weight: bold;
          }
          .receipt-item {
            margin-bottom: 15rpx;
          }
          .receipt-item strong {
            display: inline-block;
            width: 80px;
            font-weight: bold;
            margin-right: 10px;
          }
          .receipt-time {
            text-align: center;
            margin-top: 20rpx;
            color: #666;
          }
          .receipt-padding {
            height: 60rpx;
          }
        </style>
      ` + html;

      return html;
    },

    // 解析项目时长（分钟）
    parseProjectDuration(projectName: string): number {
      const match = projectName.match(/(\d+)min/);
      return match ? parseInt(match[1]) : 0;
    },

    // 格式化时间为 MM-dd HH:mm 格式
    formatTime(date: Date): string {
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${month}-${day} ${hours}:${minutes}`;
    },

    // 字符串转ArrayBuffer
    stringToBuffer(str: string) {
      const array = new Uint8Array(str.length);
      for (let i = 0, l = str.length; i < l; i++) {
        array[i] = str.charCodeAt(i);
      }
      return array.buffer;
    },
  },
});
