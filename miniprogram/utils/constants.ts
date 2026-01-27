export const PROJECTS = [
	'60min指压', '70min精油', '90min精油', '90min七脉轮彩石',
	'90min深海热贝', '80min推拿+精油', '45min腰臀',
	'120min精油', '120min七脉轮彩石', '120min深海热贝'
];

export const ESSENTIAL_OILS = [
	{id: 'lavender', name: '薰衣草 LAVENDER', effect: '安神助眠，放松身心，安抚情绪'},
	{id: 'grapefruit', name: '葡萄柚 GRAPEFRUIT', effect: '清新提神，愉悦心情，改善浮肿'},
	{id: 'atractylodes', name: '白术 ATRACTYLODES', effect: '驱寒祠湿，温润调理，行气暖身'},
	{id: 'rosemary', name: '迷迭香 ROSEMARY', effect: '提神醒脑，增强专注，缓解笫惫'},
	{id: 'rosewood', name: '花梨木 ROSEWOOD', effect: '温和滋养，舒缓干燥，安抚肌肤'},
	{id: 'seasonal', name: '冬日特调 SEASONAL SPECIAL', effect: '季节调和，平衡身心，调理体质'}
];

export const ROOMS = ['苏梅', '法罗', '帕劳', '巴厘', '大溪地', '西西里'];

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
