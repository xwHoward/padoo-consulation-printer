/**
 * 预约弹窗组件
 * 封装预约表单UI和交互逻辑，可在多个页面复用
 */
import type { ReserveForm } from '../../types/reservation.types';

Component({
	properties: {
		show: {
			type: Boolean,
			value: false,
		},
		mode: {
			type: String,
			value: 'create', // 'create' | 'edit'
		},
		reserveForm: {
			type: Object,
			value: {} as ReserveForm,
		},
		originalReservation: {
			type: Object,
			value: null,
		},
		projects: {
			type: Array,
			value: [],
		},
		staffAvailability: {
			type: Array,
			value: [],
		},
		availableMaleCount: {
			type: Number,
			value: 0,
		},
		availableFemaleCount: {
			type: Number,
			value: 0,
		},
		matchedCustomer: {
			type: Object,
			value: null,
		},
		matchedCustomerApplied: {
			type: Boolean,
			value: false,
		},
		loading: {
			type: Boolean,
			value: false,
		},
		loadingText: {
			type: String,
			value: '处理中...',
		},
	},

	methods: {
		/** 关闭弹窗 */
		onCancel() {
			this.triggerEvent('cancel');
		},

		/** 确认提交 */
		onConfirm() {
			this.triggerEvent('confirm', { form: this.properties.reserveForm });
		},

		/** 日期变更 */
		onDateChange(e: WechatMiniprogram.PickerChange) {
			const value = e.detail.value as string;
			this.triggerEvent('field-change', { field: 'date', value });
		},

		/** 时间变更 */
		onTimeChange(e: WechatMiniprogram.PickerChange) {
			const value = e.detail.value as string;
			this.triggerEvent('field-change', { field: 'startTime', value });
		},

		/** 姓名输入 */
		onNameInput(e: WechatMiniprogram.Input) {
			const value = e.detail.value;
			this.triggerEvent('field-change', { field: 'customerName', value });
		},

		/** 手机号输入 */
		onPhoneInput(e: WechatMiniprogram.Input) {
			const value = e.detail.value;
			this.triggerEvent('field-change', { field: 'phone', value });
		},

		/** 性别变更 */
		onGenderChange(e: WechatMiniprogram.CustomEvent) {
			this.triggerEvent('gender-change', { gender: e.detail.gender });
		},

		/** 项目选择 */
		onProjectSelect(e: WechatMiniprogram.CustomEvent) {
			this.triggerEvent('project-select', { project: e.detail.project });
		},

		/** 技师需求类型变更 */
		onRequirementTypeChange(e: WechatMiniprogram.RadioGroupChange) {
			this.triggerEvent('requirement-type-change', { type: e.detail.value });
		},

		/** 技师选择 */
		onTechnicianSelect(e: WechatMiniprogram.CustomEvent) {
			this.triggerEvent('technician-select', e.detail);
		},

		/** 点钟切换 */
		onClockInToggle(e: WechatMiniprogram.CustomEvent) {
			this.triggerEvent('clock-in-toggle', e.detail);
		},

		/** 性别数量调整 */
		onGenderCountChange(e: WechatMiniprogram.CustomEvent) {
			const { gender, action } = e.currentTarget.dataset;
			this.triggerEvent('gender-count-change', { gender, action });
		},

		/** 应用匹配顾客 */
		onApplyCustomer() {
			this.triggerEvent('apply-customer');
		},

		/** 清除匹配顾客 */
		onClearCustomer() {
			this.triggerEvent('clear-customer');
		},
	},
});
