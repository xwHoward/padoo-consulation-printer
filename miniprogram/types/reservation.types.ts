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
}

/** 推送弹窗状态 */
export interface PushModalState {
	show: boolean;
	loading: boolean;
	type: 'create' | 'cancel' | 'edit';
	message: string;
	mentions: Array<{ _id: string; name: string; phone: string; wechatWorkId?: string }>;
	reservationData: {
		original?: ReservationRecord;
		updated?: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>;
		customerName: string;
		gender: 'male' | 'female';
		date: string;
		startTime: string;
		endTime: string;
		project: string;
		technicians: Array<{
			_id: string;
			name: string;
			phone: string;
			wechatWorkId: string;
			isClockIn: boolean;
		}>;
	} | null;
}

/** 到店确认弹窗状态 */
export interface ArrivalConfirmModalState {
	show: boolean;
	reserveId: string;
	customerName: string;
	project: string;
	technicianName: string;
}

/** 预约弹窗组件属性 */
export interface ReservationModalProps {
	show: boolean;
	mode: 'create' | 'edit';
	reserveForm: ReserveForm;
	originalReservation: ReservationRecord | null;
	selectedDate: string;
	projects: Project[];
	staffAvailability: StaffAvailability[];
	availableMaleCount: number;
	availableFemaleCount: number;
	matchedCustomer: CustomerRecord | null;
	matchedCustomerApplied: boolean;
}

/** 预约弹窗组件事件 */
export interface ReservationModalEvents {
	confirm: (form: ReserveForm) => void;
	cancel: () => void;
	'check-availability': (date: string, startTime: string, project: string) => void;
	'search-customer': (name: string, phone: string, gender: string) => void;
	'apply-customer': (customer: CustomerRecord) => void;
	'clear-customer': () => void;
}

/** 预约组件完整数据结构 */
export interface ReservationComponentData {
	show: boolean;
	mode: 'create' | 'edit';
	loading: boolean;
	loadingText: string;
	reserveForm: ReserveForm;
	originalReservation: ReservationRecord | null;
	projects: Project[];
	staffAvailability: StaffAvailability[];
	availableMaleCount: number;
	availableFemaleCount: number;
	matchedCustomer: CustomerRecord | null;
	matchedCustomerApplied: boolean;
	pushModal: PushModalState;
}

/** 预约组件方法接口 */
export interface ReservationComponentInstance {
	data: ReservationComponentData;
	setData: (data: Partial<ReservationComponentData> | Record<string, unknown>) => void;
}
