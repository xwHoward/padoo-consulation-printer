// 支付方式类型
type PaymentMethod = "meituan" | "dianping" | "douyin" | "wechat" | "alipay" | "cash" | "free";

// 单笔支付记录
interface PaymentItem {
	method: PaymentMethod;
	amount: number; // 实付金额
}

// 结算信息
interface SettlementInfo {
	payments: PaymentItem[]; // 支付列表（支持组合支付）
	totalAmount: number; // 总金额
	couponCode?: string; // 券码
	settledAt: string; // 结算时间
}

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
  isClockIn: boolean; // 是否点钟
  remarks: string; // 备注信息
  phone: string; // 手机号（选填）
  couponCode: string; // 券码（选填，纯数字）
  couponPlatform: "meituan" | "dianping" | "douyin" | ""; // 券码平台
}

// 定义带ID的咨询单数据结构（用于历史记录）
interface ConsultationRecord extends ConsultationInfo {
  id: string; // 唯一标识符
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  isVoided: boolean; // 是否作废
  extraTime: number; // 加钟数（单位：半小时）
  overtime: number; // 加班数（单位：半小时）
  startTime: string; // 报钟时间（格式 HH:MM）
  endTime: string; // 结束时间（格式 HH:MM）
  settlement?: SettlementInfo; // 结算信息（选填）
}

// 员工状态类型
type StaffStatus = "active" | "disabled";

// 员工数据结构
interface StaffInfo {
  id: string;
  name: string;
  status: StaffStatus;
  createdAt: string;
  updatedAt: string;
}

// 班次类型
type ShiftType = "morning" | "evening" | "off" | "leave";

// 排班数据结构
interface ScheduleRecord {
  id: string;
  date: string; // YYYY-MM-DD
  staffId: string;
  shift: ShiftType;
  createdAt: string;
  updatedAt: string;
}

// 预约数据结构
interface ReservationRecord {
  id: string;
  date: string; // YYYY-MM-DD
  customerName: string;
  gender: "male" | "female";
  phone: string;
  project: string;
  technicianId?: string; // 选填
  technicianName?: string; // 选填
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  createdAt: string;
  updatedAt: string;
}