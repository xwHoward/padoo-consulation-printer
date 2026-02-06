const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const { phone } = event

    if (!phone || typeof phone !== 'string') {
      return {
        code: -1,
        message: '缺少phone参数'
      }
    }

    const phoneClean = phone.trim()
    
    const consultationsRes = await db.collection('consultation_records')
      .where({
        phone: phoneClean
      })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()

    const consultationRecords = consultationsRes.data || []

    const visitRecords = consultationRecords.map(record => {
      return {
        _id: record._id,
        date: record.createdAt.substring(0, 10),
        project: record.project,
        technician: record.technician,
        room: record.room,
        amount: record.amount,
        isClockIn: record.isClockIn,
        isVoided: record.isVoided,
        startTime: record.startTime,
        endTime: record.endTime,
        couponPlatform: record.couponPlatform,
        couponCode: record.couponCode
      }
    })

    const customerRes = await db.collection('customers')
      .where({
        phone: phoneClean
      })
      .get()

    const customer = customerRes.data && customerRes.data.length > 0 
      ? customerRes.data[0] 
      : null

    const customerMembershipsRes = await db.collection('customer_membership')
      .where({
        customerPhone: phoneClean
      })
      .orderBy('createdAt', 'desc')
      .get()

    const customerMemberships = customerMembershipsRes.data || []

    const membershipUsageRes = await db.collection('membership_usage')
      .where({
        customerPhone: phoneClean
      })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()

    const membershipUsageRecords = membershipUsageRes.data || []

    return {
      code: 0,
      message: '获取成功',
      data: {
        customer,
        visitRecords,
        customerMemberships,
        membershipUsageRecords,
        totalVisits: visitRecords.length,
        totalAmount: visitRecords.reduce((sum, record) => {
          if (record.isVoided) return sum
          return sum + (record.amount || 0)
        }, 0)
      }
    }
  } catch (error) {
    console.error('获取顾客历史失败:', error)
    return {
      code: -1,
      message: '获取失败: ' + error.message
    }
  }
}
