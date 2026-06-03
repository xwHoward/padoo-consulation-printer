export interface ConsultationRecord {
  _id: string;
  date: string;
  startTime: string;
  endTime: string;
  surname: string;
  gender: 'male' | 'female';
  project: string;
  technician: string;
  room: string;
  massageStrength: string;
  essentialOil: string;
  selectedParts: Record<string, boolean>;
  isClockIn: boolean;
  isVoided: boolean;
  isExtraTime?: boolean;
  remarks: string;
  phone: string;
  couponCode: string;
  couponPlatform: string;
  extraTime: number;
  overtime: number;
  guasha: boolean;
  settlement?: SettlementInfo;
  createdAt?: string;
  updatedAt?: string;
}

export interface SettlementInfo {
  payments: PaymentItem[];
  totalAmount: number;
  couponCode?: string;
  settledAt: string;
}

export interface PaymentItem {
  method: PaymentMethod;
  amount: number;
  couponCode?: string;
}

export type PaymentMethod = 'meituan' | 'dianping' | 'douyin' | 'wechat' | 'alipay' | 'cash' | 'gaode' | 'free' | 'membership';

export interface ReservationRecord {
  _id: string;
  date: string;
  customerName: string;
  gender: 'male' | 'female';
  project: string;
  phone: string;
  startTime: string;
  technicianId?: string;
  technicianName?: string;
  isClockIn?: boolean;
  isRenewal?: boolean;
  status: 'active' | 'cancelled';
  groupKey?: string;
  requirementType?: 'specific' | 'gender';
  genderRequirement?: string;
  requiredMaleCount?: number;
  requiredFemaleCount?: number;
  isFulfilled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentMethodItem {
  key: string;
  label: string;
  selected: boolean;
  amount: string;
  couponCode?: string;
}

export interface StaffInfo {
  _id: string;
  name: string;
  phone?: string;
  gender?: string;
  status: string;
  wechatWorkId?: string;
}

export interface StaffAvailability {
  _id: string;
  name: string;
  phone?: string;
  gender?: string;
  isOccupied: boolean;
  isSelected: boolean;
}

export interface Project {
  _id: string;
  name: string;
  price?: number;
  needEssentialOil?: boolean;
}

export interface Room {
  _id: string;
  name: string;
  status: string;
}

export interface CustomerRecord {
  _id: string;
  name: string;
  phone?: string;
  responsibleTechnician?: string;
}

export interface CustomerMembership {
  _id: string;
  cardId: string;
  cardName: string;
  customerPhone: string;
  customerName: string;
  remainingTimes: number;
  status: string;
}

export interface MembershipUsageRecord {
  _id: string;
  cardId: string;
  cardName: string;
  date: string;
  customerName: string;
  project: string;
  technician: string;
  room: string;
  consultationId: string;
}

export const COUPON_PLATFORM_NAMES: Record<string, string> = {
  meituan: '美团',
  dianping: '大众点评',
  douyin: '抖音',
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  gaode: '高德',
  free: '免单',
  membership: '划卡',
};

export const COUPON_PLATFORM_KEYS = Object.keys(COUPON_PLATFORM_NAMES);

export function formatSettlementTime(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
