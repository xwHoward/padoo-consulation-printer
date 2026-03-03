import { BaseFormHandler } from "../../common/handlers/base-form.handler";
import { CustomerUtils } from "../../common/utils/customer-utils";

export class ReservationFormHandler extends BaseFormHandler {
	async onCustomerNameInput(e: WechatMiniprogram.CustomEvent) {
		const customerName = e.detail.value;
		this.updateField('reserveForm.customerName', customerName);

		await this.searchCustomer();
	}

	async onGenderChange(e: WechatMiniprogram.CustomEvent) {
		const gender = e.detail.value;
		this.updateField('reserveForm.gender', gender);

		await this.searchCustomer();
	}

	async onPhoneInput(e: WechatMiniprogram.CustomEvent) {
		const phone = e.detail.value;
		this.updateField('reserveForm.phone', phone);

		await this.searchCustomer();
	}

	onProjectChange(e: WechatMiniprogram.CustomEvent) {
		const project = e.detail.value;
		this.updateField('reserveForm.project', project);

		this.page.checkStaffAvailability();
	}

	onStartTimeChange(e: WechatMiniprogram.CustomEvent) {
		const startTime = e.detail.value;
		this.updateField('reserveForm.startTime', startTime);

		this.page.checkStaffAvailability();
	}

	onRequirementTypeChange(e: WechatMiniprogram.CustomEvent) {
		const requirementType = e.detail.value;
		this.updateField('reserveForm.requirementType', requirementType);

		this.updateField('reserveForm.selectedTechnicians', []);
	}

	onChangeGenderCount(e: WechatMiniprogram.CustomEvent) {
		const { field } = e.currentTarget.dataset;
		const value = parseInt(e.detail.value) || 0;

		this.updateField(`reserveForm.genderRequirement.${field}`, value);
	}

	async searchCustomer() {
		const { reserveForm } = this.page.data;

		if (!reserveForm.customerName || !reserveForm.gender) {
			this.updateField('matchedCustomer', null);
			this.updateField('matchedCustomerApplied', false);
			return;
		}

		const matchedCustomer = await CustomerUtils.searchCustomer(
			reserveForm.customerName,
			reserveForm.gender,
			reserveForm.phone
		);

		this.updateField('matchedCustomer', matchedCustomer);
		this.updateField('matchedCustomerApplied', false);
	}

	applyMatchedCustomer() {
		const { matchedCustomer, reserveForm } = this.page.data;

		if (!matchedCustomer) {
			this.showToast('没有匹配的顾客信息', 'none');
			return;
		}

		const updates = CustomerUtils.buildCustomerUpdates(matchedCustomer, reserveForm);
		this.updateMultipleFields(updates);

		this.updateField('matchedCustomerApplied', true);
		this.showToast('已应用顾客信息', 'success');
	}

	clearMatchedCustomer() {
		this.updateField('matchedCustomer', null);
		this.updateField('matchedCustomerApplied', false);
	}

	selectReserveTechnician(e: WechatMiniprogram.CustomEvent) {
		const { staff } = e.currentTarget.dataset;
		const { selectedTechnicians } = this.page.data.reserveForm;

		const exists = selectedTechnicians.find(t => t._id === staff._id);

		let newSelectedTechnicians;
		if (exists) {
			newSelectedTechnicians = selectedTechnicians.filter(t => t._id !== staff._id);
		} else {
			newSelectedTechnicians = [...selectedTechnicians, {
				_id: staff._id,
				name: staff.name,
				phone: staff.phone,
				isClockIn: false
			}];
		}

		this.updateField('reserveForm.selectedTechnicians', newSelectedTechnicians);
	}

	toggleReserveClockIn(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const { selectedTechnicians } = this.page.data.reserveForm;

		const newSelectedTechnicians = [...selectedTechnicians];
		newSelectedTechnicians[index].isClockIn = !newSelectedTechnicians[index].isClockIn;

		this.updateField('reserveForm.selectedTechnicians', newSelectedTechnicians);
	}

	removeReserveTechnician(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const { selectedTechnicians } = this.page.data.reserveForm;

		const newSelectedTechnicians = selectedTechnicians.filter((_, i) => i !== index);
		this.updateField('reserveForm.selectedTechnicians', newSelectedTechnicians);
	}

	closeReserveModal() {
		this.updateField('showReserveModal', false);
		this.updateField('reserveForm', {
			_id: '',
			date: '',
			customerName: '',
			gender: 'male',
			project: '',
			phone: '',
			requirementType: 'specific',
			selectedTechnicians: [],
			genderRequirement: { male: 0, female: 0 },
			startTime: '',
			technicianId: '',
			technicianName: ''
		});
		this.updateField('matchedCustomer', null);
		this.updateField('matchedCustomerApplied', false);
	}

	stopBubble() { }
}
