const cloud = require('wx-server-sdk')
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

function parseTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
}

function mergeTimeRanges(appointments) {
    if (!appointments || appointments.length === 0) return []
    
    const ranges = appointments.map(app => ({
        start: parseTimeToMinutes(app.startTime),
        end: parseTimeToMinutes(app.endTime)
    }))
    
    ranges.sort((a, b) => a.start - b.start)
    
    const merged = []
    let current = ranges[0]
    
    for (let i = 1; i < ranges.length; i++) {
        const next = ranges[i]
        
        if (next.start <= current.end) {
            current.end = Math.max(current.end, next.end)
        } else {
            merged.push({ ...current })
            current = next
        }
    }
    
    merged.push({ ...current })
    
    return merged
}

function formatMinutesToTime(minutes) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

async function getTechnicianAvailability(date) {
    try {
        const now = new Date()
        
        const utcNow = new Date(now.getTime() + (8 * 60 * 60 * 1000))
        const currentMinutes = utcNow.getHours() * 60 + utcNow.getMinutes()

        const scheduleRes = await db.collection('schedule').where({
            date: date
        }).get()
        const schedules = scheduleRes.data || []

        const onDutyStaffIds = schedules
            .filter(s => s.shift !== 'leave' && s.shift !== 'off')
            .map(s => s.staffId)

        if (onDutyStaffIds.length === 0) {
            return {
                code: 0,
                message: '获取成功',
                data: []
            }
        }

        const staffRes = await db.collection('staff').where({
            status: 'active',
            _id: _.in(onDutyStaffIds)
        }).get()
        const onDutyStaff = staffRes.data || []

        const consultationsRes = await db.collection('consultation_records').where({
            date: date,
            isVoided: false
        }).get()
        const consultations = consultationsRes.data || []

        const reservationsRes = await db.collection('reservations').where({
            date: date,
            status: 'active'
        }).get()
        const reservations = reservationsRes.data || []

        const rotationRes = await db.collection('rotation_queue').where({
            date: date
        }).get()
        const rotationData = rotationRes.data && rotationRes.data.length > 0 ? rotationRes.data[0] : null
        const rotationStaffList = rotationData && rotationData.staffList ? rotationData.staffList : []

        const staffPositionMap = new Map()
        rotationStaffList.forEach((staffData, index) => {
            staffPositionMap.set(staffData.staffId, index)
        })

        const SHIFT_START_TIME = {
            'morning': '12:00',
            'evening': '13:00'
        }

        const SHIFT_END_TIME = {
            'morning': '22:00',
            'evening': '23:00'
        }

        const techList = onDutyStaff.map(staff => {
            const schedule = schedules.find(s => s.staffId === staff._id)
            const shift = schedule ? schedule.shift : 'evening'
            
            const shiftStartTime = SHIFT_START_TIME[shift] || SHIFT_START_TIME['evening']
            const shiftEndTime = SHIFT_END_TIME[shift] || SHIFT_END_TIME['evening']
            
            const shiftStartMinutes = parseTimeToMinutes(shiftStartTime)
            const shiftEndMinutes = parseTimeToMinutes(shiftEndTime)

            let latestAppointment = null
            let availableMinutes = null
            let status = 'available'
            const nowMinutes = currentMinutes

            if (nowMinutes < shiftStartMinutes) {
                status = 'off_duty'
                latestAppointment = `${shiftStartTime}上班`
            } else if (nowMinutes >= shiftEndMinutes) {
                status = 'off_duty'
                latestAppointment = '已下班'
            } else {
                const staffConsultations = consultations.filter(c => c.technician === staff.name)
                const staffReservations = reservations.filter(r => r.technicianName === staff.name)

                const allAppointments = [
                    ...staffConsultations.map(c => ({ ...c, type: 'consultation' })),
                    ...staffReservations.map(r => ({ ...r, type: 'reservation' }))
                ]

                if (allAppointments.length > 0) {
                    const mergedRanges = mergeTimeRanges(allAppointments)
                    
                    const activeRange = mergedRanges.find(range => {
                        return range.start <= nowMinutes && nowMinutes < range.end
                    })

                    if (activeRange) {
                        latestAppointment = formatMinutesToTime(activeRange.end)
                        availableMinutes = activeRange.end - nowMinutes
                        status = 'busy'
                    } else {
                        const upcomingRanges = mergedRanges
                            .filter(range => range.start > nowMinutes)
                            .sort((a, b) => a.start - b.start)

                        if (upcomingRanges.length > 0) {
                            const nextRange = upcomingRanges[0]
                            availableMinutes = nextRange.start - nowMinutes
                            status = 'available'
                        }
                    }
                }
            }

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
                position: position
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