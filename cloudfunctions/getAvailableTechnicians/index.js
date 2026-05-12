const cloud = require('wx-server-sdk')
const {
    SHIFT_START_TIME,
    SHIFT_END_TIME,
    parseTimeToMinutes,
    formatMinutesToTime,
    getChinaTime,
    mergeTimeRanges
} = require('./shared-utils')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { date, currentTime, projectDuration, currentReservationIds, currentConsultationId, mode } = event

    if (mode === 'availability') {
        return await getTechnicianAvailability(date)
    }

    if (mode === 'rotationQuickSlots') {
        return await getRotationQuickSlots(date)
    }

    if (mode === 'rearrange') {
        return await rearrangeReservations(date)
    }

    if (!date || !currentTime || !projectDuration) {
        return {
            code: -1,
            message: '缺少必要参数'
        }
    }
    try {
        const OVERLAP_TOLERANCE = 10 // 允许首尾10分钟重叠
        const currentMinutes = parseTimeToMinutes(currentTime)
        const proposedEndTimeMinutes = currentMinutes + projectDuration

        const reservationsRes = await db.collection('reservations').where({
            date: date,
            status: 'active'
        }).get()
        const reservations = (reservationsRes.data || [])

        const filteredReservations = reservations.filter(r => !currentReservationIds || !currentReservationIds.includes(r._id))

        const scheduleRes = await db.collection('schedule').where({
            date: date
        }).get()
        const schedules = scheduleRes.data || []
        const scheduledStaffIds = schedules
            .filter(s => s.shift !== 'leave' && s.shift !== 'off')
            .map(s => s.staffId)

        let activeStaff = []
        if (scheduledStaffIds.length > 0) {
            const staffRes = await db.collection('staff').where({
                status: 'active',
                _id: _.in(scheduledStaffIds)
            }).get()
            activeStaff = staffRes.data || []
        }

        const consultationsRes = await db.collection('consultation_records').where({
            date: date,
            isVoided: false
        }).get()
        const todayRecords = consultationsRes.data || []

        const filteredRecords = todayRecords.filter(r => !currentConsultationId || r._id !== currentConsultationId)

        const rotationRes = await db.collection('rotation_queue').where({
            date: date
        }).get()
        const rotationData = rotationRes.data && rotationRes.data.length > 0 ? rotationRes.data[0] : null
        const rotationStaffList = rotationData && rotationData.staffList ? rotationData.staffList : []

        const staffPositionMap = new Map()
        rotationStaffList.forEach((staffData, index) => {
            staffPositionMap.set(staffData.staffId, index)
        })

        const technicians = activeStaff.map(staff => {
            let occupiedReason = ''
            
            const staffRecords = filteredRecords.filter(r => r.technician === staff.name)
            const clockInReservations = filteredReservations.filter(r => r.isClockIn === true && r.technicianName === staff.name)
            
            const staffAppointments = [...staffRecords, ...clockInReservations]
            
            let hasConflict = false
            
            if (staffAppointments.length > 0) {
                const mergedRanges = mergeTimeRanges(staffAppointments)
                
                // 允许首尾10分钟重叠：实际检测时段收缩10分钟
                hasConflict = mergedRanges.some(range => {
                    const effectiveStart = currentMinutes + OVERLAP_TOLERANCE
                    const effectiveEnd = proposedEndTimeMinutes - OVERLAP_TOLERANCE
                    return effectiveStart < range.end && effectiveEnd > range.start
                })
                
                if (hasConflict) {
                    const conflictRange = mergedRanges.find(range => {
                        const effectiveStart = currentMinutes + OVERLAP_TOLERANCE
                        const effectiveEnd = proposedEndTimeMinutes - OVERLAP_TOLERANCE
                        return effectiveStart < range.end && effectiveEnd > range.start
                    })
                    
                    if (conflictRange) {
                        const conflictTask = staffAppointments.find(task => {
                            const taskStart = parseTimeToMinutes(task.startTime)
                            const taskEnd = parseTimeToMinutes(task.endTime)
                            return taskStart <= conflictRange.start && taskEnd >= conflictRange.end
                        }) || staffAppointments[0]
                        
                        const isReservation = !conflictTask.technician
                        const customerName = conflictTask.surname || conflictTask.customerName || '顾客'
                        const gender = conflictTask.gender === 'male' ? '先生' : '女士'
                        occupiedReason = `${formatMinutesToTime(conflictRange.start)}-${formatMinutesToTime(conflictRange.end)} ${customerName}${gender}${isReservation ? '(预约)' : ''}`
                    }
                }
            }

            const nonClockInReservations = filteredReservations.filter(r => r.isClockIn !== true && r.technicianName === staff.name)
            let hasNonClockInConflict = false
            
            if (nonClockInReservations.length > 0) {
                const nonClockInMergedRanges = mergeTimeRanges(nonClockInReservations)
                hasNonClockInConflict = nonClockInMergedRanges.some(range => {
                    const effectiveStart = currentMinutes + OVERLAP_TOLERANCE
                    const effectiveEnd = proposedEndTimeMinutes - OVERLAP_TOLERANCE
                    return effectiveStart < range.end && effectiveEnd > range.start
                })
            }

            const position = staffPositionMap.has(staff._id) ? staffPositionMap.get(staff._id) : 999

            return {
                _id: staff._id,
                name: staff.name,
                gender: staff.gender,
                phone: staff.phone || '',
                wechatWorkId: staff.wechatWorkId || '',
                isOccupied: hasConflict,
                occupiedReason,
                hasNonClockInConflict,
                position: position
            }
        })

        return {
            code: 0,
            message: '获取成功',
            data: technicians.sort((a, b) => a.position - b.position)
        }
    } catch (error) {
        return {
            code: -1,
            message: '获取失败: ' + error.message
        }
    }
}

