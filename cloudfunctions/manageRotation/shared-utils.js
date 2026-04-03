/**
 * 云函数共享工具模块
 * 统一时间处理、常量定义，减少代码重复
 */

// ============ 常量定义 ============

/**
 * 班次开始时间
 */
const SHIFT_START_TIME = {
    'morning': '12:00',
    'evening': '13:00',
    'overtime': '00:00',
}

/**
 * 班次结束时间
 */
const SHIFT_END_TIME = {
    'morning': '22:00',
    'evening': '23:00',
    'overtime': '23:59',
}

// ============ 时间处理函数 ============

/**
 * 获取北京时间（UTC+8）的当前时间信息
 * 统一用 getUTCHours/getUTCMinutes 读取手动偏移后的值，
 * 避免因服务器本地时区不同而导致二次叠加（UTC+8 → UTC+16）
 * @returns {{todayStr: string, currentHour: number, currentMinute: number, currentMins: number, chinaTime: Date}}
 */
function getChinaTime() {
    const chinaTime = new Date(Date.now() + 8 * 60 * 60 * 1000)
    const hour = chinaTime.getUTCHours()
    const minute = chinaTime.getUTCMinutes()
    const year = chinaTime.getUTCFullYear()
    const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0')
    const day = String(chinaTime.getUTCDate()).padStart(2, '0')
    
    return {
        chinaTime,
        todayStr: `${year}-${month}-${day}`,
        currentHour: hour,
        currentMinute: minute,
        currentMins: hour * 60 + minute
    }
}

/**
 * 时间字符串转换为分钟数（从00:00起算）
 * @param {string} timeStr - 格式为 "HH:mm" 的时间字符串
 * @returns {number} 分钟数
 */
function parseTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
}

/**
 * 分钟数转换为时间字符串
 * @param {number} minutes - 分钟数（从00:00起算）
 * @returns {string} 格式为 "HH:mm" 的时间字符串
 */
function formatMinutesToTime(minutes) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date - 日期对象
 * @returns {string} 格式为 "YYYY-MM-DD" 的日期字符串
 */
function formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm
 * @param {Date} date - 日期对象
 * @returns {string} 格式为 "YYYY-MM-DD HH:mm" 的日期时间字符串
 */
function formatDateTime(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
}

/**
 * 格式化小时为 HH:00
 * @param {Date} date - 日期对象
 * @returns {string} 格式为 "HH:00" 的时间字符串
 */
function formatHour(date) {
    const hour = String(date.getHours()).padStart(2, '0')
    return `${hour}:00`
}

/**
 * 解析项目时长字符串
 * @param {string} duration - 时长字符串，如 "90分钟"
 * @returns {number} 分钟数
 */
function parseProjectDuration(duration) {
    if (!duration) return 60
    const match = duration.match(/(\d+)/)
    return match ? parseInt(match[1], 10) : 60
}

/**
 * 合并重叠的时间区间
 * @param {Array<{startTime: string, endTime: string}>} appointments - 预约列表
 * @returns {Array<{start: number, end: number}>} 合并后的时间区间（分钟数）
 */
function mergeTimeRanges(appointments) {
    if (!appointments || appointments.length === 0) return []
    
    const ranges = appointments.map(app => ({
        start: parseTimeToMinutes(app.startTime),
        end: parseTimeToMinutes(app.endTime)
    }))
    
    ranges.sort((a, b) => a.start - b.start)
    
    const merged = [ranges[0]]
    for (let i = 1; i < ranges.length; i++) {
        const last = merged[merged.length - 1]
        if (ranges[i].start <= last.end) {
            last.end = Math.max(last.end, ranges[i].end)
        } else {
            merged.push(ranges[i])
        }
    }
    
    return merged
}

// ============ 导出 ============

module.exports = {
    // 常量
    SHIFT_START_TIME,
    SHIFT_END_TIME,
    
    // 时间处理函数
    getChinaTime,
    parseTimeToMinutes,
    formatMinutesToTime,
    formatDate,
    formatDateTime,
    formatHour,
    parseProjectDuration,
    mergeTimeRanges
}
