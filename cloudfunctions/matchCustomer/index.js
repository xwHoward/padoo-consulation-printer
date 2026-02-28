const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { surname, gender, phone } = event
  
  if (!surname && !phone) {
    return {
      code: 0,
      message: '无匹配条件',
      data: null
    }
  }

  try {
    const customersRes = await db.collection('customers').get()
    const customers = customersRes.data || []
    
    let bestMatch = null
    let bestScore = 0

    customers.forEach(customer => {
      let score = 0

      if (phone && customer.phone && customer.phone.includes(phone)) {
        if (customer.phone === phone) {
          score += 100
        } else {
          const matchRatio = phone.length / customer.phone.length
          score += Math.round(matchRatio * 80)
        }
      }

      if (surname && customer.name && customer.name.includes(surname)) {
        score += 50
      }

      if (gender && customer.name) {
        const nameEndsWith = customer.name.slice(-1)
        if (gender === 'male' && nameEndsWith === '先生') {
          score += 30
        } else if (gender === 'female' && nameEndsWith === '女士') {
          score += 30
        }
      }

      if (score > bestScore && score >= 30) {
        bestScore = score
        bestMatch = customer
      }
    })

    return {
      code: 0,
      message: bestMatch ? '匹配成功' : '未找到匹配',
      data: bestMatch,
      score: bestScore
    }
  } catch (error) {
    return {
      code: -1,
      message: '匹配失败: ' + error.message
    }
  }
}
