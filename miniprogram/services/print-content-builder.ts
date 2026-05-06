import { cloudDb, Collections } from "../utils/cloud-db";
import { formatTime } from "../utils/util";

interface PrintContentOptions {
  info: Add<ConsultationInfo>;
  isEssentialOilOnly?: boolean;
  needEssentialOil?: boolean;
}

export class PrintContentBuilder {
  private readonly strengthMap: Record<string, string> = {
    standard: "标准",
    soft: "轻柔",
    gravity: "重力",
  };

  private readonly partMap: Record<string, string> = {
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

  constructor(private readonly oils: EssentialOil[]) { }

  async buildContent(options: PrintContentOptions): Promise<string> {
    const { info, isEssentialOilOnly = false, needEssentialOil = true } = options;
    const ESC = String.fromCharCode(0x1b);
    const setLargeFont = ESC + "!" + String.fromCharCode(0x30);

    let content = setLargeFont + "\n\n\n\n趴岛 SPA&MASSAGE\n";
    content += `${info.surname}${info.gender === "male" ? "先生" : "女士"}咨询单\n`;
    content += "================\n";
    content += `项目: ${info.project}\n`;

    const dailyCount = await this.getDailyCount(info);
    content += `技师: ${info.technician}(${dailyCount})${info.isClockIn ? "[点]" : ""}\n`;
    content += `房间: ${info.room}\n`;
    content += `电话: ${info.phone || "未填写"}\n`;
    content += `力度:${this.strengthMap[info.massageStrength] || "未选择"}\n`;

    if (isEssentialOilOnly) {
      content += "精油: 项目专属精油\n";
    } else if (needEssentialOil) {
      content += `精油:${this.oils.find((oil) => oil._id === info.essentialOil)?.name || "未选择"}\n`;
    }

    content += "加强部位:";
    const selectedPartsArray = Object.keys(info.selectedParts).filter(
      (key) => info.selectedParts[key],
    );

    if (selectedPartsArray.length > 0) {
      selectedPartsArray.forEach((part) => {
        content += `${this.partMap[part]}  `;
      });
    } else {
      content += "无";
    }

    if (info.remarks) {
      content += `\n备注: ${info.remarks}`;
    }

    // 添加顾客历史信息备注
    const historyRemark = await this.buildCustomerHistoryRemark(info.phone);
    if (historyRemark) {
      content += historyRemark;
    }

    content += "\n================\n";

    content += `打印时间: ${formatTime(new Date(), false)}
      

      

`;

    return content;
  }

  private async buildCustomerHistoryRemark(phone: string): Promise<string> {
    try {
      if (!phone) return '';

      const today = new Date().toISOString().split('T')[0];
      
      // 查询该手机号的所有咨询单
      const records = (await cloudDb.find<ConsultationRecord>(Collections.CONSULTATION, { phone, isVoided: false })).filter(r => r.date < today)
        .sort((a, b) => b.date.localeCompare(a.date));

      // 过滤：排除今天、排除作废，按日期降序取最近一次
      const lastRecord = records[0];

      if (!lastRecord) return '';

      // 计算距今天数
      const diffDays = Math.round(
        (new Date(today).getTime() - new Date(lastRecord.date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // 需加强部位（selectedParts 为 true 的部位）
      const parts = Object.entries(lastRecord.selectedParts || {})
        .filter(([, active]) => active)
        .map(([key]) => this.partMap[key] || key)
        .join('、');

      const partsText = parts || '无';
      return `\n历史: 老客第${records.length + 1}次，上次${diffDays}天前，加强部位:${partsText}，技师:${lastRecord.technician || '无'}`;
    } catch {
      return '';
    }
  }

  private async getDailyCount(info: Add<ConsultationInfo>): Promise<number> {
    if (!info.date) {
      return 1;
    }

    try {
      const records = await cloudDb.getConsultationsByDate<ConsultationRecord>(info.date) as ConsultationRecord[];
      return records.filter(
        (record: ConsultationRecord) => record.technician === info.technician && !record.isVoided,
      ).length + 1;
    } catch (error) {
      return 1;
    }
  }
}

