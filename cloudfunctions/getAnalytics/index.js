const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHour(date) {
  const hour = String(date.getHours()).padStart(2, '0');
  return `${hour}:00`;
}

function getWeekday(dateStr) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const date = parseDate(dateStr);
  return weekdays[date.getDay()];
}

function formatDayLabel(dateStr) {
  const date = parseDate(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = getWeekday(dateStr);
  return `${month}-${day} ${weekday}`;
}

function getDaysBetween(startDateStr, endDateStr) {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);
  const days = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    days.push(formatDate(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return days;
}

function getHoursBetween(dateStr) {
  const hours = [];
  for (let i = 0; i < 24; i++) {
    hours.push(`${String(i).padStart(2, '0')}:00`);
  }
  return hours;
}

exports.main = async (event, context) => {
  const { action, startDate, endDate, timeRangeType, currentDate } = event;
  
  try {
    const result = await getAnalyticsData(startDate, endDate, timeRangeType, currentDate);
    return {
      code: 0,
      data: result
    };
  } catch (error) {
    return {
      code: -1,
      error: error.message
    };
  }
};

async function getAnalyticsData(startDate, endDate, timeRangeType, currentDate) {
  const daysBetween = getDaysBetween(startDate, endDate);
  
  const consultationResult = await db.collection('consultation_records')
    .where({
      date: _.gte(startDate).and(_.lte(endDate)),
      isVoided: false
    })
    .limit(1000)
    .get();
  
  const consultations = consultationResult.data;
  
  const reservationResult = await db.collection('reservations')
    .where({
      date: _.gte(startDate).and(_.lte(endDate)),
      status: _.neq('cancelled')
    })
    .get();
  
  const reservations = reservationResult.data;
  
  const scheduleResult = await db.collection('schedule')
    .where({
      date: _.gte(startDate).and(_.lte(endDate))
    })
    .limit(1000)
    .get();
  
  const schedules = scheduleResult.data;
  
  const staffResult = await db.collection('staff')
    .where({
      status: 'active'
    })
    .get();
  
  const staffList = staffResult.data;
  
  const staffMap = {};
  const staffNameMap = {};
  staffList.forEach(staff => {
    staffMap[staff._id] = staff;
    staffNameMap[staff.name] = staff;
  });
  
  let customerTrend, genderTrend, projectRanking, technicianAvgTrend, keyMetrics;
  
  if (timeRangeType === 'day') {
    const hourlyData = {};
    
    for (let i = 11; i <= 23; i++) {
      const hourKey = `${String(i).padStart(2, '0')}:00`;
      hourlyData[hourKey] = { male: 0, female: 0, total: 0 };
    }
    
    consultations.forEach(consultation => {
      if (consultation.date !== currentDate) return;
      
      if (consultation.createdAt) {
        const createdDate = new Date(consultation.createdAt);
        const hourKey = formatHour(createdDate);
        
        if (hourlyData[hourKey]) {
          if (consultation.gender === 'male') {
            hourlyData[hourKey].male += 1;
          } else if (consultation.gender === 'female') {
            hourlyData[hourKey].female += 1;
          }
          hourlyData[hourKey].total += 1;
        }
      }
    });
    
    const hours = Object.keys(hourlyData).sort();
    customerTrend = {
      labels: hours,
      male: hours.map(h => hourlyData[h].male),
      female: hours.map(h => hourlyData[h].female),
      total: hours.map(h => hourlyData[h].total)
    };
    
    genderTrend = {
      labels: hours,
      male: hours.map(h => hourlyData[h].male),
      female: hours.map(h => hourlyData[h].female)
    };
  } else {
    const dailyData = {};
    
    daysBetween.forEach(day => {
      dailyData[day] = { male: 0, female: 0, total: 0 };
    });
    
    consultations.forEach(consultation => {
      const dateKey = consultation.date;
      
      if (dailyData[dateKey]) {
        if (consultation.gender === 'male') {
          dailyData[dateKey].male += 1;
        } else if (consultation.gender === 'female') {
          dailyData[dateKey].female += 1;
        }
        dailyData[dateKey].total += 1;
      }
    });
    
    const dates = Object.keys(dailyData).sort();
    customerTrend = {
      labels: dates.map(d => formatDayLabel(d)),
      male: dates.map(d => dailyData[d].male),
      female: dates.map(d => dailyData[d].female),
      total: dates.map(d => dailyData[d].total)
    };
    
    genderTrend = {
      labels: dates.map(d => formatDayLabel(d)),
      male: dates.map(d => dailyData[d].male),
      female: dates.map(d => dailyData[d].female)
    };
  }
  
  const projectCount = {};
  
  consultations.forEach(consultation => {
    const project = consultation.project || '未知项目';
    if (!projectCount[project]) {
      projectCount[project] = 0;
    }
    projectCount[project] += 1;
  });
  
  const totalOrders = consultations.length;
  projectRanking = Object.entries(projectCount)
    .map(([project, count]) => ({
      project, 
      count,
      percentage: totalOrders > 0 ? Math.round((count / totalOrders) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count);
  
  if (timeRangeType !== 'day') {
    const dailyTechnicianData = {};
    
    daysBetween.forEach(day => {
      dailyTechnicianData[day] = {
        maleStaff: new Set(),
        femaleStaff: new Set(),
        maleOrders: 0,
        femaleOrders: 0
      };
    });
    
    schedules.forEach(schedule => {
      const day = schedule.date;
      if (dailyTechnicianData[day]) {
        const staff = staffMap[schedule.staffId];
        if (staff) {
          if (staff.gender === 'male') {
            dailyTechnicianData[day].maleStaff.add(staff._id);
          } else if (staff.gender === 'female') {
            dailyTechnicianData[day].femaleStaff.add(staff._id);
          }
        }
      }
    });
    
    consultations.forEach(consultation => {
      const day = consultation.date;
      if (dailyTechnicianData[day]) {
        const staff = staffNameMap[consultation.technician];
        if (staff) {
          if (staff.gender === 'male') {
            dailyTechnicianData[day].maleOrders += 1;
          } else if (staff.gender === 'female') {
            dailyTechnicianData[day].femaleOrders += 1;
          }
        }
      }
    });
    
    const sortedDates = Object.keys(dailyTechnicianData).sort();
    technicianAvgTrend = {
      labels: sortedDates.map(d => formatDayLabel(d)),
      male: sortedDates.map(d => {
        const staffCount = dailyTechnicianData[d].maleStaff.size;
        const orderCount = dailyTechnicianData[d].maleOrders;
        return staffCount > 0 ? Math.round((orderCount / staffCount) * 10) / 10 : 0;
      }),
      female: sortedDates.map(d => {
        const staffCount = dailyTechnicianData[d].femaleStaff.size;
        const orderCount = dailyTechnicianData[d].femaleOrders;
        return staffCount > 0 ? Math.round((orderCount / staffCount) * 10) / 10 : 0;
      })
    };
  }
  
  const totalReservations = reservations.length;
  const walkInCustomers = totalOrders - totalReservations;
  
  const dailyStaffStats = {};
  
  daysBetween.forEach(day => {
    dailyStaffStats[day] = {
      maleStaffCount: 0,
      femaleStaffCount: 0
    };
  });
  
  schedules.forEach(schedule => {
    const day = schedule.date;
    if (dailyStaffStats[day]) {
      const staff = staffMap[schedule.staffId];
      if (staff) {
        if (staff.gender === 'male') {
          dailyStaffStats[day].maleStaffCount += 1;
        } else if (staff.gender === 'female') {
          dailyStaffStats[day].femaleStaffCount += 1;
        }
      }
    }
  });
  
  const dailyOrderStats = {};
  
  daysBetween.forEach(day => {
    dailyOrderStats[day] = {
      maleOrders: 0,
      femaleOrders: 0
    };
  });
  
  consultations.forEach(consultation => {
    const day = consultation.date;
    if (dailyOrderStats[day]) {
      const staff = staffNameMap[consultation.technician];
      if (staff) {
        if (staff.gender === 'male') {
          dailyOrderStats[day].maleOrders += 1;
        } else if (staff.gender === 'female') {
          dailyOrderStats[day].femaleOrders += 1;
        }
      }
    }
  });
  
  let totalMaleStaffDays = 0;
  let totalFemaleStaffDays = 0;
  let totalMaleOrders = 0;
  let totalFemaleOrders = 0;
  
  daysBetween.forEach(day => {
    totalMaleStaffDays += dailyStaffStats[day].maleStaffCount;
    totalFemaleStaffDays += dailyStaffStats[day].femaleStaffCount;
    totalMaleOrders += dailyOrderStats[day].maleOrders;
    totalFemaleOrders += dailyOrderStats[day].femaleOrders;
  });
  
  const maleAvgOrders = totalMaleStaffDays > 0 
    ? Math.round((totalMaleOrders / totalMaleStaffDays) * 10) / 10 
    : 0;
  
  const femaleAvgOrders = totalFemaleStaffDays > 0 
    ? Math.round((totalFemaleOrders / totalFemaleStaffDays) * 10) / 10 
    : 0;
  
  keyMetrics = {
    totalOrders,
    totalReservations,
    maleAvgOrders,
    femaleAvgOrders,
    walkInCustomers
  };
  
  return {
    keyMetrics,
    customerTrend,
    genderTrend,
    projectRanking,
    technicianAvgTrend
  };
}
