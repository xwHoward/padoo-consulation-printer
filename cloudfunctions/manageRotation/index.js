const cloud = require('wx-server-sdk')
const { parseTimeToMinutes } = require('./shared-utils')

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
    }).field({ staffId: true, shift: true }).limit(1000).get()
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

    // 并行获取所需数据
    const [staffRes, yesterdayRotationRes] = await Promise.all([
        db.collection('staff').where({
            status: 'active',
            _id: _.in(onDutyStaffIds)
        }).field({ _id: true, name: true, gender: true, avatar: true, phone: true, wechatWorkId: true }).limit(1000).get(),
        db.collection('rotation_queue').where({
            date: getYesterday(date)
        }).field({ staffList: true }).limit(1000).get()
    ])

    const staffList = staffRes.data || []
    const staffMap = new Map(staffList.map(s => [s._id, s]))
    const yesterdayRotation = yesterdayRotationRes.data && yesterdayRotationRes.data.length > 0 ? yesterdayRotationRes.data[0] : null
    const scheduleMap = new Map(schedules.map(s => [s.staffId, s]))

    // 构建今日在班的员工ID集合
    const todayOnDutySet = new Set(onDutyStaffIds)

    let finalOrder = []

    if (yesterdayRotation && yesterdayRotation.staffList && yesterdayRotation.staffList.length > 0) {
        // 有昨日队列：严格继承昨日物理顺序
        const yesterdayStaffIds = yesterdayRotation.staffList.map(s => s.staffId)
        
        // 从昨日队列中保留今日仍在班的员工（保持相对顺序）
        const inheritedStaff = yesterdayRotation.staffList
            .filter(s => todayOnDutySet.has(s.staffId))
            .map(s => s.staffId)
        
        // 今日新增人员（昨日不在队列但今日在班）：休假归来、新员工 → 追加到队尾
        const newStaffIds = onDutyStaffIds.filter(id => !yesterdayStaffIds.includes(id))
        
        // 分离早班员工和非早班员工（从继承列表中）
        const morningStaff = inheritedStaff.filter(id => {
            const schedule = scheduleMap.get(id)
            return schedule && schedule.shift === 'morning'
        })
        const nonMorningStaff = inheritedStaff.filter(id => {
            const schedule = scheduleMap.get(id)
            return !schedule || schedule.shift !== 'morning'
        })
        
        // 最终顺序 = [早班员工（保持继承相对顺序）] + [非早班员工（保持继承顺序）] + [新增人员]
        finalOrder = [...morningStaff, ...nonMorningStaff, ...newStaffIds]
    } else {
        // 无昨日数据（首次使用）：早班优先，其余按员工ID排序
        const morningStaff = onDutyStaffIds.filter(id => {
            const schedule = scheduleMap.get(id)
            return schedule && schedule.shift === 'morning'
        })
        const nonMorningStaff = onDutyStaffIds.filter(id => {
            const schedule = scheduleMap.get(id)
            return !schedule || schedule.shift !== 'morning'
        })
        finalOrder = [...morningStaff, ...nonMorningStaff]
    }

    const staffListWithOrder = finalOrder.map((staffId, index) => {
        const staff = staffMap.get(staffId)
        const schedule = scheduleMap.get(staffId)
        return {
            staffId: staffId,
            name: staff ? staff.name : '',
            avatar: staff ? staff.avatar : '',
            phone: staff ? (staff.phone || '') : '',
            wechatWorkId: staff ? (staff.wechatWorkId || '') : '',
            gender: staff ? staff.gender : 'male',
            shift: schedule ? schedule.shift : 'evening',
            orderCount: 0,
            lastServedTime: null,
            position: index
        }
    }).filter(item => item.name)

    // 使用事务防止竞态条件：检查并创建/更新轮牌队列
    const transaction = await db.startTransaction()
    try {
        // 在事务中重新检查是否已存在
        const existingQueue = await transaction.collection('rotation_queue').where({
            date: date
        }).limit(1000).get()

        const now = new Date().toISOString()
        let queueId

        if (existingQueue.data.length > 0) {
            // 已存在则更新
            queueId = existingQueue.data[0]._id
            await transaction.collection('rotation_queue').doc(queueId).update({
                data: {
                    staffList: staffListWithOrder,
                    currentIndex: 0,
                    updatedAt: now
                }
            })
        } else {
            // 不存在则创建
            const result = await transaction.collection('rotation_queue').add({
                data: {
                    date: date,
                    staffList: staffListWithOrder,
                    currentIndex: 0,
                    createdAt: now,
                    updatedAt: now
                }
            })
            queueId = result._id
        }

        await transaction.commit()

        // 事务提交后获取最新数据
        const queue = await db.collection('rotation_queue').doc(queueId).limit(1000).get()
        return {
            code: 0,
            message: '轮牌初始化成功',
            data: queue.data
        }
    } catch (e) {
        await transaction.rollback()
        // 事务失败可能是因为并发冲突，尝试返回已存在的数据
        const existingQueue = await db.collection('rotation_queue').where({
            date: date
        }).limit(1000).get()
        if (existingQueue.data.length > 0) {
            return {
                code: 0,
                message: '轮牌已存在',
                data: existingQueue.data[0]
            }
        }
        throw e
    }
}

