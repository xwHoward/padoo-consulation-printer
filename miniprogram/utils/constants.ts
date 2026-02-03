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

export const SHIFT_TYPES = ['morning', 'evening', 'off', 'leave'] as const;
export type ShiftType = typeof SHIFT_TYPES[number];

export const SHIFT_NAMES: Record<ShiftType, string> = {
	morning: '早班',
	evening: '晚班',
	off: '休息',
	leave: '请假'
};

export const SHIFT_START_TIME: Record<ShiftType, string> = {
	morning: '12:00',
	evening: '13:00',
	off: '',
	leave: ''
};

export const SHIFT_END_TIME: Record<ShiftType, string> = {
	morning: '22:00',
	evening: '23:00',
	off: '',
	leave: ''
};

export const DEFAULT_SHIFT: ShiftType = 'evening';
