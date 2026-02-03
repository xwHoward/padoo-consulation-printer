const GBK = require("gbk.js");
interface PrinterState {
  isPrinterConnected: boolean;
  printerDeviceId: string;
  printerServiceId: string;
  printerCharacteristicId: string;
}


class PrinterService {
  private state: PrinterState = {
    isPrinterConnected: false,
    printerDeviceId: "",
    printerServiceId: "",
    printerCharacteristicId: ""
  };

  private connectingPromise: Promise<boolean> | null = null;

  getState(): PrinterState {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.state.isPrinterConnected &&
           !!this.state.printerDeviceId &&
           !!this.state.printerServiceId &&
           !!this.state.printerCharacteristicId;
  }

  async connectBluetooth(): Promise<boolean> {
    return new Promise((resolve) => {
      wx.showLoading({
        title: "正在搜索打印机...",
      });

      wx.openBluetoothAdapter({
        success: () => {
          wx.startBluetoothDevicesDiscovery({
            services: [],
            success: () => {
              const deviceFoundListener = (res: WechatMiniprogram.OnBluetoothDeviceFoundListenerResult) => {
                const devices = res.devices;
                for (const device of devices) {
                  if (
                    device.name &&
                    (device.name.includes("Printer") ||
                      device.name.includes("打印机"))
                  ) {
                    wx.stopBluetoothDevicesDiscovery();
                    wx.offBluetoothDeviceFound(deviceFoundListener);
                    this.connectToDevice(device.deviceId).then(resolve);
                    return;
                  }
                }
              };

              wx.onBluetoothDeviceFound(deviceFoundListener);

              setTimeout(() => {
                wx.stopBluetoothDevicesDiscovery();
                wx.offBluetoothDeviceFound(deviceFoundListener);
                wx.hideLoading();
                wx.showToast({
                  title: "未找到打印机",
                  icon: "none",
                });
                resolve(false);
              }, 10000);
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({
                title: "搜索蓝牙设备失败",
                icon: "none",
              });
              console.error("搜索蓝牙设备失败:", err);
              resolve(false);
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
          resolve(false);
        },
      });
    });
  }

  private async connectToDevice(deviceId: string): Promise<boolean> {
    return new Promise((resolve) => {
      wx.createBLEConnection({
        deviceId,
        success: () => {
          this.state.isPrinterConnected = true;
          this.state.printerDeviceId = deviceId;
          this.getDeviceServices(deviceId).then(resolve);
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: "连接打印机失败",
            icon: "none",
          });
          console.error("连接打印机失败:", err);
          resolve(false);
        },
      });
    });
  }

  private async getDeviceServices(deviceId: string): Promise<boolean> {
    return new Promise((resolve) => {
      wx.getBLEDeviceServices({
        deviceId,
        success: (res) => {
          const serviceId = res.services[0]?.uuid;
          if (!serviceId) {
            wx.hideLoading();
            wx.showToast({
              title: "未找到打印机服务",
              icon: "none",
            });
            resolve(false);
            return;
          }

          this.state.printerServiceId = serviceId;
          this.getDeviceCharacteristics(deviceId, serviceId).then(resolve);
        },
        fail: (err) => {
          wx.hideLoading();
          console.error("获取设备服务失败:", err);
          wx.showToast({
            title: "获取服务失败",
            icon: "none",
          });
          resolve(false);
        },
      });
    });
  }

  private async getDeviceCharacteristics(deviceId: string, serviceId: string): Promise<boolean> {
    return new Promise((resolve) => {
      wx.getBLEDeviceCharacteristics({
        deviceId,
        serviceId,
        success: (res) => {
          const writeCharacteristic = res.characteristics.find((char) => char.properties.write);
          if (!writeCharacteristic) {
            wx.hideLoading();
            wx.showToast({
              title: "未找到写入特征",
              icon: "none",
            });
            resolve(false);
            return;
          }

          this.state.printerCharacteristicId = writeCharacteristic.uuid;
          wx.hideLoading();
          wx.showToast({
            title: "打印机连接成功",
            icon: "success",
          });
          resolve(true);
        },
        fail: (err) => {
          wx.hideLoading();
          console.error("获取服务特征失败:", err);
          wx.showToast({
            title: "获取特征失败",
            icon: "none",
          });
          resolve(false);
        },
      });
    });
  }

  async ensureConnected(): Promise<boolean> {
    if (this.isConnected()) {
      return true;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = this.connectBluetooth();
    const result = await this.connectingPromise;
    this.connectingPromise = null;
    return result;
  }

  async print(content: string): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) {
      wx.showToast({
        title: "打印机未连接",
        icon: "none",
      });
      return false;
    }

    return this.printContent(content);
  }

  async printMultiple(contents: string[]): Promise<boolean> {
    const connected = await this.ensureConnected();
    if (!connected) {
      wx.showToast({
        title: "打印机未连接",
        icon: "none",
      });
      return false;
    }

    for (let i = 0; i < contents.length; i++) {
      const success = await this.printContent(contents[i]);
      if (!success) {
        return false;
      }
      if (i < contents.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const msg = contents.length > 1 ? `已打印${contents.length}张单据` : '打印成功';
    wx.showToast({ title: msg, icon: 'success' });
    return true;
  }

  private printContent(content: string): Promise<boolean> {
    return new Promise((resolve) => {
      const { printerDeviceId, printerServiceId, printerCharacteristicId } = this.state;
      const uint8Array = new Uint8Array(GBK.encode(content));
      const chunkSize = 20;
      let offset = 0;

      const writeNextChunk = () => {
        if (offset >= uint8Array.length) {
          resolve(true);
          return;
        }

        const end = Math.min(offset + chunkSize, uint8Array.length);
        const chunk = uint8Array.slice(offset, end).buffer;

        wx.writeBLECharacteristicValue({
          deviceId: printerDeviceId,
          serviceId: printerServiceId,
          characteristicId: printerCharacteristicId,
          value: chunk,
          success: () => {
            offset += chunkSize;
            setTimeout(writeNextChunk, 20);
          },
          fail: (err) => {
            wx.showToast({ title: '打印失败', icon: 'none' });
            console.error('分片打印失败:', err);
            resolve(false);
          },
        });
      };

      writeNextChunk();
    });
  }

  async disconnect(): Promise<void> {
    if (this.state.printerDeviceId) {
      try {
        await wx.closeBLEConnection({
          deviceId: this.state.printerDeviceId
        });
      } catch (err) {
        console.error("断开蓝牙连接失败:", err);
      }
    }

    try {
      await wx.stopBluetoothDevicesDiscovery();
      await wx.closeBluetoothAdapter();
    } catch (err) {
      console.error("关闭蓝牙适配器失败:", err);
    }

    this.state = {
      isPrinterConnected: false,
      printerDeviceId: "",
      printerServiceId: "",
      printerCharacteristicId: ""
    };
    this.connectingPromise = null;
  }
}

export const printerService = new PrinterService();
