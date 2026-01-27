export interface Project {
	id: string;
	name: string;
	duration: number;
	price?: number;
	isEssentialOilOnly?: boolean;
	status: 'normal' | 'disabled';
	createdAt?: string;
	updatedAt?: string;
}

export const PROJECTS: Project[] = [
	{id: '1', name: '60min指压', duration: 60, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '2', name: '70min精油', duration: 70, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '3', name: '90min精油', duration: 90, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '4', name: '90min七脉轮彩石', duration: 90, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '5', name: '90min深海热贝', duration: 90, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '6', name: '80min推拿+精油', duration: 80, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '7', name: '45min腰臀', duration: 45, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '8', name: '120min精油', duration: 120, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '9', name: '120min七脉轮彩石', duration: 120, price: 0, status: 'normal', isEssentialOilOnly: false},
	{id: '10', name: '120min深海热贝', duration: 120, price: 0, status: 'normal', isEssentialOilOnly: false}
];

export interface EssentialOil {
	id: string;
	name: string;
	effect: string;
	status: 'normal' | 'disabled';
	createdAt?: string;
	updatedAt?: string;
}

export const ESSENTIAL_OILS: EssentialOil[] = [
	{id: 'lavender', name: '薰衣草 LAVENDER', effect: '安神助眠，放松身心，安抚情绪', status: 'normal'},
	{id: 'grapefruit', name: '葡萄柚 GRAPEFRUIT', effect: '清新提神，愉悦心情，改善浮肿', status: 'normal'},
	{id: 'atractylodes', name: '白术 ATRACTYLODES', effect: '驱寒祠湿，温润调理，行气暖身', status: 'normal'},
	{id: 'rosemary', name: '迷迭香 ROSEMARY', effect: '提神醒脑，增强专注，缓解笫惫', status: 'normal'},
	{id: 'rosewood', name: '花梨木 ROSEWOOD', effect: '温和滋养，舒缓干燥，安抚肌肤', status: 'normal'},
	{id: 'seasonal', name: '冬日特调 SEASONAL SPECIAL', effect: '季节调和，平衡身心，调理体质', status: 'normal'}
];

export interface Room {
	id: string;
	name: string;
	status: 'normal' | 'disabled';
	createdAt?: string;
	updatedAt?: string;
}

export const ROOMS: Room[] = [
	{id: '1', name: '苏梅', status: 'normal'},
	{id: '2', name: '法罗', status: 'normal'},
	{id: '3', name: '帕劳', status: 'normal'},
	{id: '4', name: '巴厘', status: 'normal'},
	{id: '5', name: '大溪地', status: 'normal'},
	{id: '6', name: '西西里', status: 'normal'}
];

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
