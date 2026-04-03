const cloud = require('wx-server-sdk');
const { formatDateTime: formatTime } = require('./shared-utils');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const OVERTIME_DURATION_MAP = {
  45: 1,
  60: 2,
  70: 2,
  80: 2,
  90: 3,
  120: 4
};

function calculateOvertime(duration) {
  if (OVERTIME_DURATION_MAP[ duration ] !== undefined) {
    return OVERTIME_DURATION_MAP[ duration ];
  }
  return Math.floor(duration / 30);
}

function isToday(date) {
  const now = new Date();
  const utcNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const today = new Date(utcNow.getFullYear(), utcNow.getMonth(), utcNow.getDate());
  const recordDate = new Date(date);
  return recordDate.toDateString() === today.toDateString();
}



function parseProjectDuration(project) {
  const match = project.match(/(\d+)min/);
  return match ? parseInt(match[ 1 ], 10) : 60;
}

async function getDailyRecordsWithCount(date) {
  const recordsResult = await db.collection('consultation_records').where({
    date: date
  }).orderBy('createdAt', 'asc').get();

  const records = recordsResult.data;
  const technicianCounts = {};

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const processedRecords = records.map(record => {
    if (!technicianCounts[ record.technician ]) {
      technicianCounts[ record.technician ] = 0;
    }

    if (!record.isVoided) {
      technicianCounts[ record.technician ]++;
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

    const [ startHour, startMinute ] = startTimeStr.split(':').map(Number);
    const [ endHour, endMinute ] = endTimeStr.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const isInProgress = !record.isVoided && isToday(record.createdAt) && currentMinutes >= startMinutes && currentMinutes < endMinutes;

    return {
      ...record,
      dailyCount: record.isVoided ? 0 : technicianCounts[ record.technician ],
      startTime: startTimeStr,
      endTime: endTimeStr,
      collapsed: record.isVoided,
      isInProgress: isInProgress
    };
  });

  return processedRecords.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

exports.main = async (event) => {
  const { action, targetDate, customerPhone, customerId } = event;

  try {
    if (action === 'loadSingleDate') {
      if (!targetDate) {
        return {
          code: -1,
          message: '缺少日期参数'
        };
      }

      const records = await getDailyRecordsWithCount(targetDate);
      const historyData = [ {
        date: targetDate,
        records: records
      } ];

      return {
        code: 0,
        data: {
          selectedDate: targetDate,
          historyData
        }
      };

    } else if (action === 'loadAllDates') {
      const allRecordsResult = await db.collection('consultation_records').field({
        date: true,
        createdAt: true
      }).limit(1000).get();
      const dateMap = {};
      allRecordsResult.data.forEach(record => {
        const date = record.date || record.createdAt.substring(0, 10);
        if (!dateMap[ date ]) {
          dateMap[ date ] = 0;
        }
        dateMap[ date ]++;
      });

      const allDates = Object.keys(dateMap).sort((a, b) => new Date(b) - new Date(a));

      const selectedDate = targetDate || allDates[ 0 ];
      let historyData = [];

      if (selectedDate) {
        const records = await getDailyRecordsWithCount(selectedDate);
        historyData = [ {
          date: selectedDate,
          records: records
        } ];
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
        if (!consultationHistory[ date ]) {
          consultationHistory[ date ] = [];
        }
        consultationHistory[ date ].push(record);
      });

      const historyData = [];
      const datesToProcess = Object.keys(consultationHistory).sort((a, b) => new Date(b) - new Date(a));

      for (const date of datesToProcess) {
        const records = consultationHistory[ date ];
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
            if (!technicianCounts[ record.technician ]) {
              technicianCounts[ record.technician ] = 0;
            }

            if (!record.isVoided) {
              technicianCounts[ record.technician ]++;
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
              dailyCount: technicianCounts[ record.technician ],
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

      const [ recordsResult, schedulesResult, staffResult ] = await Promise.all([
        db.collection('consultation_records').where({ date: targetDate }).get(),
        db.collection('schedule').where({ date: targetDate }).get(),
        db.collection('staff').where({ status: 'active' }).get()
      ]);

      const records = recordsResult.data;
      const scheduleMap = {};
      schedulesResult.data.forEach(s => {
        scheduleMap[ s.staffId ] = s.shift;
      });

      const staffIdMap = {};
      const activeStaffNames = new Set();
      staffResult.data.forEach(s => {
        staffIdMap[ s.name ] = s._id;
        activeStaffNames.add(s.name);
      });

      const technicianStats = {};

      records.forEach(record => {
        if (!record.isVoided) {
          const technician = record.technician;
          
          if (!activeStaffNames.has(technician)) {
            return;
          }

          if (!technicianStats[ technician ]) {
            technicianStats[ technician ] = {
              projects: {},
              clockInCount: 0,
              totalCount: 0,
              extraTimeCount: 0,
              extraTimeTotal: 0,
              overtime: 0,
              guashaCount: 0,
              shift: ''
            };
          }

          if (!technicianStats[ technician ].projects[ record.project ]) {
            technicianStats[ technician ].projects[ record.project ] = 0;
          }
          technicianStats[ technician ].projects[ record.project ]++;

          if (record.isClockIn) {
            technicianStats[ technician ].clockInCount++;
          }

          if (record.extraTime && record.extraTime > 0) {
            technicianStats[ technician ].extraTimeCount++;
            technicianStats[ technician ].extraTimeTotal += record.extraTime;
          }

          if (record.guasha) {
            technicianStats[ technician ].guashaCount++;
          }

          const staffId = staffIdMap[ technician ];
          const shift = staffId ? scheduleMap[ staffId ] : null;

          if (shift === 'overtime') {
            technicianStats[ technician ].shift = 'overtime';
            const projectDuration = parseProjectDuration(record.project);
            const overtime = calculateOvertime(projectDuration);
            technicianStats[ technician ].overtime += overtime;
          } else {
            if (record.overtime) {
              technicianStats[ technician ].overtime += record.overtime;
            }
          }

          technicianStats[ technician ].totalCount++;
        }
      });

      const currentDate = new Date(targetDate);
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth();
      // const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
      const monthStartStr = `${ currentYear }-${ String(currentMonth + 1).padStart(2, '0') }-01`;
      const monthEndStr = `${ currentYear }-${ String(currentMonth + 1).padStart(2, '0') }-${ String(monthEnd.getDate()).padStart(2, '0') }`;

      const monthlyMemberships = await db.collection('customer_membership')
        .where({
          createdAt: db.RegExp({
            regexp: `^(${ currentYear }-${ String(currentMonth + 1).padStart(2, '0') })`
          })
        })
        .get();

      const membershipSales = {};
      monthlyMemberships.data.forEach(membership => {
        const salesStaff = membership.salesStaff;
        if (salesStaff) {
          // TODO: 使用更准确的方式判断次卡数量
          const cardTimes = parseInt(membership.cardName) || 0;

          const staffCount = salesStaff.length;
          const timesPerStaff = Math.floor(cardTimes / staffCount);
          salesStaff.forEach(staff => {
            if (staff) {
              if (!membershipSales[ staff ]) {
                membershipSales[ staff ] = 0;
              }
              membershipSales[ staff ] += timesPerStaff;
            }
          });

        }
      });

      const monthlyClockIns = await db.collection('consultation_records')
        .where({
          date: db.RegExp({
            regexp: `^(${ currentYear }-${ String(currentMonth + 1).padStart(2, '0') })`
          }),
          isClockIn: true,
          isVoided: false
        })
        .get();

      const clockInCounts = {};
      monthlyClockIns.data.forEach(record => {
        const technician = record.technician;
        if (technician) {
          if (!clockInCounts[ technician ]) {
            clockInCounts[ technician ] = 0;
          }
          clockInCounts[ technician ]++;
        }
      });

      const allTechnicians = new Set([
        ...Object.keys(membershipSales),
        ...Object.keys(clockInCounts),
        ...Object.keys(technicianStats)
      ]);

      const monthlyScores = [];
      allTechnicians.forEach(technician => {
        if (!activeStaffNames.has(technician)) {
          return;
        }
        
        const salesCount = membershipSales[ technician ] || 0;
        const clockInCount = clockInCounts[ technician ] || 0;
        const totalScore = salesCount + clockInCount;

        monthlyScores.push({
          technician,
          salesCount,
          clockInCount,
          totalScore
        });
      });

      monthlyScores.sort((a, b) => b.totalScore - a.totalScore);

      const rankedScores = monthlyScores.map((item, index) => ({
        ...item,
        rank: index + 1
      }));

      return {
        code: 0,
        data: {
          technicianStats,
          monthlyScoreRanking: {
            period: {
              year: currentYear,
              month: currentMonth + 1,
              startDate: monthStartStr,
              endDate: monthEndStr
            },
            rankings: rankedScores
          }
        }
      };

    } else {
      return {
        code: -1,
        message: '未知操作类型'
      };
    }

  } catch (error) {
    return {
      code: -1,
      message: error.message || '执行失败',
      error: error
    };
  }
};
