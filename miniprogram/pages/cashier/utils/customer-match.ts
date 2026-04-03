// customer-match.ts - 顾客匹配工具
import type { CashierPage } from '../cashier.types';
import { matchCustomer as matchCustomerService, parseCustomerName } from '../../../services/customer.service';

/**
 * 搜索匹配顾客
 */
export async function searchCustomer(page: CashierPage): Promise<void> {
	const { reserveForm } = page.data;

	const currentSurname = reserveForm.customerName;
	const currentGender = reserveForm.gender;
	const currentPhone = reserveForm.phone;

	// 如果没有输入任何信息，清除匹配
	if (!currentSurname && !currentPhone) {
		page.setData({
			matchedCustomer: null,
			matchedCustomerApplied: false
		});
		return;
	}

	// 使用统一的服务层
	const result = await matchCustomerService({
		surname: currentSurname,
		gender: currentGender,
		phone: currentPhone
	});

	page.setData({
		matchedCustomer: result.customer,
		matchedCustomerApplied: false
	});
}

/**
 * 应用匹配的顾客信息
 */
export function applyMatchedCustomer(page: CashierPage): void {
	const { matchedCustomer } = page.data;

	if (!matchedCustomer) return;

	const { surname, gender } = parseCustomerName(matchedCustomer.name);
	const updates: Record<string, unknown> = {
		'reserveForm.customerName': surname,
		'reserveForm.gender': gender,
	};

	if (matchedCustomer.phone) {
		updates['reserveForm.phone'] = matchedCustomer.phone;
	}

	if (matchedCustomer.responsibleTechnician) {
		const technicianName = matchedCustomer.responsibleTechnician;
		const staffAvailability = page.data.staffAvailability;
		if (staffAvailability && staffAvailability.length > 0) {
			const matchedStaff = staffAvailability.find(s => s.name === technicianName);
			if (matchedStaff) {
				updates['reserveForm.selectedTechnicians'] = [{ _id: matchedStaff._id, name: matchedStaff.name, phone: matchedStaff.phone || '', isClockIn: false }];
				const updatedStaffAvailability = staffAvailability.map(s => ({
					...s,
					isSelected: s._id === matchedStaff._id
				}));
				updates['staffAvailability'] = updatedStaffAvailability;
			}
		}
	}

	page.setData({
		...updates,
		matchedCustomerApplied: true
	});

	wx.showToast({
		title: '已应用顾客信息',
		icon: 'success'
	});
}

/**
 * 清除匹配的顾客信息
 */
export function clearMatchedCustomer(page: CashierPage): void {
	page.setData({
		matchedCustomer: null,
		matchedCustomerApplied: false
	});
}
