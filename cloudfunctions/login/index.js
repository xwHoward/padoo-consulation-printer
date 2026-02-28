const cloud = require('wx-server-sdk')
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
    traceUser: true
})

const db = cloud.database()
const _ = db.command


exports.main = async (event, context) => {
    const { code, action, staffId } = event

    if (action === 'refresh') {
        return await refreshUserInfo()
    }

    if (action === 'updateStaffId') {
        return await updateStaffId(staffId)
    }

    if (!code) {
        return {
            code: -1,
            message: '缺少code参数'
        }
    }

    try {
        const wxContext = cloud.getWXContext()
        const { OPENID } = wxContext

        const userRes = await db.collection('users').where({
            openId: OPENID
        }).get()

        let user
        let isNewUser = false
        if (userRes.data && userRes.data.length > 0) {
            user = userRes.data[0]

            const now = new Date()
            await db.collection('users').doc(user._id).update({
                data: {
                    lastLoginAt: now.toISOString()
                }
            })

            user.lastLoginAt = now.toISOString()
        } else {
            isNewUser = true
            const now = new Date()
            const newUser = {
                openId: OPENID,
                role: 'technician',
                status: 'active',
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
                lastLoginAt: now.toISOString()
            }

            const addRes = await db.collection('users').add({
                data: newUser
            })

            user = {
                id: addRes._id,
                _id: addRes._id,
                ...newUser
            }
        }

        const token = generateToken(user)

        return {
            code: 0,
            message: '登录成功',
            data: {
                user: user,
                token: token,
                isNewUser: isNewUser
            }
        }
    } catch (error) {
        return {
            code: -1,
            message: '登录失败: ' + error.message
        }
    }
}

async function refreshUserInfo() {
    const wxContext = cloud.getWXContext()
    const { OPENID } = wxContext

    try {
        const userRes = await db.collection('users').where({
            openId: OPENID
        }).get()

        if (!userRes.data || userRes.data.length === 0) {
            return {
                code: -1,
                message: '用户不存在'
            }
        }

        const user = userRes.data[0]
        const token = generateToken(user)

        return {
            code: 0,
            message: '刷新成功',
            data: {
                user: user,
                token: token,
                isNewUser: false
            }
        }
    } catch (error) {
        return {
            code: -1,
            message: '刷新失败: ' + error.message
        }
    }
}

function generateToken(user) {
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2)
    return Buffer.from(`${user.openId}:${timestamp}:${randomStr}`).toString('base64')
}

async function updateStaffId(staffId) {
    const wxContext = cloud.getWXContext()
    const { OPENID } = wxContext

    try {
        const userRes = await db.collection('users').where({
            openId: OPENID
        }).get()

        if (!userRes.data || userRes.data.length === 0) {
            return {
                code: -1,
                message: '用户不存在'
            }
        }

        const user = userRes.data[0]

        const now = new Date()
        await db.collection('users').doc(user._id).update({
            data: {
                staffId: staffId,
                updatedAt: now.toISOString()
            }
        })

        user.staffId = staffId
        user.updatedAt = now.toISOString()

        const token = generateToken(user)

        return {
            code: 0,
            message: '更新成功',
            data: {
                user: user,
                token: token
            }
        }
    } catch (error) {
        return {
            code: -1,
            message: '更新失败: ' + error.message
        }
    }
}
