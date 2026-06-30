const cloud = require('wx-server-sdk');
const { formatDateTime: formatTime } = require('./shared-utils');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 计算加班时间
 * @param {*} duration 咨询时间（分钟）
 * @returns 加班个数（单位：半小时）  
 */
function calculateOvertime(duration) {
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
  return match ? parseInt(match[1], 10) : 90;
}

/**
 * 处理单条咨询记录，计算时间信息
 */
function processRecord(record) {
  let startTimeStr = record.startTime;
  let endTimeStr = record.endTime;

  if (!startTimeStr || !endTimeStr) {
    const createdDate = new Date(record.createdAt);
    startTimeStr = formatTime(createdDate);
    const projectDuration = parseProjectDuration(record.project);
    const totalDuration = projectDuration + (record.extraTime || 0);
    const endDate = new Date(createdDate.getTime() + totalDuration * 60 * 1000);
    endTimeStr = formatTime(endDate);
  }

  return { startTime: startTimeStr, endTime: endTimeStr };
}

async function getDailyRecordsWithCount(date) {
  const recordsResult = await db.collection('consultation_records').where({
    date: date
  }).orderBy('createdAt', 'asc').limit(1000).get();

  const records = recordsResult.data;
  const technicianCounts = {};

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const processedRecords = records.map(record => {
    if (!technicianCounts[record.technician]) {
      technicianCounts[record.technician] = 0;
    }

    if (!record.isVoided) {
      technicianCounts[record.technician]++;
    }

    const { startTime: startTimeStr, endTime: endTimeStr } = processRecord(record);

    const [startHour, startMinute] = startTimeStr.split(':').map(Number);
    const [endHour, endMinute] = endTimeStr.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const isInProgress = !record.isVoided && isToday(record.createdAt) && currentMinutes >= startMinutes && currentMinutes < endMinutes;

    return {
      ...record,
      dailyCount: record.isVoided ? 0 : technicianCounts[record.technician],
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
      const historyData = [{
        date: targetDate,
        records: records
      }];

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
      }).field({ _id: true, phone: true, isVoided: true, technician: true, createdAt: true, startTime: true, endTime: true, project: true, extraTime: true, date: true }).orderBy('createdAt', 'desc').limit(1000).get();

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
          // 直接使用初始查询已获取的数据，避免 N+1 重复查询
          const processedRecords = [];
          const technicianCounts = {};

          const sortedByTime = customerRecords.sort((a, b) => {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          });

          sortedByTime.forEach(record => {
            if (!technicianCounts[record.technician]) {
              technicianCounts[record.technician] = 0;
            }

            if (!record.isVoided) {
              technicianCounts[record.technician]++;
            }

            const { startTime: startTimeStr, endTime: endTimeStr } = processRecord(record);

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

      const [recordsResult, schedulesResult, staffResult] = await Promise.all([
        db.collection('consultation_records').where({ date: targetDate }).field({ isVoided: true, technician: true, project: true, isClockIn: true, extraTime: true, isExtraTime: true, guasha: true, overtime: true, startTime: true, endTime: true }).limit(1000).get(),
        db.collection('schedule').where({ date: targetDate }).field({ staffId: true, shift: true }).limit(1000).get(),
        db.collection('staff').where({ status: 'active' }).field({ name: true }).limit(1000).get()
      ]);

      const records = recordsResult.data;
      const scheduleMap = {};
      schedulesResult.data.forEach(s => {
        scheduleMap[s.staffId] = s.shift;
      });

      const staffIdMap = {};
      const activeStaffNames = new Set();
      staffResult.data.forEach(s => {
        staffIdMap[s.name] = s._id;
        activeStaffNames.add(s.name);
      });

      const technicianStats = {};
      const technicianTimes = {};

      records.forEach(record => {
        if (!record.isVoided) {
          const technician = record.technician;

          if (!activeStaffNames.has(technician)) {
            return;
          }

          if (!technicianStats[technician]) {
            technicianStats[technician] = {
              projects: {},
              clockInCount: 0,
              totalCount: 0,
              extraTimeCount: 0,
              extraTimeTotal: 0,
              overtime: 0,
              guashaCount: 0,
              shift: ''
            };
            technicianTimes[technician] = { firstStartMins: Infinity, lastEndMins: -Infinity };
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

          if (record.isExtraTime) {
            technicianStats[technician].extraTimeCount++;
          }

          if (record.guasha) {
            technicianStats[technician].guashaCount++;
          }

          // 记录时间范围：第一个开始时间、最后一个结束时间
          if (record.startTime && record.endTime) {
            const [sh, sm] = record.startTime.split(':').map(Number);
            const [eh, em] = record.endTime.split(':').map(Number);
            const startMins = sh * 60 + sm;
            let endMins = eh * 60 + em;

            if (endMins < startMins) {
              endMins += 24 * 60;
            }

            technicianTimes[technician].firstStartMins = Math.min(
              technicianTimes[technician].firstStartMins, startMins
            );
            technicianTimes[technician].lastEndMins = Math.max(
              technicianTimes[technician].lastEndMins, endMins
            );
          }

          // 记录班次信息
          if (!technicianStats[technician].shift) {
            const staffId = staffIdMap[technician];
            const shift = staffId ? scheduleMap[staffId] : null;
            if (shift) {
              technicianStats[technician].shift = shift;
            }
          }

          technicianStats[technician].totalCount++;
        }
      });

      // 基于第一个钟开始时间和最后一个钟结束时间计算加班
      const SHIFT_BOUNDARIES = {
        morning: { start: 12 * 60, end: 22 * 60 },
        evening: { start: 13 * 60, end: 23 * 60 }
      };

      for (const technician of Object.keys(technicianStats)) {
        const times = technicianTimes[technician];
        if (!times || times.firstStartMins === Infinity) continue;

        const shift = technicianStats[technician].shift;

        if (shift === 'overtime') {
          const totalMins = times.lastEndMins - times.firstStartMins;
          technicianStats[technician].overtime = calculateOvertime(totalMins);
        } else {
          const boundary = SHIFT_BOUNDARIES[shift] || SHIFT_BOUNDARIES.evening;
          let overtimeMins = 0;

          if (times.firstStartMins < boundary.start) {
            overtimeMins += boundary.start - times.firstStartMins;
          }
          if (times.lastEndMins > boundary.end) {
            overtimeMins += times.lastEndMins - boundary.end;
          }
          technicianStats[technician].overtime = calculateOvertime(overtimeMins);
        }
      }

      const currentDate = new Date(targetDate);
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth();
      // const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
      const monthStartStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const monthEndStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

      const monthlyMemberships = await db.collection('customer_membership')
        .where({
          createdAt: db.RegExp({
            regexp: `^(${currentYear}-${String(currentMonth + 1).padStart(2, '0')})`
          })
        })
        .field({ salesStaff: true, cardName: true })
        .limit(1000).get();

      const membershipSales = {};
      monthlyMemberships.data.forEach(membership => {
        const salesStaff = membership.salesStaff;
        if (salesStaff) {
          // TODO: 使用更准确的方式判断次卡数量
          const cardTimes = membership.cardName.includes('2988') ? 20 : parseInt(membership.cardName) || 0;

          const staffCount = salesStaff.length;
          const timesPerStaff = Math.floor(cardTimes / staffCount);
          salesStaff.forEach(staff => {
            if (staff) {
              if (!membershipSales[staff]) {
                membershipSales[staff] = 0;
              }
              membershipSales[staff] += timesPerStaff;
            }
          });

        }
      });

      const monthlyClockIns = await db.collection('consultation_records')
        .where({
          date: db.RegExp({
            regexp: `^(${currentYear}-${String(currentMonth + 1).padStart(2, '0')})`
          }),
          isClockIn: true,
          isVoided: false
        })
        .field({ technician: true })
        .limit(1000).get();

      const clockInCounts = {};
      monthlyClockIns.data.forEach(record => {
        const technician = record.technician;
        if (technician) {
          if (!clockInCounts[technician]) {
            clockInCounts[technician] = 0;
          }
          clockInCounts[technician]++;
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

        const salesCount = membershipSales[technician] || 0;
        const clockInCount = clockInCounts[technician] || 0;
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

      const PERFORMANCE_START_DATE = monthStartStr;

      const [allRecordsSinceStart, wechatRecords, fulfilledRenewals, allMembershipsSinceStart] = await Promise.all([
        db.collection('consultation_records')
          .where({
            date: db.command.gte(PERFORMANCE_START_DATE),
            isVoided: false
          })
          .field({ technician: true, phone: true, _id: true, date: true })
          .limit(1000).get(),
        db.collection('technician_wechat')
          .field({ technician: true, customerId: true })
          .limit(1000).get(),
        db.collection('reservations')
          .where({
            date: db.command.gte(PERFORMANCE_START_DATE),
            isRenewal: true,
            isFulfilled: true
          })
          .field({ technicianName: true, _id: true })
          .limit(1000).get(),
        db.collection('customer_membership')
          .where({
            createdAt: db.command.gte(PERFORMANCE_START_DATE)
          })
          .field({ salesStaff: true, _id: true })
          .limit(1000).get()
      ]);

      const performanceData = {};

      allTechnicians.forEach(technician => {
        if (!activeStaffNames.has(technician)) {
          return;
        }
        performanceData[technician] = {
          returnOrders: 0,
          totalOrders: 0,
          wechatAdds: 0,
          uniqueCustomers: new Set(),
          renewalFulfilled: 0,
          packageSales: 0,
          bonusReturn: 0,
          bonusWechat: 0,
          bonusPackage: 0,
          bonusRenewal: 0,
          totalBonus: 0
        };
      });

      allRecordsSinceStart.data.forEach(record => {
        const tech = record.technician;
        if (!performanceData[tech]) return;
        performanceData[tech].totalOrders++;
        const key = tech + '_' + (record.phone || record._id);
        if (performanceData[tech]._customerMap === undefined) {
          performanceData[tech]._customerMap = {};
        }
        if (!performanceData[tech]._customerMap[key]) {
          performanceData[tech]._customerMap[key] = new Set();
        }
        // 按自然日去重：同一顾客同一天消费多单只计一个日期
        performanceData[tech]._customerMap[key].add(record.date);
        performanceData[tech].uniqueCustomers.add(record.phone || record._id);
      });

      for (const [tech, data] of Object.entries(performanceData)) {
        if (data._customerMap) {
          for (const [key, dates] of Object.entries(data._customerMap)) {
            const distinctDays = dates.size;
            if (distinctDays >= 2) {
              // 回头客 = 不同自然日数 - 1（第一天不算回头）
              data.returnOrders += distinctDays - 1;
            }
          }
        }
      }

      wechatRecords.data.forEach(record => {
        const tech = record.technician;
        if (!performanceData[tech]) return;
        performanceData[tech].wechatAdds++;
      });

      fulfilledRenewals.data.forEach(record => {
        const tech = record.technicianName;
        if (!tech) return;
        if (!performanceData[tech]) return;
        performanceData[tech].renewalFulfilled++;
      });

      allMembershipsSinceStart.data.forEach(record => {
        if (record.salesStaff && record.salesStaff.length > 0) {
          record.salesStaff.forEach(staff => {
            if (!performanceData[staff]) return;
            performanceData[staff].packageSales++;
          });
        }
      });

      for (const [tech, data] of Object.entries(performanceData)) {
        const returnRate = data.totalOrders > 0 ? data.returnOrders / data.totalOrders : 0;
        const wechatRate = data.uniqueCustomers.size > 0 ? data.wechatAdds / data.uniqueCustomers.size : 0;

        if (returnRate >= 0.45) {
          data.bonusReturn = 200;
        } else if (returnRate >= 0.35) {
          data.bonusReturn = 100;
        } else if (returnRate >= 0.25) {
          data.bonusReturn = 50;
        }

        if (wechatRate >= 0.60) {
          data.bonusWechat = 50;
        }

        if (data.packageSales > 0) {
          data.bonusPackage = data.packageSales * 20;
          if (data.packageSales > 4) {
            data.bonusPackage += (data.packageSales - 4) * 10;
          }
        }

        data.bonusRenewal = data.renewalFulfilled * 5;

        data.totalBonus = data.bonusReturn + data.bonusWechat + data.bonusPackage + data.bonusRenewal;

        data.returnRate = Math.round(returnRate * 10000) / 100;
        data.wechatRate = Math.round(wechatRate * 10000) / 100;
        data.uniqueCustomerCount = data.uniqueCustomers.size;

        delete data._customerMap;
        delete data.uniqueCustomers;
      }

      rankedScores.forEach((item) => {
        const perf = performanceData[item.technician];
        if (perf) {
          const score = perf.returnOrders * 5 + perf.wechatAdds * 2 + perf.renewalFulfilled * 2;
          item.totalScore += score;
        }
      });

      rankedScores.sort((a, b) => b.totalScore - a.totalScore);
      rankedScores.forEach((item, index) => {
        item.rank = index + 1;
      });

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
          },
          performanceMetrics: {
            startDate: PERFORMANCE_START_DATE,
            technicians: performanceData
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
