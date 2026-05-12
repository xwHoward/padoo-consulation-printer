// 基础数据记录接口
interface BaseRecord {
  _id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 可变字段类型，省略系统管理的字段
 */
type MutableFields<T extends BaseRecord> = Omit<T, '_id' | 'createdAt' | 'updatedAt'>;

/**
 * 新增数据类型，省略 '_id', 'createdAt', 'updatedAt' 字段
 */
type Add<T> = T extends BaseRecord ? MutableFields<T> : never;

/**
 * 更新数据类型，与 Add 类型相同
 */
type Update<T> = Add<T>;


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
  gender: "male" | "female";
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
  date: string; // YYYY-MM-DD
  startTime: string; // 报钟时间（格式 HH:MM）
  endTime: string; // 结束时间（格式 HH:MM）
  licensePlate?: string; // 车牌号
}

/**
 * 双人模式顾客信息，从ConsultationInfo中提取公共字段
 */
type GuestInfoFields = Pick<ConsultationInfo, 
  'surname' | 'gender' | 'selectedParts' | 'essentialOil' | 'remarks' | 
  'technician' | 'isClockIn' | 'couponCode' | 'couponPlatform' | 'project'
>;

interface GuestInfo extends GuestInfoFields {
  massageStrength: 'standard' | 'soft' | 'gravity'; // 双人模式不允许空值
}

// 定义带ID的咨询单数据结构（用于历史记录）
interface ConsultationRecord extends ConsultationInfo {
  isVoided: boolean; // 是否作废
  extraTime: number; // 加钟数（单位：半小时）
  overtime: number; // 加班数（单位：半小时）
  guasha: boolean; // 是否刮痧
  guashaTime?: number; // 刮痧时长（单位：分钟）
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
  wechatWorkId: string;
}

// 班次类型
type ShiftType = "morning" | "evening" | "off" | "leave" | "overtime";

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
  status: "active" | "cancelled" | 'arrived'; // 状态
  genderRequirement?: "male" | "female"; // 兼容旧数据
  
  // 新增字段 - 完整记录预约需求约束
  requirementType?: 'specific' | 'gender'; // 预约类型：指定技师/性别需求
  requiredMaleCount?: number; // 需要的男技师数量
  requiredFemaleCount?: number; // 需要的女技师数量
  rearrangeConflict?: boolean; // 是否重排冲突
  groupKey?: string; // 预约组标识（同组预约共享同一key）
}


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
  isVoided: boolean;
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
  salesStaff: string[]; // 销售员工（单个技师或多个技师）
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
  checkUpdate: () => void;
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
  wechatWorkId?: string;
  isOccupied: boolean;
  occupiedReason?: string;
  hasNonClockInConflict?: boolean; // 非点钟预约冲突标记
  isClockIn?: boolean; // 点钟标记
  isSelected?: boolean; // 多选时的选中状态
  gender: 'male' | 'female'; // 性别
}

// 用户角色类型
type UserRole = 'admin' | 'cashier' | 'technician' | 'viewer' | 'brand';

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
  gender: 'male' | 'female';
  shift: ShiftType;
  availableSlots?: string; // 可约时段
}

interface RotationQueue extends BaseRecord {
  staffList: Array<StaffInfo & {
    lastServedTime?: string; // 上次服务时间
    orderCount?: number; // 服务次数
    staffId: string;
    shift: ShiftType;
    position: number; // 队列位置
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

interface IndexPage<D> {
  data: {
    editId?: string;
    consultationInfo: Omit<ConsultationInfo, "_id" | "createdAt" | "updatedAt"> & { selectedParts: {} };
    currentReservationIds: string[];
    projects: Project[];
    isDualMode: boolean;
    activeGuest: number;
    guest1Info: GuestInfo;
    guest2Info: GuestInfo;
    timePickerModal: {
      currentTime: string;
    };
    licensePlate: string;
    clockInModal: {
      content: string;
    };
    [key: string]: any;
  };
  dataLoader: D | null;
  setData: (data: Record<string, any>) => void;
  searchCustomer: () => void;
  doDualClockIn: (startTimeDate?: Date, editId?: string) => Promise<void>;
  saveConsultation: (consultation: Add<ConsultationInfo>, editId?: string) => Promise<boolean>;
  sendToWechatWebhook: (content: string) => Promise<boolean>;
  resetForm: () => void;
}

// interface CashierPage {
//   data: ;
// }

type CashierPage = WechatMiniprogram.Page.Instance<{
  reserveForm: {
    _id: string;
    customerName: string;
    project: string;
    startTime: string;
    endTime?: string;
    date: string;
    gender: 'male' | 'female';
    phone: string;
    requirementType: 'specific' | 'gender';
    selectedTechnicians: {
      _id: string;
      name: string;
      phone: string;
      isClockIn: boolean;
    }[];
    genderRequirement: { male: number; female: number; };
    technicianId: string;
    technicianName: string;
  };
  pushModal: {
    show: boolean;
    loading: boolean;
    type: 'create' | 'cancel';
    reservationData: Add<ReservationRecord> & {
      technicians: {
        _id: string,
        name: string,
        phone: string,
        isClockIn: boolean;
        wechatWorkId: string;
      }[]
    } | null;
  };
  originalReservation: ReservationRecord | null;
  projects: Project[];
  selectedDate: string;
  settlementRecordId: string;
  settlementCouponCode?: string;
  paymentMethods: {
    key: string; selected: boolean; amount: string; couponCode: string; label: string;
  }[];
  matchedCustomer: CustomerRecord | null;
}, {

  //   setData: (data: Record<string, any>) => void;
  checkStaffAvailability: () => undefined | Promise<void>;
}>

interface LotteryPrize extends BaseRecord {
  name: string;
  type: 'product' | 'discount' | 'coupon' | 'service';
  value: number;
  probability: number;
  color: string;
  icon?: string;
  description?: string;
  stock?: number;
  status: ItemStatus;
}

interface LotteryRecord extends BaseRecord {
  prizeId: string;
  prizeName: string;
  prizeType: string;
  prizeValue: number;
  userId?: string;
  userName?: string;
}

type ExpenseCategory = 'utilities' | 'supplies' | 'rent' | 'salary' | 'maintenance' | 'other';

interface StoreExpense extends BaseRecord {
  category: ExpenseCategory;
  content: string;
  amount: number;
  date: string;
  remarks?: string;
}

interface TechnicianSalary {
  technicianId: string;
  technicianName: string;
  /** 项目数，包含加钟、刮痧 */
  projectCount: number;
  year: number;
  month: number;
  /** 项目提成 */
  commission: number;
  /** 加班时长 */
  overtime: number;
  /** 加钟个数 */
  extraTime: number;
  /** 全勤 */
  attendanceBonus: number;
  /** 点钟数 */
  clockIn: number;
  /** 餐补 */
  mealAllowance: number;
  /** 销售提成 */
  salesCommission: number;
  totalSalary: number;
  workDays: number;
  offDays: number;
  leaveDays: number;
}


interface QuickReservation {
  time: string;
  staffNames: string[];
}