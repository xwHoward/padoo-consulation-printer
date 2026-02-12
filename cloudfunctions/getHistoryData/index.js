const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const SHIFT_TIMES = {
  'morning': {
    start: '10:00',
    end: '22:00'
  },
  'evening': {
    start: '12:00',
    end: '23:00'
  }
};

function calculateOvertimeUnits(startTime, endTime, shiftStart, shiftEnd) {
  if (!startTime || !endTime || !shiftStart || !shiftEnd) return 0;

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const [shiftStartHour, shiftStartMinute] = shiftStart.split(':').map(Number);
  const [shiftEndHour, shiftEndMinute] = shiftEnd.split(':').map(Number);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const shiftStartMinutes = shiftStartHour * 60 + shiftStartMinute;
  const shiftEndMinutes = shiftEndHour * 60 + shiftEndMinute;

  let overtimeMinutes = 0;

  if (startMinutes < 540) {
    overtimeMinutes += endMinutes;
  } else if (startMinutes >= 540 && startMinutes < shiftStartMinutes) {
    overtimeMinutes += shiftStartMinutes - startMinutes;
  }

  if (endMinutes > shiftEndMinutes) {
    overtimeMinutes += endMinutes - shiftEndMinutes;
  }

  return overtimeMinutes > 0 ? Math.floor(overtimeMinutes / 30) : 0;
}

function parseProjectDuration(project) {
  const match = project.match(/(\d+)min/);
  return match ? parseInt(match[1], 10) : 60;
}

function formatTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

