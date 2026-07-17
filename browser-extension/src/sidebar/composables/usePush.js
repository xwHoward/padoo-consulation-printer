// composables/usePush.js - 推送消息处理
import { callFunction, collection, getDatabase } from '../services/cloudbase'

/** 身体部位标签映射 */
const BODY_PART_LABELS = {
  head: '头部', neck: '颈部', shoulder: '肩部', back: '后背',
  arm: '手臂', abdomen: '腹部', waist: '腰部',
  thigh: '大腿', calf: '小腿'
}

export function usePush() {
  /**
   * 获取预约类型文本
   */
  function getReservationTypeText(technicians) {
    if (!technicians || technicians.length === 0) return '排钟'
    const hasClockIn = technicians.some(t => t.isClockIn)
    const hasNonClockIn = technicians.some(t => !t.isClockIn)
    if (hasClockIn && hasNonClockIn) return '混合（点钟+排钟）'
    if (hasClockIn) return '点钟'
    return '排钟'
  }

  /**
   * 了解顾客历史备注
   */
  function formatMention(staff) {
    if (!staff) return ''
    const name = staff.name || ''
    const phone = staff.phone || ''
    const wechatWorkId = staff.wechatWorkId || ''
    if (wechatWorkId) return `@${wechatWorkId}`
    if (phone) return `@${phone}`
    return `@${name}`
  }

  /**
   * 构建顾客历史备注
   */
  async function buildCustomerHistoryRemark(phone, date) {
    if (!phone) return ''
    try {
      const res = await collection('consultation')
        .where({ phone, date: { $lt: date } })
        .orderBy('date', 'desc')
        .limit(5)
        .get()

      if (res.data?.length) {
        const records = res.data.map(r =>
          `${r.date} ${r.project}${r.technician ? '(' + r.technician + ')' : ''}`
        ).join('\n')
        return `\n【历史记录】\n${records}`
      }
    } catch { /* ignore */ }
    return ''
  }

  /**
   * 复制到剪贴板
   */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fallback: execCommand
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        return true
      } catch {
        return false
      }
    }
  }

  /**
   * 构建预约推送消息
   */
  function buildReservationMessage({
    type, customerName, gender, date, startTime,
    endTime, project, technicians
  }) {
    const genderLabel = gender === 'male' ? '先生' : '女士'
    const techNames = (technicians || []).map(t => t.name).join('、')
    const techStr = techNames ? `\n技师：${techNames}（${getReservationTypeText(technicians)}）` : ''

    switch (type) {
      case 'create':
        return `【📅 新增预约】\n\n${customerName}${genderLabel}\n日期：${date}\n时间：${startTime}-${endTime}\n项目：${project}${techStr}`
      case 'edit':
        return `【✏️ 修改预约】\n\n${customerName}${genderLabel}\n日期：${date}\n时间：${startTime}-${endTime}\n项目：${project}${techStr}`
      case 'cancel':
        return `【❌ 取消预约】\n\n${customerName}${genderLabel}\n原定：${date} ${startTime}-${endTime}\n项目：${project}`
      default:
        return ''
    }
  }

  /**
   * 构建轮牌消息
   */
  function buildRotationMessage(rotationList, date) {
    const lines = rotationList.map((staff, idx) =>
      `${idx + 1}. ${staff.name} (${staff.shift === 'morning' ? '早班' : '晚班'})`
    ).join('\n')

    return `【📋 今日轮牌】\n\n日期：${date}\n\n${lines}\n\n请各位同事确认今日轮牌顺序！`
  }

  /**
   * 查询顾客历史备注
   */
  async function buildCustomerHistoryRemark(phone, today) {
    if (!phone) return ''
    try {
      const res = await collection('consultation')
        .where({ phone })
        .orderBy('date', 'desc')
        .limit(10)
        .get()

      const records = (res.data || []).filter(r => r.date < today && !r.isVoided)
      if (records.length === 0) return ''

      const last = records[0]
      const diffDays = Math.round(
        (new Date(today).getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24)
      )

      const parts = Object.entries(last.selectedParts || {})
        .filter(([, active]) => active)
        .map(([key]) => BODY_PART_LABELS[key] || key)
        .join('、')

      const partsText = parts || '无'
      return `\n备注：老客，第${records.length + 1}次消费，上次到店：${diffDays}天前，上次需加强部位：${partsText}，上次服务技师：${last.technician || '无'}`
    } catch {
      return ''
    }
  }

  return {
    getReservationTypeText,
    formatMention,
    buildCustomerHistoryRemark,
    copyToClipboard,
    buildReservationMessage,
    buildCustomerHistoryRemark,
    buildRotationMessage
  }
}
