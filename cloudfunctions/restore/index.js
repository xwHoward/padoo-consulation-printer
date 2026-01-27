const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { backupData, options } = event
  
  if (!backupData || typeof backupData !== 'object') {
    return {
      code: -1,
      message: '备份数据格式错误'
    }
  }

  const overwrite = options?.overwrite || false
  const results = {
    success: [],
    failed: [],
    skipped: []
  }

  try {
    for (const collectionName in backupData) {
      const records = backupData[collectionName]
      
      if (!Array.isArray(records)) {
        continue
      }

      try {
        const existingCount = await db.collection(collectionName).count()
        
        if (existingCount.total > 0 && !overwrite) {
          results.skipped.push({
            collection: collectionName,
            reason: '集合已有数据且未开启覆盖模式'
          })
          continue
        }

        if (overwrite) {
          await db.collection(collectionName).where({
            _id: _.exists(true)
          }).remove()
        }

        const insertPromises = records.map(record => {
          const { _id, ...data } = record
          return db.collection(collectionName).add({
            data
          })
        })

        await Promise.all(insertPromises)
        
        results.success.push({
          collection: collectionName,
          count: records.length
        })
      } catch (error) {
        console.error(`恢复集合 ${collectionName} 失败:`, error)
        results.failed.push({
          collection: collectionName,
          error: error.message
        })
      }
    }

    return {
      code: 0,
      message: '恢复完成',
      data: results
    }
  } catch (error) {
    console.error('恢复失败:', error)
    return {
      code: -1,
      message: '恢复失败: ' + error.message
    }
  }
}
