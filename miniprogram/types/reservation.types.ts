/**
 * 预约相关共享类型定义
 */

/** 预约表单数据 */
export interface ReserveForm {
	_id: string;
	date: string;
	customerName: string;
	gender: 'male' | 'female';
	project: string;
	projects: string[];
	phone: string;
	requirementType: 'specific' | 'gender';
	selectedTechnicians: Array<{
		_id: string;
		name: string;
		phone: string;
		wechatWorkId?: string;
		isClockIn: boolean;
	}>;
	genderRequirement: { male: number; female: number };
	startTime: string;
	technicianId: string;
	technicianName: string;
	isRenewal?: boolean;
}