const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
    const { action, staffId } = event

    if (!action) {
        return {
            code: -1,
            message: '缺少必要参数: action'
        }
    }

    try {
        const _ = db.command

        switch (action) {
            case 'schedule': {
                const { shift } = event
                if (!staffId || !shift) {
                    return {
                        code: -1,
                        message: '缺少必要参数: staffId 或 shift'
                    }
                }
                let weightChange = 0
                if (shift === 'off' || shift === 'leave') {
                    weightChange = -1
                } else if (shift === 'morning') {
                    weightChange = 1
                }
                if (weightChange !== 0) {
                    const result = await db.collection('staff').doc(staffId).update({
                        data: {
                            weight: _.inc(weightChange)
                        }
                    })

                    return {
                        code: 0,
                        message: '更新成功',
                        data: result
                    }
                }

                return {
                    code: 0,
                    message: '权重无需更新',
                    data: null
                }
            }

            case 'reservation': {
                const { isClockIn } = event
                if (!staffId) {
                    return {
                        code: -1,
                        message: '缺少必要参数: staffId'
                    }
                }

                if (isClockIn) {
                    return {
                        code: 0,
                        message: '点钟不更新权重',
                        data: null
                    }
                }

                const result = await db.collection('staff').doc(staffId).update({
                    data: {
                        weight: _.inc(-1)
                    }
                })

                return {
                    code: 0,
                    message: '更新成功',
                    data: result
                }
            }

            case 'consultation': {
                const { isClockIn } = event
                if (!staffId) {
                    return {
                        code: -1,
                        message: '缺少必要参数: staffId'
                    }
                }

                if (isClockIn) {
                    return {
                        code: 0,
                        message: '点钟不更新权重',
                        data: null
                    }
                }

                const result = await db.collection('staff').doc(staffId).update({
                    data: {
                        // 咨询单完成后，权重增加1
                        weight: _.inc(1)
                    }
                })

                return {
                    code: 0,
                    message: '更新成功',
                    data: result
                }
            }

            case 'cancelReservation': {
                const { isClockIn } = event
                if (!staffId) {
                    return {
                        code: -1,
                        message: '缺少必要参数: staffId'
                    }
                }

                if (isClockIn) {
                    return {
                        code: 0,
                        message: '点钟不更新权重',
                        data: null
                    }
                }

                const result = await db.collection('staff').doc(staffId).update({
                    data: {
                        weight: _.inc(1)
                    }
                })

                return {
                    code: 0,
                    message: '更新成功',
                    data: result
                }
            }

            default:
                return {
                    code: -1,
                    message: '不支持的操作类型: ' + action
                }
        }
    } catch (error) {
        console.error('更新员工权重失败:', error)
        return {
            code: -1,
            message: '更新失败: ' + error.message
        }
    }
}
