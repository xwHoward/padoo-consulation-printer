const cloud = require('wx-server-sdk')
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
    traceUser: true
})

const db = cloud.database()
const _ = db.command

const DEFAULT_PERMISSIONS = {
    // 页面权限
    canAccessIndex: false,
    canAccessCashier: false,
    canAccessHistory: false,
    canAccessStaff: false,
    canAccessRooms: false,
    canAccessCustomers: false,
    // 按钮权限
    canVoidConsultation: false,
    canEditConsultation: false,
    canDeleteConsultation: false,
    canEditReservation: false,
    canCancelReservation: false,
    canManageStaff: false,
    canManageSchedule: false,
    canManageRooms: false,
    canSettleConsultation: false,
    canExportData: false,
    // 数据操作权限
    dataScope: 'own',
    canViewAllHistory: false,
    canEditOwnOnly: true
}

const ROLE_PERMISSIONS = {
    admin: {
        canAccessIndex: true,
        canAccessCashier: true,
        canAccessHistory: true,
        canAccessStaff: true,
        canAccessRooms: true,
        canAccessCustomers: true,
        canVoidConsultation: true,
        canEditConsultation: true,
        canDeleteConsultation: true,
        canEditReservation: true,
        canCancelReservation: true,
        canManageStaff: true,
        canManageSchedule: true,
        canManageRooms: true,
        canSettleConsultation: true,
        canExportData: true,
        dataScope: 'all',
        canViewAllHistory: true,
        canEditOwnOnly: false
    },
    cashier: {
        canAccessIndex: true,
        canAccessCashier: true,
        canAccessHistory: true,
        canAccessStaff: false,
        canAccessRooms: false,
        canAccessCustomers: true,
        canVoidConsultation: true,
        canEditConsultation: true,
        canDeleteConsultation: false,
        canEditReservation: true,
        canCancelReservation: true,
        canManageStaff: false,
        canManageSchedule: false,
        canManageRooms: false,
        canSettleConsultation: true,
        canExportData: false,
        dataScope: 'all',
        canViewAllHistory: true,
        canEditOwnOnly: false
    },
    technician: {
        canAccessIndex: true,
        canAccessCashier: false,
        canAccessHistory: true,
        canAccessStaff: false,
        canAccessRooms: false,
        canAccessCustomers: true,
        canVoidConsultation: false,
        canEditConsultation: true,
        canDeleteConsultation: false,
        canEditReservation: false,
        canCancelReservation: false,
        canManageStaff: false,
        canManageSchedule: false,
        canManageRooms: false,
        canSettleConsultation: false,
        canExportData: false,
        dataScope: 'own',
        canViewAllHistory: false,
        canEditOwnOnly: true
    },
    viewer: {
        canAccessIndex: false,
        canAccessCashier: false,
        canAccessHistory: true,
        canAccessStaff: false,
        canAccessRooms: false,
        canAccessCustomers: true,
        canVoidConsultation: false,
        canEditConsultation: false,
        canDeleteConsultation: false,
        canEditReservation: false,
        canCancelReservation: false,
        canManageStaff: false,
        canManageSchedule: false,
        canManageRooms: false,
        canSettleConsultation: false,
        canExportData: false,
        dataScope: 'all',
        canViewAllHistory: true,
        canEditOwnOnly: false
    }
}

exports.main = async (event, context) => {
    const { code, action } = event

    if (action === 'refresh') {
        return await refreshUserInfo()
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
                role: 'viewer',
                status: 'active',
                permissions: { ...DEFAULT_PERMISSIONS },
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
        console.error('登录失败:', error)
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
        console.error('刷新用户信息失败:', error)
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
