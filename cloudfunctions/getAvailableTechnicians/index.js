const cloud = require('wx-server-sdk')
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { date, currentTime, projectDuration, currentReservationIds, mode } = event

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
        // 计算预估结束时间
        const currentMinutes = parseTimeToMinutes(currentTime)
        const proposedEndTimeMinutes = currentMinutes + projectDuration + 10

        // 获取预约数据
        const reservationsRes = await db.collection('reservations').where({
            date: date
        }).get()
        const reservations = reservationsRes.data || []

        // 过滤掉当前加载的预约ID（用于冲突检查时排除）
        const filteredReservations = reservations.filter(r => !currentReservationIds || !currentReservationIds.includes(r._id))

        // 获取当日排班数据
        const scheduleRes = await db.collection('schedule').where({
            date: date
        }).get()
        const schedules = scheduleRes.data || []
        // 获取排班中的技师ID列表（排除休息状态）
        const scheduledStaffIds = schedules
            .filter(s => s.shift !== 'leave' && s.shift !== 'off')
            .map(s => s.staffId)

        // 获取员工数据
        let activeStaff = []
        if (scheduledStaffIds.length > 0) {
            const staffRes = await db.collection('staff').where({
                status: 'active',
                _id: _.in(scheduledStaffIds)
            }).get()
            activeStaff = staffRes.data || []
        }

        // 获取当日咨询单数据
        const consultationsRes = await db.collection('consultation_records').where({
            date: date,
            isVoided: false
        }).get()
        const todayRecords = consultationsRes.data || []
        // 检查每个技师的可用性
        const technicians = activeStaff.map(staff => {
            let occupiedReason = ''
            // 检查是否有时间冲突
            const hasConflict = [...todayRecords, ...filteredReservations].some(r => {
                const rName = r.technician || r.technicianName
                if (rName !== staff.name) return false
                const rStartMinutes = parseTimeToMinutes(r.startTime)
                const rEndMinutes = parseTimeToMinutes(r.endTime)

                // 检查时间是否重叠：当前开始时间 < 对方结束时间 且 当前结束时间 > 对方开始时间
                return currentMinutes < rEndMinutes && proposedEndTimeMinutes > rStartMinutes
            })

            if (hasConflict) {
                // 找到冲突的任务用于显示原因
                const conflictTask = [...todayRecords, ...filteredReservations].find(r => {
                    const rName = r.technician || r.technicianName
                    if (rName !== staff.name) return false

                    const rStartMinutes = parseTimeToMinutes(r.startTime)
                    const rEndMinutes = parseTimeToMinutes(r.endTime)

                    return currentMinutes < rEndMinutes && proposedEndTimeMinutes > rStartMinutes
                })

                if (conflictTask) {
                    const isReservation = !conflictTask.technician
                    const customerName = conflictTask.surname || conflictTask.customerName || '顾客'
                    const gender = conflictTask.gender === 'male' ? '先生' : '女士'
                    occupiedReason = `${conflictTask.startTime}-${conflictTask.endTime} ${customerName}${gender}${isReservation ? '(预约)' : ''}`
                }
            }

            return {
                _id: staff._id,
                name: staff.name,
                phone: staff.phone || '',
                isOccupied: hasConflict,
                occupiedReason
            }
        })

        return {
            code: 0,
            message: '获取成功',
            data: technicians
        }
    } catch (error) {
        console.error('获取可用技师失败:', error)
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

async function getTechnicianAvailability(date) {
    try {
        const now = new Date()
        
        const utcNow = new Date(now.getTime() + (8 * 60 * 60 * 1000))
        const currentMinutes = utcNow.getHours() * 60 + utcNow.getMinutes()
        // const currentTimeStr = `${String(utcNow.getHours()).padStart(2, '0')}:${String(utcNow.getMinutes()).padStart(2, '0')}`
        
        // console.log('========== 技师可用性计算开始 ==========')
        // console.log('查询日期:', date)
        // console.log('服务器UTC时间:', now.toISOString(), '(小时:', now.getUTCHours(), ')')
        // console.log('转换后中国时间:', currentTimeStr, '(分钟数:', currentMinutes, ')')
        // console.log('时区偏移量(分钟):', now.getTimezoneOffset())

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

        const techList = onDutyStaff.map(staff => {
            const staffConsultations = consultations.filter(c => c.technician === staff.name)

            let latestAppointment = null
            let availableMinutes = null
            let status = 'available'
            const nowMinutes = currentMinutes

            if (staffConsultations.length > 0) {
                const activeConsultation = staffConsultations.find(consultation => {
                    const startTimeMinutes = parseTimeToMinutes(consultation.startTime)
                    const endTimeMinutes = parseTimeToMinutes(consultation.endTime)
                    return startTimeMinutes <= nowMinutes && nowMinutes < endTimeMinutes
                })

                if (activeConsultation) {
                    latestAppointment = activeConsultation.endTime
                    const endTimeMinutes = parseTimeToMinutes(activeConsultation.endTime)
                    availableMinutes = endTimeMinutes - nowMinutes
                    status = 'busy'
                } else {
                    const upcomingConsultations = staffConsultations
                        .filter(consultation => {
                            const startTimeMinutes = parseTimeToMinutes(consultation.startTime)
                            return startTimeMinutes > nowMinutes
                        })
                        .sort((a, b) => {
                            const aStart = parseTimeToMinutes(a.startTime)
                            const bStart = parseTimeToMinutes(b.startTime)
                            return aStart - bStart
                        })

                    if (upcomingConsultations.length > 0) {
                        const nextConsultation = upcomingConsultations[0]
                        const nextStartMinutes = parseTimeToMinutes(nextConsultation.startTime)
                        availableMinutes = nextStartMinutes - nowMinutes
                        status = 'available'
                    }
                }
            }

            return {
                _id: staff._id,
                name: staff.name,
                avatar: staff.avatar,
                gender: staff.gender,
                phone: staff.phone,
                latestAppointment,
                availableMinutes,
                status
            }
        })

        return {
            code: 0,
            message: '获取成功',
            data: techList
        }
    } catch (error) {
        console.error('获取技师可用性失败:', error)
        return {
            code: -1,
            message: '获取失败: ' + error.message,
            data: []
        }
    }
}