export class BaseFormHandler {
	protected page: CashierPage;

	constructor(page: CashierPage) {
		this.page = page;
	}

	protected updateField(fieldPath: string, value: any) {
		this.page.setData({ [fieldPath]: value });
	}

	protected updateMultipleFields(updates: Record<string, any>) {
		this.page.setData(updates);
	}

	protected getField(fieldPath: string): any {
		const keys = fieldPath.split('.');
		let value: any = this.page.data;
		for (const key of keys) {
			value = value?.[key as keyof typeof value];
		}
		return value;
	}

	protected showToast(title: string, icon: 'success' | 'error' | 'none' = 'none') {
		wx.showToast({ title, icon });
	}

	protected showModal(title: string, content: string): Promise<WechatMiniprogram.ShowModalSuccessCallbackResult> {
		return wx.showModal({
			title,
			content,
			confirmText: '确定',
			cancelText: '取消'
		});
	}

	protected showActionSheet(itemList: string[]): Promise<WechatMiniprogram.ShowActionSheetSuccessCallbackResult> {
		return new Promise((resolve, reject) => {
			wx.showActionSheet({
				itemList,
				success: resolve,
				fail: reject
			});
		});
	}

	protected setLoading(loading: boolean, text: string = '加载中...') {
		this.page.setData({ loading, loadingText: text });
	}
}
