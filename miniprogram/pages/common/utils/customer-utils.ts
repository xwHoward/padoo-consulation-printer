
export class CustomerUtils {
	static async searchCustomer(surname: string, gender: 'male' | 'female', phone?: string): Promise<CustomerRecord | null> {
		try {
			if (!surname || !gender) {
				return null;
			}

			const res = await wx.cloud.callFunction({
				name: 'matchCustomer',
				data: {
					surname,
					gender,
					phone: phone || ''
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; data?: CustomerRecord };
				if (result.code === 0 && result.data) {
					return result.data;
				}
			}

			return null;
		} catch (error) {
			console.error('匹配顾客失败:', error);
			return null;
		}
	}

	static buildCustomerUpdates(customer: CustomerRecord, targetInfo: any): Record<string, any> {
		const updates: Record<string, any> = {};

		if (customer.phone && !targetInfo.phone) {
			updates.phone = customer.phone;
		}

		return updates;
	}
}
