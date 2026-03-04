// customer-match.ts - 顾客匹配工具
import type { CashierPage } from '../cashier.types';

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

	try {
		const res = await wx.cloud.callFunction({
			name: 'matchCustomer',
			data: {
				surname: currentSurname,
				gender: currentGender,
				phone: currentPhone
			}
		});

		if (!res.result || typeof res.result !== 'object') {
			throw new Error('匹配顾客失败');
		}

		const result = res.result as { code: number; data?: CustomerRecord };
		if (result.code === 0 && result.data) {
			page.setData({
				matchedCustomer: result.data,
				matchedCustomerApplied: false
			});
		} else {
			page.setData({
				matchedCustomer: null,
				matchedCustomerApplied: false
			});
		}
	} catch (error) {
		page.setData({
			matchedCustomer: null,
			matchedCustomerApplied: false
		});
	}
}

/**
 * 应用匹配的顾客信息
 */
export function applyMatchedCustomer(page: CashierPage): void {
	const { matchedCustomer } = page.data;

	if (!matchedCustomer) return;

	const updates: Record<string, unknown> = {
		'reserveForm.customerName': matchedCustomer.name.replace(/先生|女士/g, ''),
		'reserveForm.gender': matchedCustomer.name.endsWith('女士') ? 'female' : 'male',
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