async function getDailyRecordsWithCount(date) {
  const recordsResult = await db.collection('consultation_records').where({
    date: date
  }).orderBy('createdAt', 'asc').get();

  const records = recordsResult.data;
  const technicianCounts = {};

  const processedRecords = records.map(record => {
    if (!technicianCounts[record.technician]) {
      technicianCounts[record.technician] = 0;
    }

    if (!record.isVoided) {
      technicianCounts[record.technician]++;
    }

    let startTimeStr = record.startTime;
    let endTimeStr = record.endTime;

    if (!startTimeStr || !endTimeStr) {
      const createdDate = new Date(record.createdAt);
      startTimeStr = formatTime(createdDate);

      const projectDuration = parseProjectDuration(record.project);
      const totalDuration = projectDuration + (record.extraTime || 0) + 10;
      const endDate = new Date(createdDate.getTime() + totalDuration * 60 * 1000);
      endTimeStr = formatTime(endDate);
    }

    return {
      ...record,
      dailyCount: record.isVoided ? 0 : technicianCounts[record.technician],
      startTime: startTimeStr,
      endTime: endTimeStr,
      collapsed: record.isVoided
    };
  });

  return processedRecords.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

exports.main = async (event) => {
  const { action, targetDate, customerPhone, customerId } = event;

  try {
    if (action === 'loadAllDates') {
      const allRecordsResult = await db.collection('consultation_records').field({
        date: true,
        createdAt: true
      }).get();
      const dateMap = {};
      allRecordsResult.data.forEach(record => {
        const date = record.date || record.createdAt.substring(0, 10);
        if (!dateMap[date]) {
          dateMap[date] = 0;
        }
        dateMap[date]++;
      });

      const allDates = Object.keys(dateMap).sort((a, b) => new Date(b) - new Date(a));

      const selectedDate = targetDate || allDates[0];
      let historyData = [];

      if (selectedDate) {
        const records = await getDailyRecordsWithCount(selectedDate);
        historyData = [{
          date: selectedDate,
          records: records
        }];
      }

      return {
        code: 0,
        data: {
          allDates,
          selectedDate,
          historyData
        }
      };

    } else if (action === 'loadCustomerHistory') {
      if (!customerPhone || !customerId) {
        return {
          code: -1,
          message: '缺少必要参数'
        };
      }

      const allRecordsResult = await db.collection('consultation_records').where({
        phone: customerPhone
      }).orderBy('createdAt', 'desc').get();

      const consultationHistory = {};
      allRecordsResult.data.forEach(record => {
        const date = record.createdAt.substring(0, 10);
        if (!consultationHistory[date]) {
          consultationHistory[date] = [];
        }
        consultationHistory[date].push(record);
      });

      const historyData = [];
      const datesToProcess = Object.keys(consultationHistory).sort((a, b) => new Date(b) - new Date(a));

      for (const date of datesToProcess) {
        const records = consultationHistory[date];
        const customerRecords = records.filter(record => {
          const recordKey = record.phone || record._id;
          return recordKey === customerId && !record.isVoided;
        });

        if (customerRecords.length > 0) {

          const updatedRecordsResult = await db.collection('consultation_records').where({
            date: date,
            phone: customerPhone,
            isVoided: false
          }).get();

          const filteredRecords = updatedRecordsResult.data.filter(record => {
            const recordKey = record.phone || record._id;
            return recordKey === customerId && !record.isVoided;
          });

          const processedRecords = [];
          const technicianCounts = {};

          const sortedByTime = filteredRecords.sort((a, b) => {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          });

          sortedByTime.forEach(record => {
            if (!technicianCounts[record.technician]) {
              technicianCounts[record.technician] = 0;
            }

            if (!record.isVoided) {
              technicianCounts[record.technician]++;
            }

            let startTimeStr = record.startTime;
            let endTimeStr = record.endTime;

            if (!startTimeStr || !endTimeStr) {
              const createdDate = new Date(record.createdAt);
              startTimeStr = formatTime(createdDate);

              const projectDuration = parseProjectDuration(record.project);
              const totalDuration = projectDuration + (record.extraTime || 0) + 10;
              const endDate = new Date(createdDate.getTime() + totalDuration * 60 * 1000);
              endTimeStr = formatTime(endDate);
            }

            processedRecords.push({
              ...record,
              dailyCount: technicianCounts[record.technician],
              startTime: startTimeStr,
              endTime: endTimeStr,
              collapsed: record.isVoided
            });
          });

          const finalRecords = processedRecords.sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          historyData.push({
            date,
            records: finalRecords
          });
        }
      }

      historyData.sort((a, b) => new Date(b.date) - new Date(a.date));

      return {
        code: 0,
        data: {
          historyData
        }
      };

    } else if (action === 'getDailySummary') {
      if (!targetDate) {
        return {
          code: -1,
          message: '缺少日期参数'
        };
      }

      const recordsResult = await db.collection('consultation_records').where({
        date: targetDate
      }).get();

      const records = recordsResult.data;
      const technicianStats = {};

      records.forEach(record => {
        if (!record.isVoided) {
          const technician = record.technician;

          if (!technicianStats[technician]) {
            technicianStats[technician] = {
              projects: {},
              clockInCount: 0,
              totalCount: 0,
              extraTimeCount: 0,
              extraTimeTotal: 0,
              overtimeTotal: 0
            };
          }

          if (!technicianStats[technician].projects[record.project]) {
            technicianStats[technician].projects[record.project] = 0;
          }
          technicianStats[technician].projects[record.project]++;

          if (record.isClockIn) {
            technicianStats[technician].clockInCount++;
          }

          if (record.extraTime && record.extraTime > 0) {
            technicianStats[technician].extraTimeCount++;
            technicianStats[technician].extraTimeTotal += record.extraTime;
          }

          if (record.overtime && record.overtime > 0) {
            technicianStats[technician].overtimeTotal = record.overtime;
          }

          technicianStats[technician].totalCount++;
        }
      });

      return {
        code: 0,
        data: {
          technicianStats
        }
      };

    } else {
      return {
        code: -1,
        message: '未知操作类型'
      };
    }

  } catch (error) {
    console.error('云函数执行错误:', error);
    return {
      code: -1,
      message: error.message || '执行失败',
      error: error
    };
  }
};
