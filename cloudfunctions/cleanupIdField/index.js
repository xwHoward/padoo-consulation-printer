const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const { collections } = event

    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return {
        code: -1,
        message: '请指定要清理的集合'
      }
    }

    const results = []

    for (const collectionName of collections) {
      console.log(`开始处理集合: ${collectionName}`)

      try {
        const { data: records } = await db.collection(collectionName)
          .limit(1000)
          .get()

        if (!records || records.length === 0) {
          results.push({
            collection: collectionName,
            success: true,
            message: '无数据需要处理',
            processed: 0
          })
          continue
        }

        let processedCount = 0
        let errorCount = 0

        for (const record of records) {
          if (!record.id) {
            continue
          }

          try {
            await db.collection(collectionName).doc(record._id).update({
              data: {
                id: _.remove()
              }
            })
            processedCount++
            console.log(`已更新记录 ${record._id}`)
          } catch (error) {
            errorCount++
            console.error(`更新记录 ${record._id} 失败:`, error)
          }
        }

        results.push({
          collection: collectionName,
          success: true,
          message: `处理完成，成功${processedCount}条，失败${errorCount}条`,
          processed: processedCount,
          errors: errorCount
        })

      } catch (error) {
        console.error(`处理集合 ${collectionName} 失败:`, error)
        results.push({
          collection: collectionName,
          success: false,
          message: `处理失败: ${error.message}`,
          processed: 0,
          errors: 0
        })
      }
    }

    return {
      code: 0,
      message: '清理完成',
      data: results
    }
  } catch (error) {
    console.error('清理id字段失败:', error)
    return {
      code: -1,
      message: '清理失败: ' + error.message
    }
  }
}
