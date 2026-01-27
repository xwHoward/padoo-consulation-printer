export const MASSAGE_STRENGTHS = [
	{id: 'standard', name: '标准 STANDARD'},
	{id: 'soft', name: '轻柔 SOFT'},
	{id: 'gravity', name: '重力 STRONG'}
];

export const GENDERS = [
	{id: 'male', name: '先生'},
	{id: 'female', name: '女士'}
];

export const COUPON_PLATFORMS = [
	{id: 'meituan', name: '美团'},
	{id: 'dianping', name: '点评'},
	{id: 'douyin', name: '抖音'},
	{id: 'membership', name: '划卡'}
];

export const SHIFT_TYPES = ['morning', 'evening', 'off', 'leave'] as const;
export type ShiftType = typeof SHIFT_TYPES[number];

export const SHIFT_NAMES: Record<ShiftType, string> = {
	morning: '早班',
	evening: '晚班',
	off: '休息',
	leave: '请假'
};

export const DEFAULT_SHIFT: ShiftType = 'evening';
