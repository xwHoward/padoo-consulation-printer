const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { collections } = event
  
  if (!collections || !Array.isArray(collections)) {
    return {
      code: -1,
      message: '请指定要备份的集合列表'
    }
  }

  try {
    const backupData = {}

    for (const collectionName of collections) {
      const res = await db.collection(collectionName).get()
      backupData[collectionName] = res.data || []
    }

    return {
      code: 0,
      message: '备份成功',
      data: backupData,
      timestamp: new Date().toISOString(),
      count: Object.keys(backupData).reduce((total, key) => {
        return total + backupData[key].length
      }, 0)
    }
  } catch (error) {
    console.error('备份失败:', error)
    return {
      code: -1,
      message: '备份失败: ' + error.message
    }
  }
}
