const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { consultation, editId } = event;
  
  try {
    // 如果是编辑模式，直接更新
    if (editId) {
      const existing = await db.collection('consultation_records').doc(editId).get();
      if (!existing.data) {
        return {
          code: -1,
          message: '记录不存在'
        };
      }
      
      await db.collection('consultation_records').doc(editId).update({
        data: {
          ...consultation,
          updatedAt: db.serverDate()
        }
      });
      
      return {
        code: 0,
        data: { ...existing.data, ...consultation },
        message: '更新成功'
      };
    }
    
    // 新建模式：使用事务检查并插入
    const transaction = await db.startTransaction();
    
    try {
      // 检查重复记录
      const duplicateCheck = await transaction.collection('consultation_records')
        .where({
          date: consultation.date,
          technician: consultation.technician,
          startTime: consultation.startTime,
          project: consultation.project,
          isVoided: false
        })
        .get();
      
      if (duplicateCheck.data.length > 0) {
        await transaction.abort();
        return {
          code: 1,
          message: '该技师在同一时间已有相同项目的记录，请勿重复报钟'
        };
      }
      
      // 插入新记录
      const now = new Date().toISOString();
      const recordData = {
        ...consultation,
        createdAt: now,
        updatedAt: now
      };
      
      const result = await transaction.collection('consultation_records').add({
        data: recordData
      });
      
      await transaction.commit();
      
      return {
        code: 0,
        data: { _id: result._id, ...recordData },
        message: '保存成功'
      };
    } catch (transactionError) {
      await transaction.abort();
      throw transactionError;
    }
  } catch (error) {
    console.error('保存咨询单失败:', error);
    return {
      code: -1,
      message: '保存失败：' + (error.message || '未知错误')
    };
  }
};
