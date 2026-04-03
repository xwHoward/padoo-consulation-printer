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

    if (!date || !currentTime || !projectDuration) {
        return {
            code: -1,
            message: '缺少必要参数'
        }
    }
    try {
        const currentMinutes = parseTimeToMinutes(currentTime)
        const proposedEndTimeMinutes = currentMinutes + projectDuration + 10

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
                
                hasConflict = mergedRanges.some(range => {
                    return currentMinutes < range.end && proposedEndTimeMinutes > range.start
                })
                
                if (hasConflict) {
                    const conflictRange = mergedRanges.find(range => {
                        return currentMinutes < range.end && proposedEndTimeMinutes > range.start
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
                    return currentMinutes < range.end && proposedEndTimeMinutes > range.start
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