/**
 * 订阅消息模板配置
 *
 * 说明：
 * 1. 以下 templateId 为占位符，请替换为「微信公众平台 -> 订阅消息 -> 我的模板」中对应模板的真实 ID。
 * 2. data 字段键名必须与模板配置的字段序号完全一致（如 thing3 / date6 / time1 等）。
 * 3. 新增推送类型时：在 SubscribeMessageType 中追加类型，并在 SUBSCRIBE_TEMPLATES 中注册模板即可，
 *    发送逻辑（subscribe-message.service.ts / sendSubscribeMessage 云函数）无需改动。
 */

/** 订阅消息类型 */
export type SubscribeMessageType =
	| 'RESERVATION_NEW'      // 新预约提醒
	| 'RESERVATION_CHANGE'   // 预约变更提醒
	| 'RESERVATION_CANCEL';  // 预约取消提醒

/** 单个模板配置 */
export interface SubscribeTemplateConfig {
	/** 微信后台配置的一次性订阅模板 ID */
	templateId: string;
	/** 模板标题（仅用于日志与展示） */
	title: string;
}

/**
 * 模板注册表
 */
export const SUBSCRIBE_TEMPLATES: Record<SubscribeMessageType, SubscribeTemplateConfig> = {
	RESERVATION_NEW: {
		templateId: 'HdAXMdRODnMQ6BmM4nJBtsYZvkAfF-3QZSIVI70w4qE',
		title: '新预约提醒',
	},
	RESERVATION_CHANGE: {
		templateId: 'wKhxQIbttNiCTh2qHXcmClhauq5Sge9Sq8bWiPxQr5Y',
		title: '预约变更提醒',
	},
	RESERVATION_CANCEL: {
		templateId: 'VdfCUYlgh8MbK3JzqksFvqS19YQGVQ5Mt1f9FQDKDIw',
		title: '预约取消提醒',
	},
};

/**
 * 获取所有已配置的模板 ID 列表（自动去重）
 * 微信单次 requestSubscribeMessage 最多 3 个模板，调用方需自行分批。
 */
export function getAllTemplateIds(): string[] {
	const ids = Object.values(SUBSCRIBE_TEMPLATES)
		.map(t => t.templateId)
		.filter(id => !!id && !id.startsWith('REPLACE_WITH_TEMPLATE_ID'));
	// 去重，避免同一模板被重复请求导致低版本客户端报错
	return Array.from(new Set(ids));
}

/** 获取指定类型的模板 ID */
export function getTemplateId(type: SubscribeMessageType): string {
	return SUBSCRIBE_TEMPLATES[type].templateId;
}
