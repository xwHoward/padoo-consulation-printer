export interface PaymentMethodItem {
	key: string;
	label: string;
	selected: boolean;
	amount: string;
	couponCode?: string;
}

export interface DateSelectorState {
	selectedDate: string;
	previousDate: string;
	nextDate: string;
	isToday: boolean;
}

export interface ReserveForm {
	_id: string;
	date: string;
	customerName: string;
	gender: 'male' | 'female';
	project: string;
	phone: string;
	requirementType: 'specific' | 'gender';
	selectedTechnicians: Array<{ _id: string; name: string; phone: string; wechatWorkId?: string; isClockIn: boolean }>;
	genderRequirement: { male: number; female: number };
	startTime: string;
	technicianId: string;
	technicianName: string;
}

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
		technicians: Array<{ _id: string; name: string; phone: string; wechatWorkId: string; isClockIn: boolean }>;
	} | null;
}

export interface RotationPushModalState {
	show: boolean;
	loading: boolean;
}

export interface ArrivalConfirmModalState {
	show: boolean;
	reserveId: string;
	customerName: string;
	project: string;
	technicianName: string;
}

export interface CashierPageData {
	isLandscape: boolean;
	selectedDate: string;
	rooms: Room[];
	rotationList: RotationItem[];
	timelineRefreshTrigger: number;
	dateSelector: DateSelectorState;
	canCreateReservation: boolean;
	canPushRotation: boolean;
	showReserveModal: boolean;
	projects: Project[];
	activeStaffList: StaffInfo[];
	staffAvailability: StaffAvailability[];
	availableMaleCount: number;
	availableFemaleCount: number;
	reserveForm: ReserveForm;
	originalReservation: ReservationRecord | null;
	showSettlementModal: boolean;
	settlementRecordId: string;
	settlementCouponCode: string;
	projectOriginalPrice: number;
	totalSettlementAmount: number;
	paymentMethods: PaymentMethodItem[];
	loading: boolean;
	loadingText: string;
	matchedCustomer: CustomerRecord | null;
	matchedCustomerApplied: boolean;
	pushModal: PushModalState;
	rotationPushModal: RotationPushModalState;
	pushModalLocked: boolean;
	arrivalConfirmModal: ArrivalConfirmModalState;
	quickReservationSlots: {
		oneMale: string | null;
		oneFemale: string | null;
		twoMale: string | null;
		twoFemale: string | null;
	};
}

// 页面实例类型（用于 handler 类）
export interface CashierPage {
	data: CashierPageData;
	setData: (data: Partial<CashierPageData> | Record<string, unknown>) => void;
	// 数据加载方法
	loadTimelineData: () => Promise<void>;
	loadProjects: () => Promise<void>;
	// 预约方法
	checkStaffAvailability: () => Promise<void>;
	searchCustomer: () => Promise<void>;
	closeReserveModal: () => void;
	// 结算方法
	loadSettlement: (_id: string, record: ConsultationRecord) => void;
	calculateTotalAmount: (paymentMethods: PaymentMethodItem[]) => void;
	closeSettlementModal: () => void;
	// 推送方法
	getReservationTypeText: (technicians: Array<{ _id: string; name: string; phone: string; wechatWorkId: string; isClockIn: boolean }>) => string;
	// 辅助方法
	sendReservationModificationNotification: (original: ReservationRecord | null, updated: Omit<ReservationRecord, '_id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}
