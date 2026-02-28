// 基础数据记录接口
interface BaseRecord {
  _id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 新增数据类型，省略 '_id', 'createdAt', 'updatedAt' 字段
 */
type Add<T> = T extends BaseRecord ? Omit<T, '_id' | 'createdAt' | 'updatedAt'> : never;
/**
 * 更新数据类型，省略 'createdAt', 'updatedAt', '_id' 字段
 */
type Update<T> = T extends BaseRecord ? Omit<T, '_id' | 'createdAt' | 'updatedAt'> : never;


// 支付方式类型
type PaymentMethod = 'meituan' | 'dianping' | 'douyin' | 'wechat' | 'alipay' | 'cash' | 'gaode' | 'free' | 'membership';


// 单笔支付记录
interface PaymentItem {
  method: PaymentMethod;
  amount: number; // 实付金额
  couponCode?: string;
}

// 结算信息
interface SettlementInfo {
  payments: PaymentItem[]; // 支付列表（支持组合支付）
  totalAmount: number; // 总金额
  couponCode?: string; // 券码
  settledAt: string; // 结算时间
}

// 定义咨询单数据结构
interface ConsultationInfo extends BaseRecord {
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
  extraTime: number;
  couponCode: string;
  couponPlatform: PaymentMethod;
  upgradeHimalayanSaltStone: boolean;
  date: string; // YYYY-MM-DD
  startTime: string; // 报钟时间（格式 HH:MM）
  endTime: string; // 结束时间（格式 HH:MM）
  licensePlate?: string; // 车牌号
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
  couponPlatform: PaymentMethod;
  upgradeHimalayanSaltStone: boolean;
  project: string;
}

// 定义带ID的咨询单数据结构（用于历史记录）
interface ConsultationRecord extends ConsultationInfo {
  isVoided: boolean; // 是否作废
  extraTime: number; // 加钟数（单位：半小时）
  overtime: number; // 加班数（单位：半小时）
  startTime: string; // 报钟时间（格式 HH:MM）
  endTime: string; // 结束时间（格式 HH:MM）
  settlement?: SettlementInfo; // 结算信息（选填）
  amount?: number;
  date: string; // YYYY-MM-DD
}

// 员工状态类型
type StaffStatus = "active" | "disabled";
type StaffGender = "male" | "female";

// 员工数据结构
interface StaffInfo extends BaseRecord {
  name: string;
  status: StaffStatus;
  gender: StaffGender;
  avatar: string;
  phone: string;
  weight: number;
}

// 班次类型
type ShiftType = "morning" | "evening" | "off" | "leave";

// 排班数据结构
interface ScheduleRecord extends BaseRecord {
  date: string; // YYYY-MM-DD
  staffId: string;
  shift: ShiftType;
}

// 预约数据结构
interface ReservationRecord extends BaseRecord {
  date: string; // YYYY-MM-DD
  customerName: string;
  gender: "male" | "female";
  phone: string;
  project: string;
  technicianId?: string; // 选填
  technicianName?: string; // 选填
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  isClockIn?: boolean; // 点钟标记
  status: "active" | "cancelled"; // 状态
}

// interface ConsultationRecord {
//   _id: string
//   date: string
//   surname: string
//   gender: 'male' | 'female'
//   project: string
//   room: string
//   technician: string
//   startTime: string
//   endTime: string
//   isVoided: boolean
//   isReservation: boolean
//   settlement?: any
// }

// interface ReservationRecord {
//   _id: string
//   date: string
//   customerName: string
//   gender: 'male' | 'female'
//   project: string
//   startTime: string
//   endTime: string
//   technicians: Array<{
//     _id: string
//     name: string
//   }>
//   technicianName?: string
//   technicianId?: string
// }

// 会员卡数据结构
interface MembershipCard extends BaseRecord {
  name: string; // 会员卡名称
  type: 'times' | 'value'; // 卡类型：times-次卡，value-储值卡
  originalPrice?: number; // 原价
  totalTimes?: number; // 总次数（次卡使用）
  balance?: number; // 余额（储值卡使用）
  project?: string; // 关联项目
  status: "active" | "disabled"; // 状态
}

// 顾客基础信息结构
interface CustomerRecord extends BaseRecord {
  phone: string;
  name: string;
  gender: 'male' | 'female' | '';
  responsibleTechnician: string;
  licensePlate: string;
  remarks: string;
}

// 顾客回访记录信息
interface CustomerVisit {
  _id: string;
  date: string;
  project: string;
  technician: string;
  room: string;
  amount?: number;
  isClockIn: boolean;
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
interface MembershipUsageRecord extends BaseRecord {
  cardId: string; // 会员卡ID
  cardName: string; // 会员卡名称
  date: string; // 使用日期
  customerName: string; // 顾客姓名
  project: string; // 使用项目
  technician: string; // 技师
  room: string; // 房间
  consultationId: string; // 关联的咨询单ID
}

interface Project extends BaseRecord {
  name: string;
  duration: number;
  price?: number;
  isEssentialOilOnly?: boolean;
  status: ItemStatus;
  needEssentialOil?: boolean;
  commission: number;
}

interface Room extends BaseRecord {
  name: string;
  status: ItemStatus;
}

type ItemStatus = 'normal' | 'disabled';

interface EssentialOil extends BaseRecord {
  name: string;
  effect: string;
  status: ItemStatus;
}

interface AppGlobalData {
  userInfo?: WechatMiniprogram.UserInfo;
  currentUser?: UserRecord | null;
  token?: string | null;
  projects: Project[];
  rooms: Room[];
  essentialOils: EssentialOil[];
  staffs: StaffInfo[];
  isDataLoaded: boolean;
  loadPromise: Promise<void> | null;
  loginPromise?: Promise<UserRecord>;
}

interface IAppOption<T extends Record<string, any> = AppGlobalData> {
  globalData: T;
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback;
  onLaunch?: () => void | Promise<void>;
  onShow?: (options: WechatMiniprogram.App.LaunchShowOption) => void;
  onHide?: () => void;
  onError?: (error: string) => void;
  loadGlobalData: () => Promise<void>;
  getProjects: () => Promise<Project[]>;
  getRooms: () => Promise<Room[]>;
  getEssentialOils: () => Promise<EssentialOil[]>;
  initLogin: () => Promise<void>;
  getStaffs: () => Promise<StaffInfo[]>;
  getActiveStaffs: () => Promise<StaffInfo[]>;
  getStaff: (id: string) => Promise<StaffInfo | null>;
  getRotationQueue: (date: string) => Promise<RotationQueue | null>;
  serveCustomer: (date: string, staffId: string, isClockIn: boolean) => Promise<void>;
  adjustRotationPosition: (date: string, fromIndex: number, toIndex: number) => Promise<RotationQueue | null>;
  getNextTechnician: (date: string) => Promise<RotationItem | null>;
}

interface StaffAvailability {
  _id: string;
  name: string;
  phone: string;
  isOccupied: boolean;
  occupiedReason?: string;
  isClockIn?: boolean; // 点钟标记
}

// 用户角色类型
type UserRole = 'admin' | 'cashier' | 'technician' | 'viewer';

// 用户权限配置
interface UserPermissions {
  // 页面权限
  canAccessIndex: boolean;
  canAccessCashier: boolean;
  canAccessHistory: boolean;
  canAccessStaff: boolean;
  canAccessCustomers: boolean;
  canAccessMembershipCards: boolean;
  canAccessDataManagement: boolean;
  canAccessScreensaver: boolean;
  canAccessAnalytics: boolean;
  canAccessStoreConfig: boolean;
  canAccessCalculator: boolean;
  // 按钮权限
  canVoidConsultation: boolean;
  canEditConsultation: boolean;
  canDeleteConsultation: boolean;
  canEditReservation: boolean;
  canCancelReservation: boolean;
  canManageStaff: boolean;
  canManageSchedule: boolean;
  canManageRooms: boolean;
  canExportData: boolean;
  canViewAllHistory: boolean;
  canCreateReservation: boolean;
  canPushRotation: boolean;
}

// 用户数据结构
interface UserRecord extends BaseRecord {
  openId: string;
  unionId?: string;
  nickName?: string;
  avatarUrl?: string;
  phone?: string;
  role: UserRole;
  status: 'active' | 'disabled';
  staffId?: string;
  staffName?: string;
  department?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

// 登录响应数据
interface LoginResponse {
  user: UserRecord;
  token: string;
  isNewUser: boolean;
}

interface RotationItem {
  _id: string;
  name: string;
  shift: ShiftType;
  shiftLabel: string;
  availableSlots?: string; // 可约时段
  weight: number; // 权重
}

interface RotationQueue extends BaseRecord {
  staffList: Array<StaffInfo&{
    lastServedTime?: string; // 上次服务时间
    orderCount?: number; // 服务次数
    staffId: string;
    shift: ShiftType;
  }>;
  currentIndex: number;
}

interface StaffTimeline {
  _id: string;
  name: string;
  shift: ShiftType;
  blocks: TimelineBlock[];
  availableSlots?: AvailableSlot[]; // 空闲时段
}

interface TimelineBlock {
  _id: string;
  customerName: string;
  startTime: string;
  endTime: string;
  project: string;
  room: string;
  left: string; // 距离左侧百分比
  width: string; // 宽度百分比
  isReservation?: boolean;
  isSettled?: boolean; // 是否已结算
  isInProgress?: boolean; // 是否进行中
  technician?: string; // 技师名称
}

interface AvailableSlot {
  left: string; // 距离左侧百分比
  width: string; // 宽度百分比
  durationMinutes: number; // 时长（分钟）
  displayText: string; // 显示文本
}