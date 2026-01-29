const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { date, currentTime, projectDuration, currentReservationIds } = event
  
  if (!date || !currentTime || !projectDuration) {
    return {
      code: -1,
      message: '缺少必要参数'
    }
  }

  try {
    // 计算预估结束时间
    const proposedEndTimeMinutes = parseTimeToMinutes(currentTime) + projectDuration + 10
    
    // 获取预约数据
    const reservationsRes = await db.collection('reservations').where({
      date: date
    }).get()
    const reservations = reservationsRes.data || []
    
    // 过滤掉当前加载的预约ID（用于冲突检查时排除）
    const filteredReservations = reservations.filter(r => !currentReservationIds || !currentReservationIds.includes(r.id))
    
    // 获取员工数据
    const staffRes = await db.collection('staff').where({
      status: 'active'
    }).get()
    const activeStaff = staffRes.data || []
    
    // 获取当日咨询单数据
    const consultationsRes = await db.collection('consultations').where({
      date: date,
      isVoided: false
    }).get()
    const todayRecords = consultationsRes.data || []
    
    // 检查每个技师的可用性
    const technicians = activeStaff.map(staff => {
      let occupiedReason = ''
      const conflictTask = [...todayRecords, ...filteredReservations].find(r => {
        const rName = r.technician || r.technicianName
        if (rName !== staff.name) return false
        
        const rStartMinutes = parseTimeToMinutes(r.startTime)
        const rEndMinutes = parseTimeToMinutes(r.endTime)
        
        return currentTime < rEndMinutes && proposedEndTimeMinutes > rStartMinutes
      })
      
      if (conflictTask) {
        const isReservation = !conflictTask.technician
        const customerName = conflictTask.surname || conflictTask.customerName || '顾客'
        const gender = conflictTask.gender === 'male' ? '先生' : '女士'
        occupiedReason = `${conflictTask.startTime}-${conflictTask.endTime} ${customerName}${gender}${isReservation ? '(预约)' : ''}`
      }
      
      return {
        id: staff.id,
        name: staff.name,
        isOccupied: !!conflictTask,
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