async function getNextTechnician(date) {
    let queueRes = await db.collection('rotation_queue').where({
        date: date
    }).limit(1000).get()

    if (queueRes.data.length === 0) {
        const initResult = await initRotationQueue(date)
        if (initResult.code !== 0) {
            return initResult
        }
        // initRotationQueue 已返回创建后的队列数据，无需再次查询
        const queueData = initResult.data
        return {
            code: 0,
            message: '获取成功',
            data: {
                staff: queueData.staffList[0],
                queue: queueData.staffList,
                currentIndex: 0
            }
        }
    }

    const queueData = queueRes.data[0]

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
    // 使用事务保护读写，防止并发更新丢失
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const transaction = await db.startTransaction();
        try {
            const queueRes = await transaction.collection('rotation_queue').where({
                date: date
            }).limit(1).get();

            if (queueRes.data.length === 0) {
                await transaction.rollback();
                return { code: -1, message: '轮牌不存在' };
            }

            const queueData = queueRes.data[0];
            const staffList = [...queueData.staffList];
            const staffIndex = staffList.findIndex(s => s.staffId === staffId);

            if (staffIndex === -1) {
                await transaction.rollback();
                return { code: -1, message: '员工不在轮牌中' };
            }

            if (isClockIn) {
                staffList[staffIndex].orderCount += 1;
                staffList[staffIndex].lastServedTime = new Date().toISOString();
            } else {
                const servedStaff = staffList.splice(staffIndex, 1)[0];
                servedStaff.orderCount += 1;
                servedStaff.lastServedTime = new Date().toISOString();
                staffList.push(servedStaff);
                for (let i = 0; i < staffList.length; i++) {
                    staffList[i].position = i;
                }
            }

            await transaction.collection('rotation_queue').doc(queueData._id).update({
                data: {
                    staffList: staffList,
                    currentIndex: 0,
                    updatedAt: new Date().toISOString()
                }
            });

            await transaction.commit();
            return {
                code: 0,
                message: '服务完成',
                data: {
                    staffList: staffList,
                    currentIndex: 0
                }
            };
        } catch (error) {
            try { await transaction.rollback(); } catch (e) { /* ignore */ }
            if (attempt < MAX_RETRIES - 1) {
                console.warn('[serveCustomer] 事务冲突重试:', attempt + 1);
                await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
            } else {
                console.error('[serveCustomer] 重试耗尽:', error);
                return { code: -1, message: '服务操作失败，请重试' };
            }
        }
    }

    return { code: -1, message: '服务操作失败' };
}

async function getRotationQueue(date) {
    let queueRes = await db.collection('rotation_queue').where({
        date: date
    }).limit(1000).get()

    if (queueRes.data.length === 0) {
        const initResult = await initRotationQueue(date)
        if (initResult.code !== 0 || !initResult.data) {
            return {
                code: 0,
                message: '暂无轮牌数据',
                data: { staffList: [], currentIndex: 0 }
            }
        }
        // initRotationQueue 已返回创建后的队列数据，无需再次查询
        return {
            code: 0,
            message: '获取成功',
            data: initResult.data
        }
    }

    return {
        code: 0,
        message: '获取成功',
        data: queueRes.data[0]
    }
}

async function adjustPosition(date, fromIndex, toIndex) {
    const queueRes = await db.collection('rotation_queue').where({
        date: date
    }).limit(1000).get()

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
