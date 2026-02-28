import { cloudDb } from "../utils/cloud-db";
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

    content += "\n================\n";

    content += `打印时间: ${formatTime(new Date(), false)}

      



`;

    return content;
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

  formatConsultationInfo(info: Add<ConsultationInfo>): string {
    const strengthMap: Record<string, string> = {
      standard: "标准",
      soft: "轻柔",
      gravity: "重力",
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

    let formattedInfo = `姓氏: ${info.surname}\n`;
    formattedInfo += `性别: ${info.gender === "male" ? "男" : "女"}\n`;
    formattedInfo += `项目: ${info.project}\n`;
    formattedInfo += `技师: ${info.technician}${info.isClockIn ? "[点钟]" : ""}\n`;
    formattedInfo += `房间: ${info.room}\n`;
    formattedInfo += `力度: ${strengthMap[info.massageStrength] || "未选择"}\n`;
    formattedInfo += `精油: ${this.oils.find((oil) => oil._id === info.essentialOil)?.name || "未选择"}\n`;

    formattedInfo += "加强部位:";
    const selectedPartsArray = Object.keys(info.selectedParts).filter(
      (key) => info.selectedParts[key],
    );
    if (selectedPartsArray.length > 0) {
      selectedPartsArray.forEach((part) => {
        formattedInfo += `${partMap[part]}  `;
      });
    } else {
      formattedInfo += "无";
    }

    if (info.remarks) {
      formattedInfo += `\n备注: ${info.remarks}`;
    }

    return formattedInfo;
  }
}

