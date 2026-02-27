const cloud = require('wx-server-sdk')
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
    traceUser: true
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { action, phone } = event
    const wxContext = cloud.getWXContext()
    const { OPENID } = wxContext

    try {
        const userRes = await db.collection('users').where({
            openId: OPENID
        }).get()

        if (!userRes.data || userRes.data.length === 0) {
            return {
                code: -1,
                message: '用户不存在，请先登录'
            }
        }

        const user = userRes.data[0]

        if (action === 'check') {
            return await checkBinding(user)
        }

        if (action === 'bind') {
            return await bindStaff(user, phone)
        }

        if (action === 'unbind') {
            return await unbindStaff(user)
        }

        return {
            code: -1,
            message: '无效的操作'
        }
    } catch (error) {
        console.error('操作失败:', error)
        return {
            code: -1,
            message: '操作失败: ' + error.message
        }
    }
}

async function checkBinding(user) {
    if (!user.staffId) {
        return {
            code: 0,
            message: '未绑定',
            data: {
                bound: false,
                staffInfo: null
            }
        }
    }

    try {
        const staffRes = await db.collection('staff').doc(user.staffId).get()
        if (!staffRes.data) {
            return {
                code: 0,
                message: '员工不存在',
                data: {
                    bound: false,
                    staffInfo: null
                }
            }
        }

        return {
            code: 0,
            message: '已绑定',
            data: {
                bound: true,
                staffInfo: staffRes.data
            }
        }
    } catch (error) {
        return {
            code: -1,
            message: '查询员工信息失败',
            data: {
                bound: false,
                staffInfo: null
            }
        }
    }
}

async function bindStaff(user, phone) {
    if (!phone) {
        return {
            code: -1,
            message: '请输入手机号'
        }
    }

    const phoneReg = /^1[3-9]\d{9}$/
    if (!phoneReg.test(phone)) {
        return {
            code: -1,
            message: '手机号格式不正确'
        }
    }

    if (user.staffId) {
        return {
            code: -1,
            message: '您已经绑定过员工，如需更换请先解绑'
        }
    }

    const staffRes = await db.collection('staff').where({
        phone: phone
    }).get()

    if (!staffRes.data || staffRes.data.length === 0) {
        return {
            code: -1,
            message: '未找到该手机号对应的员工'
        }
    }

    const staff = staffRes.data[0]

    if (staff.status !== 'active') {
        return {
            code: -1,
            message: '该员工已离职，无法绑定'
        }
    }

    const boundUserRes = await db.collection('users').where({
        staffId: staff._id,
        _id: _.neq(user._id)
    }).get()

    if (boundUserRes.data && boundUserRes.data.length > 0) {
        return {
            code: -1,
            message: '该员工已被其他用户绑定'
        }
    }

    await db.collection('users').doc(user._id).update({
        data: {
            staffId: staff._id,
            updatedAt: new Date().toISOString()
        }
    })

    return {
        code: 0,
        message: '绑定成功',
        data: {
            staffInfo: staff
        }
    }
}

async function unbindStaff(user) {
    if (!user.staffId) {
        return {
            code: -1,
            message: '您还未绑定员工'
        }
    }

    await db.collection('users').doc(user._id).update({
        data: {
            staffId: '',
            updatedAt: new Date().toISOString()
        }
    })

    return {
        code: 0,
        message: '解绑成功'
    }
}
