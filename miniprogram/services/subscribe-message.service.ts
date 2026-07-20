/**
 * 订阅消息服务
 *
 * 职责：
 * 1. 请求订阅消息授权（wx.requestSubscribeMessage），自动分批（每批 <= 3 个，微信限制）。
 * 2. 将用户授权产生的「一次性订阅」额度（token）持久化到 subscribe_tokens 集合，
 *    供云函数 sendSubscribeMessage 消费发送。
 * 3. 检测用户是否已开启提醒（是否仍有可用额度），用于登录/绑定后的弹窗引导。
 *
 * 注意：wx.requestSubscribeMessage 必须处于用户点击事件上下文内才能弹出授权弹窗，
 * 因此调用方应使用 await 同步等待，避免脱离事件栈。
 */
import {cloudDb, Collections} from '../utils/cloud-db';
import {authManager} from '../utils/auth';
import {getAllTemplateIds, SUBSCRIBE_TEMPLATES, SubscribeMessageType} from '../config/subscribe-message.config';

/** 微信单次请求最多 3 个模板 */
const MAX_TEMPLATES_PER_REQUEST = 3;

/** 订阅额度记录 */
interface SubscribeTokenRecord extends BaseRecord {
	openId: string;
	templateId: string;
}

/**
 * 将模板 ID 列表按 batchSize 分批
 */
function chunk<T>(list: T[], batchSize: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < list.length; i += batchSize) {
		result.push(list.slice(i, i + batchSize));
	}
	return result;
}

export class SubscribeMessageService {
	/**
	 * 请求订阅消息授权，并将获得的额度保存到云端。
	 *
	 * @param types 需要授权的订阅类型，默认全部类型
	 * @returns 本次新增的授权额度数量
	 */
	static async requestAuthorization(types?: SubscribeMessageType[]): Promise<number> {
		const templateIds = (types && types.length > 0)
			? Array.from(new Set(types.map(t => SUBSCRIBE_TEMPLATES[t].templateId).filter(Boolean)))
			: getAllTemplateIds();

		if (templateIds.length === 0) {
			console.warn('[SubscribeMessage] 未配置有效的模板 ID，跳过授权');
			return 0;
		}

		const user = authManager.getCurrentUser();
		const openId = user?.openId;
		if (!openId) {
			console.warn('[SubscribeMessage] 未获取到 openId，跳过授权');
			return 0;
		}

		let grantedCount = 0;
		const batches = chunk(templateIds, MAX_TEMPLATES_PER_REQUEST);

		for (const batch of batches) {
			try {
				const res = await wx.requestSubscribeMessage({tmplIds: batch});
				const acceptedTemplateIds: string[] = [];
				for (const id of batch) {
					if ((res as Record<string, string>)[id] === 'accept') {
						acceptedTemplateIds.push(id);
						grantedCount++;
					}
				}
				if (acceptedTemplateIds.length > 0) {
					await this.saveTokens(openId, acceptedTemplateIds);
				}
			} catch (error) {
				// 用户关闭弹窗或拒绝时不中断后续批次
				console.warn('[SubscribeMessage] 请求授权失败或用户拒绝:', error);
			}
		}

		return grantedCount;
	}

	/**
	 * 将授权额度持久化到 subscribe_tokens 集合（每个模板一条记录，代表一次发送额度）
	 */
	private static async saveTokens(openId: string, templateIds: string[]): Promise<void> {
		for (const templateId of templateIds) {
			try {
				await cloudDb.insert<SubscribeTokenRecord>(Collections.SUBSCRIBE_TOKENS, {
					openId,
					templateId,
				});
			} catch (error) {
				console.warn('[SubscribeMessage] 保存订阅额度失败:', error);
			}
		}
	}

	/**
	 * 获取当前用户已授权的额度数量（按模板统计）
	 */
	static async getTokenCountByTemplate(openId: string): Promise<Record<string, number>> {
		try {
			const tokens = await cloudDb.find<SubscribeTokenRecord>(Collections.SUBSCRIBE_TOKENS, {openId});
			const map: Record<string, number> = {};
			for (const t of tokens) {
				map[t.templateId] = (map[t.templateId] || 0) + 1;
			}
			return map;
		} catch (error) {
			return {};
		}
	}

	/**
	 * 检测是否所有模板都至少有一个可用额度（用于判断是否已开启提醒）
	 */
	static async hasFullAuthorization(openId: string): Promise<boolean> {
		const allIds = getAllTemplateIds();
		if (allIds.length === 0) return true;
		const countMap = await this.getTokenCountByTemplate(openId);
		return allIds.every(id => (countMap[id] || 0) > 0);
	}

	/**
	 * 登录/绑定后检测授权状态，未开启时弹窗引导用户授权。
	 *
	 * 关键：wx.requestSubscribeMessage 必须在用户 tap 事件的同步回调中调用，
	 * 因此这里使用 wx.showModal 的 success 回调形式（而非 await），
	 * 确保在用户点击「开启」的同步事件栈内直接触发订阅弹窗。
	 */
	static async ensureAuthorization(): Promise<void> {
		const user = authManager.getCurrentUser();
		const openId = user?.openId;
		if (!openId) return;

		const templateIds = getAllTemplateIds();
		if (templateIds.length === 0) return;

		try {
			const authorized = await this.hasFullAuthorization(openId);
			if (authorized) return;

			// 用 Promise 包裹回调式 showModal，确保外部 await 等到弹窗关闭后再继续
			await new Promise<void>((resolve) => {
				wx.showModal({
					title: '开启消息提醒',
					content: '开启后可接收预约新增/变更/取消等微信通知，是否开启？',
					confirmText: '开启',
					cancelText: '暂不',
					success: (modalRes) => {
						if (modalRes.confirm) {
							// 在用户点击「开启」的同步上下文中直接调用
							this.requestAuthorizationSync(templateIds, openId);
						}
						resolve();
					},
					fail: () => resolve(),
				});
			});
		} catch (error) {
			console.warn('[SubscribeMessage] ensureAuthorization 失败:', error);
		}
	}

	/**
	 * 在用户 tap 同步上下文中直接调用 wx.requestSubscribeMessage（回调形式）。
	 * 避免 await 打断事件栈导致微信订阅弹窗不弹出。
	 */
	private static requestAuthorizationSync(templateIds: string[], openId: string): void {
		const batches = chunk(templateIds, MAX_TEMPLATES_PER_REQUEST);

		for (const batch of batches) {
			wx.requestSubscribeMessage({
				tmplIds: batch,
				success: (res: Record<string, string>) => {
					const acceptedTemplateIds: string[] = [];
					for (const id of batch) {
						if (res[id] === 'accept') {
							acceptedTemplateIds.push(id);
						}
					}
					if (acceptedTemplateIds.length > 0) {
						this.saveTokens(openId, acceptedTemplateIds);
					}
				},
				fail: (error: any) => {
					console.warn('[SubscribeMessage] 请求授权失败:', error);
					// 20004: 用户关闭了订阅消息总开关，引导去设置页开启
					if (error?.errCode === 20004) {
						wx.showModal({
							title: '提示',
							content: '检测到您关闭了订阅消息功能，如需开启请前往设置',
							confirmText: '去设置',
							success: (res) => {
								if (res.confirm) {
									wx.openSetting();
								}
							},
						});
					}
				},
			});
		}
	}
}