/**
 * 计算单个技师的可用时段文本（对应前端 calculateAvailableSlots）
 * @param {Array} staffConsultations - 技师的咨询单记录（已按技师过滤）
 * @param {Array} staffReservations  - 技师的预约记录（已按技师过滤）
 * @param {string} shift             - 班次类型
 * @param {boolean} isToday          - 是否为今天
 * @param {number} currentHour       - 当前小时（isToday时使用）
 * @param {number} currentMinute     - 当前分钟（isToday时使用）
 * @returns {string} 可用时段文本
 */
function calculateAvailableSlotsText(staffConsultations, staffReservations, shift, isToday, currentHour, currentMinute) {
    const shiftStart = SHIFT_START_TIME[shift]
    const shiftEnd = SHIFT_END_TIME[shift]

    if (!shiftStart || !shiftEnd) return '未排班'

    // 今天且已超出下班时间
    if (isToday) {
        const shiftEndHour = parseInt(shiftEnd.substring(0, 2))
        if (currentHour >= shiftEndHour) return '已下班'
    }

    // 已占用时段：合并咨询单与预约
    const allRecords = [...staffConsultations, ...staffReservations]
    const occupiedSlots = allRecords
        .filter(r => r.startTime && r.endTime && r.startTime < shiftEnd && r.endTime > shiftStart)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))

    // 计算搜索起始时间（与前端逻辑一致：向上取整到下一个半小时）
    let startTime = shiftStart
    if (isToday) {
        const shiftStartHour = parseInt(shiftStart.substring(0, 2))
        const shiftStartMinute = parseInt(shiftStart.substring(3))
        if (currentHour > shiftStartHour || (currentHour === shiftStartHour && currentMinute >= shiftStartMinute)) {
            const nextMinute = currentMinute < 30 ? 30 : 60
            const nextHour = nextMinute === 60 ? currentHour + 1 : currentHour
            if (nextMinute === 60) {
                startTime = `${String(nextHour).padStart(2, '0')}:00`
            } else {
                startTime = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`
            }
        }
    }

    if (occupiedSlots.length === 0) {
        if (startTime >= shiftEnd) return '已满'
        const duration = parseTimeToMinutes(shiftEnd) - parseTimeToMinutes(startTime)
        return `${startTime}-${shiftEnd} (${duration}分)`
    }

    const availableSlots = []
    for (let i = 0; i <= occupiedSlots.length; i++) {
        const slotEnd = i === 0 ? startTime : occupiedSlots[i - 1].endTime
        const slotStart = i === occupiedSlots.length ? shiftEnd : occupiedSlots[i].startTime

        if (slotEnd >= shiftEnd) break

        const actualStart = slotEnd < startTime ? startTime : slotEnd
        const actualEnd = slotStart > shiftEnd ? shiftEnd : slotStart

        if (actualStart >= actualEnd) continue

        const gap = parseTimeToMinutes(actualEnd) - parseTimeToMinutes(actualStart)
        if (gap >= 60) {
            availableSlots.push(`${actualStart}-${actualEnd} (${gap}分)`)
        }
    }

    return availableSlots.length === 0 ? '已满' : availableSlots.join(', ')
}

/**
 * 构建快速预约时段（对应前端 calculateQuickReservationSlots）
 * @param {Array}   rotationItems  - 轮牌技师列表（已含 _id、name、gender、shift）
 * @param {Array}   allConsultations - 当日所有咨询单
 * @param {Array}   allReservations  - 当日所有活跃预约
 * @param {boolean} isToday          - 是否为今天
 * @param {number}  currentMins      - 今日当前分钟数（isToday时使用）
 * @returns {{ oneMale, oneFemale, twoMale, twoFemale }}
 */
function buildQuickReservationSlots(rotationItems, allConsultations, allReservations, isToday, currentMins) {
    const staffByGender = { male: [], female: [] }
    rotationItems.forEach(staff => {
        if (staff.gender === 'male') staffByGender.male.push(staff)
        else if (staff.gender === 'female') staffByGender.female.push(staff)
    })

    // 构建每位技师的合并占用时段
    const staffOccupiedSlots = new Map()
    rotationItems.forEach(staff => {
        const shiftStart = SHIFT_START_TIME[staff.shift]
        const shiftEnd = SHIFT_END_TIME[staff.shift]

        if (!shiftStart || !shiftEnd) {
            staffOccupiedSlots.set(staff._id, [])
            return
        }

        const staffConsultations = allConsultations.filter(c => c.technician === staff.name && !c.isVoided)
        const staffReservations = allReservations.filter(r => r.technicianId === staff._id || r.technicianName === staff.name)

        const rawSlots = []
        staffConsultations.forEach(record => {
            if (record.startTime && record.endTime) {
                rawSlots.push({ start: parseTimeToMinutes(record.startTime), end: parseTimeToMinutes(record.endTime) })
            }
        })
        staffReservations.forEach(reservation => {
            if (reservation.startTime && reservation.endTime) {
                rawSlots.push({ start: parseTimeToMinutes(reservation.startTime), end: parseTimeToMinutes(reservation.endTime) })
            }
        })

        rawSlots.sort((a, b) => a.start - b.start)

        const mergedSlots = []
        if (rawSlots.length > 0) {
            let cur = { ...rawSlots[0] }
            for (let i = 1; i < rawSlots.length; i++) {
                const next = rawSlots[i]
                if (next.start <= cur.end) {
                    cur.end = Math.max(cur.end, next.end)
                } else {
                    mergedSlots.push({ ...cur })
                    cur = { ...next }
                }
            }
            mergedSlots.push({ ...cur })
        }

        staffOccupiedSlots.set(staff._id, mergedSlots)
    })

    // 找出指定性别、指定人数的所有可用时段
    const findAllAvailableSlots = (staffList, requiredCount) => {
        if (staffList.length < requiredCount) return []

        const staffAvailableSlots = new Map()
        staffList.forEach(staff => {
            const shiftStart = SHIFT_START_TIME[staff.shift]
            const shiftEnd = SHIFT_END_TIME[staff.shift]

            if (!shiftStart || !shiftEnd) {
                staffAvailableSlots.set(staff._id, [])
                return
            }

            const shiftStartMins = parseTimeToMinutes(shiftStart)
            const shiftEndMins = parseTimeToMinutes(shiftEnd)

            let searchStart = shiftStartMins
            if (isToday) {
                searchStart = Math.max(currentMins, shiftStartMins)
            }

            const occupiedSlots = staffOccupiedSlots.get(staff._id) || []
            const availableSlots = []
            let cur = searchStart

            while (cur < shiftEndMins) {
                const activeOccupied = occupiedSlots.find(slot => slot.start <= cur && cur < slot.end)
                if (activeOccupied) {
                    cur = activeOccupied.end
                    continue
                }

                const nextOccupied = occupiedSlots.find(slot => slot.start > cur && slot.start < shiftEndMins)
                let slotEnd = shiftEndMins
                if (nextOccupied) slotEnd = Math.min(shiftEndMins, nextOccupied.start)

                const duration = slotEnd - cur
                if (duration >= 60) {
                    availableSlots.push({ start: cur, end: slotEnd, duration })
                }

                cur = slotEnd
                if (nextOccupied) cur = nextOccupied.end
            }

            staffAvailableSlots.set(staff._id, availableSlots)
        })

        if (requiredCount === 1) {
            const slotMap = new Map()
            staffList.forEach(staff => {
                const slots = staffAvailableSlots.get(staff._id) || []
                slots.forEach(slot => {
                    const slotText = `${formatMinutesToTime(slot.start)}-${formatMinutesToTime(slot.end)} (${slot.duration}分)`
                    if (!slotMap.has(slotText)) slotMap.set(slotText, [])
                    slotMap.get(slotText).push(staff.name)
                })
            })
            return Array.from(slotMap.entries())
                .map(([time, staffNames]) => ({ time, staffNames }))
                .sort((a, b) => a.time.localeCompare(b.time))
        }

        // requiredCount === 2：计算两人时段重叠
        const commonSlotsMap = new Map()
        for (let i = 0; i < staffList.length; i++) {
            for (let j = i + 1; j < staffList.length; j++) {
                const slots1 = staffAvailableSlots.get(staffList[i]._id) || []
                const slots2 = staffAvailableSlots.get(staffList[j]._id) || []
                slots1.forEach(slot1 => {
                    slots2.forEach(slot2 => {
                        const overlapStart = Math.max(slot1.start, slot2.start)
                        const overlapEnd = Math.min(slot1.end, slot2.end)
                        const overlapDuration = overlapEnd - overlapStart
                        if (overlapDuration >= 60) {
                            const slotText = `${formatMinutesToTime(overlapStart)}-${formatMinutesToTime(overlapEnd)} (${overlapDuration}分)`
                            if (!commonSlotsMap.has(slotText)) {
                                commonSlotsMap.set(slotText, [staffList[i].name, staffList[j].name])
                            }
                        }
                    })
                })
            }
        }
        return Array.from(commonSlotsMap.entries())
            .map(([time, staffNames]) => ({ time, staffNames }))
            .sort((a, b) => a.time.localeCompare(b.time))
    }

    return {
        oneMale: findAllAvailableSlots(staffByGender.male, 1),
        oneFemale: findAllAvailableSlots(staffByGender.female, 1),
        twoMale: findAllAvailableSlots(staffByGender.male, 2),
        twoFemale: findAllAvailableSlots(staffByGender.female, 2)
    }
}

/**
 * 轮牌+快速预约时段整合计算（mode: 'rotationQuickSlots'）
 * 将前端 calculateAvailableSlots + calculateQuickReservationSlots 的逻辑统一在此
 */
async function getRotationQuickSlots(date) {
    try {
        const { todayStr, currentHour, currentMinute, currentMins } = getChinaTime()
        const isToday = date === todayStr

        // 并行获取所有所需数据
        const [scheduleRes, consultationsRes, reservationsRes, rotationRes] = await Promise.all([
            db.collection('schedule').where({ date }).get(),
            db.collection('consultation_records').where({ date, isVoided: false }).get(),
            db.collection('reservations').where({ date, status: 'active' }).get(),
            db.collection('rotation_queue').where({ date }).get()
        ])

        const schedules = scheduleRes.data || []
        const consultations = consultationsRes.data || []
        const reservations = reservationsRes.data || []

        const rotationData = rotationRes.data && rotationRes.data.length > 0 ? rotationRes.data[0] : null
        const rotationStaffList = rotationData && rotationData.staffList ? rotationData.staffList : []

        if (rotationStaffList.length === 0) {
            return {
                code: 0,
                message: '获取成功',
                data: {
                    rotationItems: [],
                    quickReservationSlots: { oneMale: [], oneFemale: [], twoMale: [], twoFemale: [] }
                }
            }
        }

        const scheduleMap = new Map(schedules.map(s => [s.staffId, s]))
        const onDutyStaffIds = schedules
            .filter(s => s.shift !== 'leave' && s.shift !== 'off')
            .map(s => s.staffId)

        if (onDutyStaffIds.length === 0) {
            return {
                code: 0,
                message: '获取成功',
                data: {
                    rotationItems: [],
                    quickReservationSlots: { oneMale: [], oneFemale: [], twoMale: [], twoFemale: [] }
                }
            }
        }

        const staffRes = await db.collection('staff').where({
            status: 'active',
            _id: _.in(onDutyStaffIds)
        }).get()
        const staffList = staffRes.data || []
        const staffMap = new Map(staffList.map(s => [s._id, s]))

        // 构建轮牌列表，含可用时段文本、服务时长、预约数
        const rotationItems = rotationStaffList.map((item, index) => {
            const staff = staffMap.get(item.staffId)
            if (!staff) return null

            const schedule = scheduleMap.get(item.staffId)
            const shift = schedule ? schedule.shift : 'evening'

            const staffConsultations = consultations.filter(c => c.technician === staff.name)
            const staffReservations = reservations.filter(r => r.technicianId === item.staffId || r.technicianName === staff.name)

            // 今日已服务时长
            let totalServiceMinutes = 0
            staffConsultations.forEach(c => {
                if (c.startTime && c.endTime) {
                    totalServiceMinutes += parseTimeToMinutes(c.endTime) - parseTimeToMinutes(c.startTime)
                }
            })
            const totalServiceHours = (totalServiceMinutes / 60).toFixed(1)

            // 可用时段文本
            const availableSlots = calculateAvailableSlotsText(
                staffConsultations, staffReservations, shift, isToday, currentHour, currentMinute
            )

            return {
                _id: item.staffId,
                name: staff.name,
                avatar: staff.avatar || '',
                gender: staff.gender,
                shift,
                position: index + 1,
                availableSlots,
                totalServiceHours,
                reservationCount: staffReservations.length
            }
        }).filter(Boolean)

        // 构建快速预约时段
        const quickReservationSlots = buildQuickReservationSlots(
            rotationItems, consultations, reservations, isToday, currentMins
        )

        return {
            code: 0,
            message: '获取成功',
            data: { rotationItems, quickReservationSlots }
        }
    } catch (error) {
        return {
            code: -1,
            message: '获取失败: ' + error.message,
            data: null
        }
    }
}

/**
 * 计算单个技师当前可用状态（用于 availability mode）
 * @param {Array}  staffConsultations - 技师的咨询单记录（已过滤）
 * @param {Array}  staffReservations  - 技师的预约记录（已过滤）
 * @param {string} shift              - 班次类型
 * @param {number} currentMinutes     - 当前时间（分钟数，UTC+8）
 * @returns {{ status: string, latestAppointment: string|null, availableMinutes: number|null }}
 */
function computeStaffAvailabilityStatus(staffConsultations, staffReservations, shift, currentMinutes) {
    const shiftStartTime = SHIFT_START_TIME[shift] || SHIFT_START_TIME['evening']
    const shiftEndTime = SHIFT_END_TIME[shift] || SHIFT_END_TIME['evening']

    if (!shiftStartTime || !shiftEndTime) {
        return { status: 'off_duty', latestAppointment: '未排班', availableMinutes: null }
    }

    const shiftStartMinutes = parseTimeToMinutes(shiftStartTime)
    const shiftEndMinutes = parseTimeToMinutes(shiftEndTime)

    if (currentMinutes < shiftStartMinutes) {
        return { status: 'off_duty', latestAppointment: `${shiftStartTime}上班`, availableMinutes: null }
    }
    if (currentMinutes >= shiftEndMinutes) {
        return { status: 'off_duty', latestAppointment: '已下班', availableMinutes: null }
    }

    let latestAppointment = null
    let availableMinutes = null
    let status = 'available'

    const allAppointments = [...staffConsultations, ...staffReservations]
    if (allAppointments.length > 0) {
        const mergedRanges = mergeTimeRanges(allAppointments)
        const activeRange = mergedRanges.find(range => range.start <= currentMinutes && currentMinutes < range.end)

        if (activeRange) {
            latestAppointment = formatMinutesToTime(activeRange.end)
            availableMinutes = activeRange.end - currentMinutes
            status = 'busy'
        } else {
            const upcomingRanges = mergedRanges
                .filter(range => range.start > currentMinutes)
                .sort((a, b) => a.start - b.start)
            if (upcomingRanges.length > 0) {
                availableMinutes = upcomingRanges[0].start - currentMinutes
            }
        }
    }

    return { status, latestAppointment, availableMinutes }
}

async function getTechnicianAvailability(date) {
    try {
        const { currentMins } = getChinaTime()

        // 并行获取所有所需数据（与 getRotationQuickSlots 保持一致）
        const [scheduleRes, consultationsRes, reservationsRes, rotationRes] = await Promise.all([
            db.collection('schedule').where({ date }).get(),
            db.collection('consultation_records').where({ date, isVoided: false }).get(),
            db.collection('reservations').where({ date, status: 'active' }).get(),
            db.collection('rotation_queue').where({ date }).get()
        ])

        const schedules = scheduleRes.data || []
        const consultations = consultationsRes.data || []
        const reservations = reservationsRes.data || []

        const onDutyStaffIds = schedules
            .filter(s => s.shift !== 'leave' && s.shift !== 'off')
            .map(s => s.staffId)

        if (onDutyStaffIds.length === 0) {
            return { code: 0, message: '获取成功', data: [] }
        }

        const staffRes = await db.collection('staff').where({
            status: 'active',
            _id: _.in(onDutyStaffIds)
        }).get()
        const onDutyStaff = staffRes.data || []

        const rotationData = rotationRes.data && rotationRes.data.length > 0 ? rotationRes.data[0] : null
        const rotationStaffList = rotationData && rotationData.staffList ? rotationData.staffList : []
        const staffPositionMap = new Map()
        rotationStaffList.forEach((staffData, index) => {
            staffPositionMap.set(staffData.staffId, index)
        })

        const techList = onDutyStaff.map(staff => {
            const schedule = schedules.find(s => s.staffId === staff._id)
            const shift = schedule ? schedule.shift : 'evening'

            const staffConsultations = consultations.filter(c => c.technician === staff.name)
            const staffReservations = reservations.filter(r => r.technicianName === staff.name)

            const { status, latestAppointment, availableMinutes } = computeStaffAvailabilityStatus(
                staffConsultations, staffReservations, shift, currentMins
            )

            const position = staffPositionMap.has(staff._id) ? staffPositionMap.get(staff._id) : 999

            return {
                _id: staff._id,
                name: staff.name,
                avatar: staff.avatar,
                gender: staff.gender,
                phone: staff.phone || '',
                wechatWorkId: staff.wechatWorkId || '',
                latestAppointment,
                availableMinutes,
                status,
                position
            }
        })

        return {
            code: 0,
            message: '获取成功',
            data: techList.sort((a, b) => a.position - b.position)
        }
    } catch (error) {
        return {
            code: -1,
            message: '获取失败: ' + error.message,
            data: []
        }
    }
}

/**
 * 计算技师在指定日期的总空闲时长（分钟）
 * @param {Object} technician - 技师信息
 * @param {Array} staffConsultations - 技师的咨询单记录
 * @param {Array} staffReservations - 技师的预约记录
 * @param {string} shift - 班次类型
 * @returns {number} 空闲时长（分钟）
 */
function calculateFreeMinutes(technician, staffConsultations, staffReservations, shift) {
    const shiftStartTime = SHIFT_START_TIME[shift] || SHIFT_START_TIME['evening']
    const shiftEndTime = SHIFT_END_TIME[shift] || SHIFT_END_TIME['evening']
    
    const shiftStartMinutes = parseTimeToMinutes(shiftStartTime)
    const shiftEndMinutes = parseTimeToMinutes(shiftEndTime)
    
    const allAppointments = [...staffConsultations, ...staffReservations]
    if (allAppointments.length === 0) {
        return shiftEndMinutes - shiftStartMinutes
    }
    
    const mergedRanges = mergeTimeRanges(allAppointments)
    
    let occupiedMinutes = 0
    mergedRanges.forEach(range => {
        const actualStart = Math.max(range.start, shiftStartMinutes)
        const actualEnd = Math.min(range.end, shiftEndMinutes)
        if (actualEnd > actualStart) {
            occupiedMinutes += actualEnd - actualStart
        }
    })
    
    return (shiftEndMinutes - shiftStartMinutes) - occupiedMinutes
}

/**
 * 检查技师在指定时间是否可用（考虑5分钟重叠容差）
 * @param {number} proposedStart - 预约开始时间（分钟）
 * @param {number} proposedEnd - 预约结束时间（分钟）
 * @param {Array} staffConsultations - 技师的咨询单记录
 * @param {Array} staffReservations - 技师的预约记录
 * @returns {{ available: boolean, reason: string }}
 */
function checkTechnicianAvailability(proposedStart, proposedEnd, staffConsultations, staffReservations) {
    const OVERLAP_TOLERANCE = 5
    
    const allAppointments = [...staffConsultations, ...staffReservations]
    if (allAppointments.length === 0) {
        return { available: true, reason: '空闲' }
    }
    
    const mergedRanges = mergeTimeRanges(allAppointments)
    
    const effectiveStart = proposedStart + OVERLAP_TOLERANCE
    const effectiveEnd = proposedEnd - OVERLAP_TOLERANCE
    
    for (const range of mergedRanges) {
        if (effectiveStart < range.end && effectiveEnd > range.start) {
            return { 
                available: false, 
                reason: `与 ${formatMinutesToTime(range.start)}-${formatMinutesToTime(range.end)} 冲突` 
            }
        }
    }
    
    return { available: true, reason: '空闲' }
}

/**
 * 计算技师与拟分配时段的最大重叠分钟数（用于智能重排排序）
 * 重叠度 = 所有已占用时段与拟分配时段的实际重叠分钟数之和
 * 返回0表示完全不重叠
 * @param {number} proposedStart - 预约开始时间（分钟）
 * @param {number} proposedEnd - 预约结束时间（分钟）
 * @param {Array} staffConsultations - 技师的咨询单记录
 * @param {Array} staffReservations - 技师的预约记录
 * @returns {number} 总重叠分钟数
 */
function calculateOverlapMinutes(proposedStart, proposedEnd, staffConsultations, staffReservations) {
    const allAppointments = [...staffConsultations, ...staffReservations]
    if (allAppointments.length === 0) {
        return 0
    }
    
    const mergedRanges = mergeTimeRanges(allAppointments)
    let totalOverlap = 0
    
    for (const range of mergedRanges) {
        const overlapStart = Math.max(proposedStart, range.start)
        const overlapEnd = Math.min(proposedEnd, range.end)
        if (overlapEnd > overlapStart) {
            totalOverlap += (overlapEnd - overlapStart)
        }
    }
    
    return totalOverlap
}

/**
 * 预约单重排算法（mode: 'rearrange'）
 * 1. 点钟预约单始终不变
 * 2. 严格按照性别要求匹配技师
 * 3. 轮钟预约按以下优先级分配：
 *    - 优先级1：重叠度越低越优先（0分钟重叠最优，允许≤10分钟的轻微重叠）
 *    - 优先级2：轮牌队列位置越靠前越优先
 *    - 优先级3：空闲时间越多越优先（均匀化微调）
 *    - 超过10分钟重叠的技师不参与分配
 * @param {string} date - 日期（YYYY-MM-DD）
 * @returns {{ code: number, message: string, data: { unchanged: Array, rearranged: Array, unassigned: Array } }}
 */
async function rearrangeReservations(date) {
    try {
        const [scheduleRes, consultationsRes, reservationsRes, rotationRes, staffRes] = await Promise.all([
            db.collection('schedule').where({ date }).get(),
            db.collection('consultation_records').where({ date, isVoided: false }).get(),
            db.collection('reservations').where({ date, status: 'active' }).get(),
            db.collection('rotation_queue').where({ date }).get(),
            db.collection('staff').where({ status: 'active' }).get()
        ])

        const schedules = scheduleRes.data || []
        const consultations = consultationsRes.data || []
        const reservations = reservationsRes.data || []
        const staffList = staffRes.data || []
        
        const rotationData = rotationRes.data && rotationRes.data.length > 0 ? rotationRes.data[0] : null
        const rotationStaffList = rotationData && rotationData.staffList ? rotationData.staffList : []
        
        // 建立 staffId → 轮牌队列位置 映射（位置越小优先级越高）
        const staffPositionMap = new Map()
        rotationStaffList.forEach((staffData, index) => {
            staffPositionMap.set(staffData.staffId, index)
        })
        
        const onDutyStaffIds = schedules
            .filter(s => s.shift !== 'leave' && s.shift !== 'off')
            .map(s => s.staffId)
            
        const onDutyStaff = staffList.filter(s => onDutyStaffIds.includes(s._id))
        const scheduleMap = new Map(schedules.map(s => [s.staffId, s]))
        const staffMap = new Map(staffList.map(s => [s._id, s]))
        
        const clockInReservations = reservations.filter(r => r.isClockIn === true)
        const nonClockInReservations = reservations.filter(r => r.isClockIn !== true)
        
        const staffConsultationsMap = new Map()
        const staffReservationsMap = new Map()
        
        onDutyStaff.forEach(staff => {
            staffConsultationsMap.set(staff._id, consultations.filter(c => c.technician === staff.name))
            // 重排时只保留点钟预约作为固定占用，轮钟预约全部重新分配
            const clockInResvs = clockInReservations.filter(r => 
                (r.technicianId === staff._id || r.technicianName === staff.name)
            )
            staffReservationsMap.set(staff._id, [...clockInResvs])
        })
        
        const result = {
            unchanged: [],
            rearranged: [],
            unassigned: []
        }
        
        clockInReservations.forEach(res => {
            result.unchanged.push({
                ...res,
                originalTechnician: res.technicianName,
                newTechnician: res.technicianName,
                reason: '点钟预约，保持不变'
            })
        })
        
        nonClockInReservations.sort((a, b) => {
            return parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
        })
        
        nonClockInReservations.forEach(res => {
            const proposedStart = parseTimeToMinutes(res.startTime)
            const proposedEnd = parseTimeToMinutes(res.endTime)
            
            // 获取技师性别要求（优先使用新增字段，兼容旧数据）
            const requiredGenders = []
            if (res.requirementType === 'gender') {
                if (res.requiredMaleCount > 0) {
                    requiredGenders.push('male')
                }
                if (res.requiredFemaleCount > 0) {
                    requiredGenders.push('female')
                }
            } else if (res.genderRequirement) {
                requiredGenders.push(res.genderRequirement)
            } else {
                requiredGenders.push(res.gender)
            }
            
            const availableTechnicians = []
            
            onDutyStaff.forEach(staff => {
                if (!requiredGenders.includes(staff.gender)) {
                    return
                }
                
                const staffConsults = staffConsultationsMap.get(staff._id) || []
                const staffResvs = staffReservationsMap.get(staff._id) || []
                
                // 计算重叠度（分钟），而非硬判断可用/不可用
                const overlapMinutes = calculateOverlapMinutes(proposedStart, proposedEnd, staffConsults, staffResvs)
                
                // 允许最多10分钟重叠（首尾交接），超过则不分配
                const MAX_OVERLAP_ALLOWED = 10
                if (overlapMinutes > MAX_OVERLAP_ALLOWED) {
                    return
                }
                
                const schedule = scheduleMap.get(staff._id)
                const shift = schedule ? schedule.shift : 'evening'
                const freeMinutes = calculateFreeMinutes(staff, staffConsults, staffResvs, shift)
                // 使用轮牌队列位置作为排序依据之一
                const position = staffPositionMap.has(staff._id) ? staffPositionMap.get(staff._id) : 999
                
                availableTechnicians.push({
                    staff,
                    position,
                    freeMinutes,
                    overlapMinutes,
                    reason: overlapMinutes === 0 ? '空闲' : `重叠${overlapMinutes}分钟`
                })
            })
            
            if (availableTechnicians.length === 0) {
                result.unassigned.push({
                    ...res,
                    originalTechnician: res.technicianName || '未分配',
                    newTechnician: null,
                    reason: `无符合性别要求（${requiredGenders.join(', ')}）且重叠≤10分钟的技师`
                })
                return
            }
            
            // 排序优先级：重叠度（越低越优先）→ 轮牌位置 → 空闲时间（多的优先）
            availableTechnicians.sort((a, b) => {
                // 优先级1：重叠度，0重叠的绝对优先
                if (a.overlapMinutes !== b.overlapMinutes) {
                    return a.overlapMinutes - b.overlapMinutes
                }
                // 优先级2：轮牌队列位置
                if (a.position !== b.position) {
                    return a.position - b.position
                }
                // 优先级3：空闲时间多的优先
                return b.freeMinutes - a.freeMinutes
            })
            
            const bestTech = availableTechnicians[0]
            
            result.rearranged.push({
                ...res,
                originalTechnician: res.technicianName || '未分配',
                newTechnician: bestTech.staff.name,
                newTechnicianId: bestTech.staff._id,
                reason: `轮牌位${bestTech.position + 1}，重叠${bestTech.overlapMinutes}分钟，空闲${bestTech.freeMinutes}分钟`
            })
            
            // 更新该技师的占用时段（供后续预约冲突检测使用）
            const currentResvs = staffReservationsMap.get(bestTech.staff._id) || []
            staffReservationsMap.set(bestTech.staff._id, [...currentResvs, res])
        })
        
        try {
            const updateTasks = []
            
            for (const item of result.rearranged) {
                updateTasks.push(
                    db.collection('reservations').where({ _id: item._id }).update({
                        data: {
                            technicianId: item.newTechnicianId,
                            technicianName: item.newTechnician,
                            rearrangeConflict: false
                        }
                    })
                )
            }
            
            for (const item of result.unassigned) {
                updateTasks.push(
                    db.collection('reservations').where({ _id: item._id }).update({
                        data: {
                            rearrangeConflict: true
                        }
                    })
                )
            }
            
            for (const item of result.unchanged) {
                updateTasks.push(
                    db.collection('reservations').where({ _id: item._id }).update({
                        data: {
                            rearrangeConflict: false
                        }
                    })
                )
            }
            
            if (updateTasks.length > 0) {
                await Promise.all(updateTasks)
            }
        } catch (updateError) {
            console.warn('[重排] 更新预约记录失败:', updateError.message)
        }
        
        return {
            code: 0,
            message: '重排完成',
            data: {
                unchanged: result.unchanged,
                rearranged: result.rearranged,
                unassigned: result.unassigned,
                summary: {
                    total: reservations.length,
                    unchangedCount: result.unchanged.length,
                    rearrangedCount: result.rearranged.length,
                    unassignedCount: result.unassigned.length
                }
            }
        }
    } catch (error) {
        return {
            code: -1,
            message: '重排失败: ' + error.message,
            data: null
        }
    }
}