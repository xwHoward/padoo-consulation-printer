// 基础数据记录接口
interface BaseRecord {
	id: string;
	createdAt: string;
	updatedAt: string;
}

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
  isClockIn: boolean;
  remarks: string;
  phone: string;
  couponCode: string;
  couponPlatform: "meituan" | "dianping" | "douyin" | "";
  upgradeHimalayanSaltStone: boolean;
}

interface GuestInfo {
  surname: string;
  gender: 'male' | 'female';
  selectedParts: Record<string, boolean>;
  massageStrength: 'standard' | 'soft' | 'gravity';
  essentialOil: string;
  remarks: string;
  technician: string;
  isClockIn: boolean;
  couponCode: string;
  couponPlatform: '' | 'meituan' | 'dianping' | 'douyin';
  upgradeHimalayanSaltStone: boolean;
  project: string;
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

// 会员卡数据结构
interface MembershipCard extends BaseRecord {
  name: string; // 会员卡名称
  originalPrice: number; // 原价
  remainingTimes: number; // 剩余次数
  project: string; // 关联项目
  status: "active" | "disabled"; // 状态
}

// 顾客会员卡关联数据结构
interface CustomerMembership extends BaseRecord {
  customerId: string; // 顾客ID
  customerName: string; // 顾客姓名
  customerPhone: string; // 顾客手机号
  cardId: string; // 会员卡ID
  cardName: string; // 会员卡名称
  originalPrice: number; // 原价
  paidAmount: number; // 实付金额
  remainingTimes: number; // 剩余次数
  project: string; // 项目
  salesStaff: string; // 销售员工
  remarks: string; // 备注
  status: "active" | "disabled"; // 状态
}

// 会员卡使用记录
interface MembershipUsageRecord {
  id: string;
  cardId: string; // 会员卡ID
  cardName: string; // 会员卡名称
  date: string; // 使用日期
  customerName: string; // 顾客姓名
  project: string; // 使用项目
  technician: string; // 技师
  room: string; // 房间
  consultationId: string; // 关联的咨询单ID
  createdAt: string; // 创建时间
}