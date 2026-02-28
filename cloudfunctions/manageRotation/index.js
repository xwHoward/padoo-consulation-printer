const cloud = require('wx-server-sdk')
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { action, date, staffId, isClockIn } = event

    try {
        switch (action) {
            case 'init':
                return await initRotationQueue(date)
            case 'getNext':
                return await getNextTechnician(date)
            case 'serveCustomer':
                return await serveCustomer(date, staffId, isClockIn)
            case 'getQueue':
                return await getRotationQueue(date)
            case 'adjustPosition':
                return await adjustPosition(date, event.fromIndex, event.toIndex)
            default:
                return {
                    code: -1,
                    message: '未知操作'
                }
        }
    } catch (error) {
        return {
            code: -1,
            message: '操作失败: ' + error.message
        }
    }
}

async function initRotationQueue(date) {
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
            message: '当天无在班员工',
            data: []
        }
    }

    const existingQueue = await db.collection('rotation_queue').where({
        date: date
    }).get()

    if (existingQueue.data.length > 0) {
        return {
            code: 0,
            message: '轮牌已存在',
            data: existingQueue.data[0]
        }
    }

    const staffRes = await db.collection('staff').where({
        status: 'active',
        _id: _.in(onDutyStaffIds)
    }).get()
    const staffList = staffRes.data || []

    const yesterday = getYesterday(date)
    const yesterdayScheduleRes = await db.collection('schedule').where({
        date: yesterday
    }).get()
    const yesterdaySchedules = yesterdayScheduleRes.data || []

    const yesterdayRotationRes = await db.collection('rotation_queue').where({
        date: yesterday
    }).get()
    const yesterdayRotation = yesterdayRotationRes.data[0]

    const staffWithPriority = staffList.map(staff => {
        const yesterdaySchedule = yesterdaySchedules.find(s => s.staffId === staff._id)
        const wasOnDutyYesterday = yesterdaySchedule && 
            yesterdaySchedule.shift !== 'leave' && 
            yesterdaySchedule.shift !== 'off'

        const todaySchedule = schedules.find(s => s.staffId === staff._id)
        const shift = todaySchedule ? todaySchedule.shift : 'evening'

        let priority = 0

        if (shift === 'morning') {
            priority = 1000
        }

        if (!wasOnDutyYesterday) {
            priority -= 500
        } else if (yesterdayRotation) {
            const yesterdayStaff = yesterdayRotation.staffList.find(s => s.staffId === staff._id)
            if (yesterdayStaff) {
                priority += yesterdayStaff.orderCount * 10
            }
        }

        return {
            staffId: staff._id,
            name: staff.name,
            avatar: staff.avatar,
            phone: staff.phone,
            gender: staff.gender,
            shift: shift,
            priority: priority,
            orderCount: 0,
            lastServedTime: null
        }
    })

    staffWithPriority.sort((a, b) => b.priority - a.priority)

    const staffListWithOrder = staffWithPriority.map((staff, index) => ({
        ...staff,
        position: index
    }))

    const result = await db.collection('rotation_queue').add({
        data: {
            date: date,
            staffList: staffListWithOrder,
            currentIndex: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    })

    const queue = await db.collection('rotation_queue').doc(result._id).get()

    return {
        code: 0,
        message: '轮牌初始化成功',
        data: queue.data
    }
}

async function getNextTechnician(date) {
    let queue = await db.collection('rotation_queue').where({
        date: date
    }).get()

    if (queue.data.length === 0) {
        const initResult = await initRotationQueue(date)
        if (initResult.code !== 0) {
            return initResult
        }
        queue = await db.collection('rotation_queue').where({
            date: date
        }).get()
    }

    const queueData = queue.data[0]

    if (queueData.staffList.length === 0) {
        return {
            code: -1,
            message: '暂无在班员工'
        }
    }

    const currentStaff = queueData.staffList[queueData.currentIndex]

    return {
        code: 0,
        message: '获取成功',
        data: {
            staff: currentStaff,
            queue: queueData.staffList,
            currentIndex: queueData.currentIndex
        }
    }
}

async function serveCustomer(date, staffId, isClockIn) {
    const queueRes = await db.collection('rotation_queue').where({
        date: date
    }).get()

    if (queueRes.data.length === 0) {
        return {
            code: -1,
            message: '轮牌不存在'
        }
    }

    const queueData = queueRes.data[0]
    const staffList = [...queueData.staffList]
    const staffIndex = staffList.findIndex(s => s.staffId === staffId)

    if (staffIndex === -1) {
        return {
            code: -1,
            message: '员工不在轮牌中'
        }
    }

    if (isClockIn) {
        staffList[staffIndex].orderCount += 1
        staffList[staffIndex].lastServedTime = new Date().toISOString()
    } else {
        const servedStaff = staffList.splice(staffIndex, 1)[0]
        servedStaff.orderCount += 1
        servedStaff.lastServedTime = new Date().toISOString()
        staffList.push(servedStaff)

        const newIndex = staffList.findIndex(s => s.staffId === staffId)
        for (let i = newIndex; i < staffList.length; i++) {
            staffList[i].position = i
        }
    }

    let nextIndex = queueData.currentIndex
    const currentStaff = staffList[nextIndex]

    if (currentStaff && currentStaff.staffId === staffId) {
        nextIndex = (nextIndex + 1) % staffList.length
    }

    await db.collection('rotation_queue').doc(queueData._id).update({
        data: {
            staffList: staffList,
            currentIndex: nextIndex,
            updatedAt: new Date().toISOString()
        }
    })

    return {
        code: 0,
        message: '服务完成',
        data: {
            staffList: staffList,
            currentIndex: nextIndex
        }
    }
}

async function getRotationQueue(date) {
    let queue = await db.collection('rotation_queue').where({
        date: date
    }).get()

    if (queue.data.length === 0) {
        const initResult = await initRotationQueue(date)
        if (initResult.code !== 0) {
            return {
                code: 0,
                message: '暂无轮牌数据',
                data: { staffList: [], currentIndex: 0 }
            }
        }
        queue = await db.collection('rotation_queue').where({
            date: date
        }).get()
    }

    return {
        code: 0,
        message: '获取成功',
        data: queue.data[0]
    }
}

async function adjustPosition(date, fromIndex, toIndex) {
    const queueRes = await db.collection('rotation_queue').where({
        date: date
    }).get()

    if (queueRes.data.length === 0) {
        return {
            code: -1,
            message: '轮牌不存在'
        }
    }

    const queueData = queueRes.data[0]
    const staffList = [...queueData.staffList]

    if (fromIndex < 0 || fromIndex >= staffList.length || toIndex < 0 || toIndex >= staffList.length) {
        return {
            code: -1,
            message: '索引无效'
        }
    }

    const [movedStaff] = staffList.splice(fromIndex, 1)
    staffList.splice(toIndex, 0, movedStaff)

    for (let i = 0; i < staffList.length; i++) {
        staffList[i].position = i
    }

    await db.collection('rotation_queue').doc(queueData._id).update({
        data: {
            staffList: staffList,
            updatedAt: new Date().toISOString()
        }
    })

    return {
        code: 0,
        message: '调整成功',
        data: staffList
    }
}

function getYesterday(date) {
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
}

function parseTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
}
