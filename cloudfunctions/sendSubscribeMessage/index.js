/**
 * 订阅消息发送云函数
 *
 * 调用方式：
 *   wx.cloud.callFunction({
 *     name: 'sendSubscribeMessage',
 *     data: {
 *       type: 'RESERVATION_NEW',        // 订阅类型（见 TEMPLATES）
 *       data: { thing3: {...}, ... },   // 模板字段数据
 *       technicianId: 'xxx',            // 可选：接收技师的 staffId
 *       notifyAdmins: true,             // 可选：是否同时推送给 admin 角色用户
 *       openIds: ['xxx'],               // 可选：直接指定接收人 openId 列表
 *     }
 *   })
 *
 * 工作机制：
 * 1. 根据 technicianId / notifyAdmins / openIds 解析出接收人 openId 集合（自动去重）。
 * 2. 对每个接收人，从 subscribe_tokens 集合中消费一条对应模板的授权额度。
 * 3. 调用 cloud.openapi.subscribeMessage.send 发送，并删除已消费的额度记录。
 *
 * 扩展新消息类型：在 TEMPLATES 中注册 type -> templateId 即可。
 */
const cloud = require('wx-server-sdk')
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
    traceUser: true
})

const db = cloud.database()

const TEMPLATES = {
    RESERVATION_NEW: 'HdAXMdRODnMQ6BmM4nJBtsYZvkAfF-3QZSIVI70w4qE',
    RESERVATION_CHANGE: 'wKhxQIbttNiCTh2qHXcmClhauq5Sge9Sq8bWiPxQr5Y',
    RESERVATION_CANCEL: 'VdfCUYlgh8MbK3JzqksFvqS19YQGVQ5Mt1f9FQDKDIw',
}

/**
 * 截断文本，避免超出微信订阅消息字段长度限制（thing 类一般 20 字符）
 */
function truncate(value, maxLen) {
    if (value === undefined || value === null) return ''
    const str = String(value)
    return str.length > maxLen ? str.slice(0, maxLen) : str
}

/**
 * 规范化模板 data：将 { value: 'xxx' } 或纯字符串统一为 { value } 形式并截断
 */
function normalizeData(data) {
    const result = {}
    Object.keys(data || {}).forEach(key => {
        const raw = data[key]
        const val = (raw && typeof raw === 'object' && 'value' in raw) ? raw.value : raw
        result[key] = { value: truncate(val, 20) }
    })
    return result
}

/**
 * 根据 staffId 查找绑定用户的 openId
 */
async function getOpenIdByStaffId(staffId) {
    if (!staffId) return null
    const res = await db.collection('users').where({ staffId }).get()
    if (res.data && res.data.length > 0) {
        return res.data[0].openId
    }
    return null
}

/**
 * 获取所有 admin 角色用户的 openId
 */
async function getAdminOpenIds() {
    const res = await db.collection('users').where({ role: 'admin' }).get()
    return (res.data || [])
        .map(u => u.openId)
        .filter(Boolean)
}

/**
 * 解析接收人 openId 集合（去重）
 */
async function resolveRecipients(event) {
    const { technicianId, notifyAdmins, openIds } = event
    const set = new Set()

    if (Array.isArray(openIds)) {
        openIds.filter(Boolean).forEach(id => set.add(id))
    }

    if (technicianId) {
        const openId = await getOpenIdByStaffId(technicianId)
        if (openId) set.add(openId)
    }

    if (notifyAdmins) {
        const adminIds = await getAdminOpenIds()
        adminIds.forEach(id => set.add(id))
    }

    return Array.from(set)
}

/**
 * 消费一条订阅额度并发送消息
 */
async function sendToOpenId(openId, templateId, data, page) {
    // 查找该用户对应模板的一条授权额度
    const tokenRes = await db.collection('subscribe_tokens')
        .where({ openId, templateId })
        .limit(1)
        .get()

    if (!tokenRes.data || tokenRes.data.length === 0) {
        return { openId, success: false, message: '无可用订阅额度（用户未授权或已用完）' }
    }

    const token = tokenRes.data[0]

    try {
        const payload = {
            touser: openId,
            templateId,
            data,
        }
        if (page) payload.page = page

        await cloud.openapi.subscribeMessage.send(payload)

        // 发送成功后消费（删除）该额度记录
        await db.collection('subscribe_tokens').doc(token._id).remove()

        return { openId, success: true }
    } catch (error) {
        return { openId, success: false, message: error.message }
    }
}

exports.main = async (event) => {
    const { type, data } = event
    const templateId = TEMPLATES[type]

    if (!templateId) {
        return { code: -1, message: `未知的订阅消息类型: ${type}` }
    }

    try {
        const recipients = await resolveRecipients(event)
        if (recipients.length === 0) {
            return { code: 0, message: '无接收人', data: { sent: 0, results: [] } }
        }

        const normalizedData = normalizeData(data)
        const page = event.page || ''

        const results = []
        for (const openId of recipients) {
            const r = await sendToOpenId(openId, templateId, normalizedData, page)
            results.push(r)
        }

        const sent = results.filter(r => r.success).length
        return { code: 0, message: 'ok', data: { sent, total: recipients.length, results } }
    } catch (error) {
        return { code: -1, message: '发送失败: ' + error.message }
    }
}
