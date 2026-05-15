const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 200;

/**
 * 带重试的睡眠
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 执行带重试的事务保存
 */
async function executeTransaction(consultation) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const transaction = await db.startTransaction();
    try {
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
        await transaction.rollback();
        return { code: 1, message: '该技师在同一时间已有相同项目的记录，请勿重复报钟' };
      }

      const now = new Date().toISOString();
      const result = await transaction.collection('consultation_records').add({
        data: { ...consultation, createdAt: now, updatedAt: now }
      });

      await transaction.commit();
      return { code: 0, data: { _id: result._id, ...consultation, createdAt: now, updatedAt: now }, message: '保存成功' };
    } catch (error) {
      try { await transaction.rollback(); } catch (e) { /* 忽略回滚错误 */ }
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        console.warn(`[saveConsultation] 事务冲突，第${attempt + 1}次重试...`);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError || new Error('事务保存失败');
}

exports.main = async (event, context) => {
  const { consultation, editId } = event;

  try {
    if (editId) {
      const existing = await db.collection('consultation_records').doc(editId).get();
      if (!existing.data) {
        return { code: -1, message: '记录不存在' };
      }
      await db.collection('consultation_records').doc(editId).update({
        data: { ...consultation, updatedAt: db.serverDate() }
      });
      return { code: 0, data: { ...existing.data, ...consultation }, message: '更新成功' };
    }

    return await executeTransaction(consultation);
  } catch (error) {
    console.error('[saveConsultation] 保存失败:', error);
    return { code: -1, message: '保存失败：' + (error.message || '未知错误') };
  }
};
