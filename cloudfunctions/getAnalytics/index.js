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

exports.main = async (event, context) => {
  const { startDate, endDate } = event;
  
  try {
    const result = await getAnalyticsData(startDate, endDate);
    return {
      code: 0,
      data: result
    };
  } catch (error) {
    console.error('获取报表数据失败:', error);
    return {
      code: -1,
      error: error.message
    };
  }
};

async function getAnalyticsData(startDate, endDate) {
  const daysBetween = getDaysBetween(startDate, endDate);
  
  const consultationResult = await db.collection('consultation_records')
    .where({
      date: _.in(daysBetween),
      isVoided: false
    })
    .get();
  
  const consultations = consultationResult.data;
  
  const membershipResult = await db.collection('customer_membership')
    .where({
      createdAt: _.gte(new Date(startDate + ' 00:00:00')).and(_.lte(new Date(endDate + ' 23:59:59')))
    })
    .get();
  
  const memberships = membershipResult.data;
  
  const dailyRevenueTrend = {};
  const projectConsumption = {};
  const platformConsumption = {};
  let genderCount = { male: 0, female: 0 };
  let vehicleCount = { withVehicle: 0, withoutVehicle: 0 };
  let totalRevenue = 0;
  let totalOrders = consultations.length;
  let membershipCardAmount = 0;
  
  daysBetween.forEach(day => {
    dailyRevenueTrend[day] = 0;
  });
  
  consultations.forEach(consultation => {
    const settlement = consultation.settlement;
    if (settlement && settlement.payments) {
      const paidAmount = settlement.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      totalRevenue += paidAmount;
      
      if (dailyRevenueTrend[consultation.date] !== undefined) {
        dailyRevenueTrend[consultation.date] += paidAmount;
      }
    }
    
    const project = consultation.project || '未知项目';
    if (!projectConsumption[project]) {
      projectConsumption[project] = { amount: 0, count: 0 };
    }
    projectConsumption[project].count += 1;
    if (settlement && settlement.payments) {
      const paidAmount = settlement.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      projectConsumption[project].amount += paidAmount;
    }
    
    const platform = consultation.couponPlatform || '无平台';
    if (!platformConsumption[platform]) {
      platformConsumption[platform] = { amount: 0, count: 0 };
    }
    platformConsumption[platform].count += 1;
    if (settlement && settlement.payments) {
      const paidAmount = settlement.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      platformConsumption[platform].amount += paidAmount;
    }
    
    if (consultation.gender === 'male') {
      genderCount.male += 1;
    } else if (consultation.gender === 'female') {
      genderCount.female += 1;
    }
    
    if (consultation.licensePlate && consultation.licensePlate.length > 0) {
      vehicleCount.withVehicle += 1;
    } else {
      vehicleCount.withoutVehicle += 1;
    }
  });
  
  memberships.forEach(membership => {
    membershipCardAmount += membership.paidAmount || 0;
  });
  
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  
  const dailyRevenueArray = Object.entries(dailyRevenueTrend)
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  const projectArray = Object.entries(projectConsumption)
    .map(([project, data]) => ({ project, ...data }))
    .sort((a, b) => b.amount - a.amount);
  
  const platformArray = Object.entries(platformConsumption)
    .map(([platform, data]) => {
      const platformNameMap = {
        'meituan': '美团',
        'dianping': '点评',
        'douyin': '抖音',
        'membership': '会员卡',
        '': '无平台'
      };
      return { 
        platform: platformNameMap[platform] || platform, 
        ...data 
      };
    })
    .sort((a, b) => b.amount - a.amount);
  
  return {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    dailyRevenueTrend: dailyRevenueArray,
    projectConsumption: projectArray,
    platformConsumption: platformArray,
    genderDistribution: genderCount,
    vehicleDistribution: vehicleCount,
    membershipCardAmount
  };
}
