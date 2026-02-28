const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const MAX_LIMIT = 1000

exports.main = async (event, context) => {
  const { collection } = event
  
  if (!collection) {
    return {
      code: -1,
      message: '请指定集合名称'
    }
  }

  try {
    
    let allData = []
    let hasMore = true
    let lastId = null

    while (hasMore) {
      const query = db.collection(collection).limit(MAX_LIMIT)
      
      if (lastId) {
        query = query.where({
          _id: db.command.gt(lastId)
        })
      }

      const res = await query.get()
      const data = res.data || []
      
      allData = allData.concat(data)
      
      if (data.length < MAX_LIMIT) {
        hasMore = false
      } else {
        lastId = data[data.length - 1]._id
      }
    }

    return {
      code: 0,
      message: '获取成功',
      data: allData,
      count: allData.length
    }
  } catch (error) {
    return {
      code: -1,
      message: '获取失败: ' + error.message
    }
  }
}
