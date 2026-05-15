export const MASSAGE_STRENGTHS = [
	{ _id: 'standard', name: '标准 STANDARD' },
	{ _id: 'soft', name: '轻柔 SOFT' },
	{ _id: 'gravity', name: '重力 STRONG' }
];

export const GENDERS = [
	{ _id: 'male', name: '先生' },
	{ _id: 'female', name: '女士' }
];

export const COUPON_PLATFORMS = [
	{ _id: 'meituan', name: '美', },
	{ _id: 'dianping', name: '大', },
	{ _id: 'douyin', name: '抖', },
	{ _id: 'wechat', name: '微', },
	{ _id: 'alipay', name: '支', },
	{ _id: 'cash', name: '现', },
	{ _id: 'gaode', name: '高', },
	{ _id: 'free', name: '免', },
	{ _id: 'membership', name: '卡', },
];

export const SHIFT_TYPES = ['morning', 'evening', 'overtime', 'off', 'leave'] as const;
export type ShiftType = typeof SHIFT_TYPES[number];

export const SHIFT_NAMES: Record<ShiftType, string> = {
	morning: '早班',
	evening: '晚班',
	overtime: '加班',
	off: '休息',
	leave: '请假'
};

export const SHIFT_START_TIME: Record<ShiftType, string> = {
	morning: '12:00',
	evening: '13:00',
	overtime: '00:00',
	off: '',
	leave: ''
};

export const SHIFT_END_TIME: Record<ShiftType, string> = {
	morning: '22:00',
	evening: '23:00',
	overtime: '23:59',
	off: '',
	leave: ''
};

export const DEFAULT_SHIFT: ShiftType = 'evening';

export const OVERTIME_DURATION_MAP: Record<number, number> = {
	60: 1,
	70: 1,
	80: 1,
	90: 1.5,
	120: 2
};

export function calculateOvertimeHours(duration: number): number {
	if (OVERTIME_DURATION_MAP[duration] !== undefined) {
		return OVERTIME_DURATION_MAP[duration];
	}
	return Math.round(duration / 60 * 10) / 10;
}

/** 身体部位中英文映射 */
export const BODY_PART_MAP: Record<string, string> = {
	head: '头部',
	neck: '颈部',
	shoulder: '肩部',
	back: '后背',
	arm: '手臂',
	abdomen: '腹部',
	waist: '腰部',
	thigh: '大腿',
	calf: '小腿'
};

/** 支付平台完整名称映射 */
export const COUPON_PLATFORM_NAMES: Record<string, string> = {
	meituan: '美团',
	dianping: '大众点评',
	douyin: '抖音',
	wechat: '微信',
	alipay: '支付宝',
	cash: '现金',
	gaode: '高德',
	free: '免单',
	membership: '划卡'
};
