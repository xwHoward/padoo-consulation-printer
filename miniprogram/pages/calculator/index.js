const WxCharts = require("../../utils/wx-charts.js");

let cashflowChart = null;
let costPieChart = null;
/** 商户通年费 */
const merchantFee = 2800,
  /** 加盟费 */
  joinFee = 39800,
  MIN_BRAND_FEE = 4980,
  /** 会员折扣 */
  CARD_DISCOUNT = 0.75, // 首月0.75，常规0.875
  /** 员工餐补+全勤 */
  STAFF_BONUS = 600; 

function parseWan(num) {
  return (num / 10000).toFixed(2);
}

function getActualMonthlyRent(month) {
  const baseRent = 186.76 * 49.5;
  if (month % 3 !== 0) return 0;
  if (month < 12) {
    return parseInt(baseRent) - baseRent * (4 / 36);
  }
  if (month < 24) {
    return parseInt(baseRent * 1.03) - baseRent * (4 / 36);
  }
  if (month < 36) {
    return parseInt(baseRent * 1.03 * 1.03) - baseRent * (4 / 36);
  }
  if (month < 48) {
    return parseInt(baseRent * 1.03 * 1.03 * 1.03);
  }
  return parseInt(baseRent * 1.03 * 1.03 * 1.03 * 1.03);
}

Page({
  data: {
    // 基础参数
    S: 186.76,
    s: 107.1,
    m: 49.5,
    /** 装修标准/平 */
    decorationStd: 1740,
    /** 首批物料 */
    openingMaterial: 25000,

    // 人力成本
    staffCount: 6,
    salaryPerStaff: 6500,
    materialCostPerOrder: 2,
    utilityCostPerStaff: 300,

    // 营销参数
    marketingFee: 3000,
    platformCommission: 6,
    ordersPerStaff: 100,

    // 销售比例
    onlineSalesRatio: 70,
    cardUsageRatio: 95,

    // 现金流起始时间
    startYear: 2025,
    startMonth: 11,
    // 计算周期(月)
    months: 18,

    // 计算结果
    totalOrders: 0,
    monthlyRevenue: 0,
    initialInvestment: 0,
    monthlyCost: 0,
    monthlyProfit: 0,
    grossMargin: 0,
    netMargin: 0,
    paybackPeriod: 0,

    // 现金流数据
    cashflowData: [],

    // 图表宽度（用于横向滚动）
    chartWidth: 0,

    // SKU配置
    skus: [
      {
        name: "全身深度舒压精油SPA",
        price: 208,
        ratio: 48,
        commission: 80,
      },
      {
        name: "巴厘岛云朵舒压精油SPA",
        price: 158,
        ratio: 30,
        commission: 60,
      },
      {
        name: "指压·推拿（肩+背+腰+头）",
        price: 138,
        ratio: 6,
        commission: 50,
      },
      {
        name: "推拿40min+精油SPA40min",
        price: 188,
        ratio: 4,
        commission: 70,
      },
      {
        name: "英国深海热贝睡眠精油SPA（90min）",
        price: 268,
        ratio: 4,
        commission: 90,
      },
      {
        name: "芭提雅臀部肌肉松解spa（45min）",
        price: 258,
        ratio: 3,
        commission: 129,
      },
      {
        name: "英国深海热贝睡眠精油SPA（120min）",
        price: 368,
        ratio: 2,
        commission: 120,
      },
      {
        name: "加钟",
        price: 68,
        ratio: 1,
        commission: 30,
      },
      {
        name: "印度七脉轮彩石能量疗愈SPA（90min）",
        price: 268,
        ratio: 1,
        commission: 90,
      },
      {
        name: "印度七脉轮彩石能量疗愈SPA（120min）",
        price: 328,
        ratio: 1,
        commission: 120,
      },
    ],
    rents: [],
  },

  onLoad() {
    try {
      const cached = wx.getStorageSync("calculatorForm");
      if (cached && typeof cached === "object") {
        this.setData({
          ...cached,
        });
      }
    } catch (e) {}
    this.calculateResults();
    this.initChart();
  },

  onReady() {
    // 确保canvas已经渲染
    setTimeout(() => {
      this.initChart();
      this.initCostPieChart();
    }, 500);
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const num = Number(value);
    if (field === "months") {
      const v = Math.max(1, parseInt(num) || 1);
      this.setData({
        [field]: v,
      });
    } else {
      this.setData({
        [field]: num || 0,
      });
    }
    this.persistData();
    this.calculateResults();
  },
  onStep(e) {
    const field = e.currentTarget.dataset.field;
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const current = Number(this.data[field]) || 0;
    const minVal = field === "months" ? 1 : 0;
    const next = Math.max(
      minVal,
      (field === "months" ? parseInt(current) : current) + delta,
    );
    this.setData({
      [field]: next,
    });
    this.persistData();
    this.calculateResults();
  },

  persistData() {
    const {
      S,
      s,
      m,
      decorationStd,
      openingMaterial,
      salaryPerStaff,
      materialCostPerStaff,
      utilityCostPerStaff,
      marketingFee,
      platformCommission,
      ordersPerStaff,
      staffCount,
      onlineSalesRatio,
      cardUsageRatio,
      startYear,
      startMonth,
      months,
      materialCostPerOrder,
    } = this.data;
    try {
      wx.setStorage({
        key: "calculatorForm",
        data: {
          S,
          s,
          m,
          decorationStd,
          openingMaterial,
          salaryPerStaff,
          materialCostPerStaff,
          utilityCostPerStaff,
          marketingFee,
          platformCommission,
          ordersPerStaff,
          staffCount,
          onlineSalesRatio,
          cardUsageRatio,
          startYear,
          startMonth,
          months,
          materialCostPerOrder,
        },
      });
    } catch (e) {
      try {
        wx.setStorageSync("calculatorForm", {
          S,
          s,
          m,
          decorationStd,
          openingMaterial,
          salaryPerStaff,
          materialCostPerStaff,
          utilityCostPerStaff,
          marketingFee,
          platformCommission,
          ordersPerStaff,
          staffCount,
          onlineSalesRatio,
          cardUsageRatio,
          startYear,
          startMonth,
          months,
          materialCostPerOrder,
        });
      } catch (err) {}
    }
  },

  // 计算加盟模式的结果
  calculateJoinMode(params) {
    const {
      S,
      s,
      m,
      decorationStd,
      openingMaterial,
      materialCostPerOrder,
      utilityCostPerStaff,
      marketingFee,
      platformCommission,
      ordersPerStaff,
      staffCount,
      onlineSalesRatio,
      cardUsageRatio,
      skus,
    } = params;

    const totalOrders = staffCount * ordersPerStaff;

    // 计算平均标价
    let weightedPrice = 0;
    skus.forEach((sku) => {
      weightedPrice += sku.price * (sku.ratio / 100);
    });

    // 计算平均每单收入
    const onlineRate = onlineSalesRatio / 100;
    const offlineRate = 1 - onlineRate;
    const cardRate = cardUsageRatio / 100;

    const onlinePrice = weightedPrice * (1 - platformCommission / 100);
    const offlinePrice =
      weightedPrice * (cardRate * CARD_DISCOUNT + (1 - cardRate));
    const avgPricePerOrder =
      onlinePrice * onlineRate + offlinePrice * offlineRate;

    // 计算月收入
    const monthlyRevenue = totalOrders * avgPricePerOrder;

    // 计算初始投资
    /** 交易费 */
    const monthlyRent = S * m;
    const decorationCost = decorationStd * s;

    // 计算月成本
    const propertyFee = 8 * S;

    // 计算加权平均技师提成
    let weightedCommission = 0;
    skus.forEach((sku) => {
      weightedCommission += sku.commission * (sku.ratio / 100);
    });

    // 计算技师单量提成（基础提成 + 点钟额外提成 + 好评额外提成）
    const baseSalary = ordersPerStaff * weightedCommission;
    const clockOrderBonus = ordersPerStaff * 0.3 * 5; // 30%点钟订单，额外5元
    const praiseOrderBonus = ordersPerStaff * 0.6 * 8; // 60%好评订单，额外8元
    const salaryPerStaff = Math.round(
      baseSalary + clockOrderBonus + praiseOrderBonus + STAFF_BONUS,
    );
    const staffSalary = staffCount * salaryPerStaff;
    const materialCost = totalOrders * materialCostPerOrder;
    const utilityCost = staffCount * utilityCostPerStaff;
    const merchantMonthlyFee = merchantFee / 12;
    const actualMonthlyRent = monthlyRent * (1 - 4 / 36);
    const prepaidRent = (actualMonthlyRent + propertyFee) * 3;
    const brandFee = Math.min(3500 + monthlyRevenue * 0.02, MIN_BRAND_FEE);

    const initialInvestment =
      decorationCost +
      openingMaterial +
      merchantFee +
      monthlyRent * 2 /** 押二 */ +
      prepaidRent +
      joinFee +
      monthlyRent; /** 平台交易费 */

    const monthlyCost =
      actualMonthlyRent +
      propertyFee +
      staffSalary +
      materialCost +
      utilityCost +
      marketingFee +
      merchantMonthlyFee +
      brandFee +
      2700 + // 员工宿舍房租
      1000 + // 清洁工工资
      400; // 代理记账+收银系统

    // 计算利润
    const monthlyDepreciation = (decorationCost + joinFee) / 5 / 12;
    const monthlyProfit = monthlyRevenue - monthlyCost - monthlyDepreciation;

    // 计算现金流（季度预付租金）
    const cashflow = this.generateCashflow(
      initialInvestment,
      monthlyRevenue,
      monthlyCost,
      actualMonthlyRent,
    );

    return {
      salaryPerStaff,
      actualMonthlyRent,
      staffCount,
      totalOrders,
      monthlyRevenue,
      initialInvestment,
      monthlyCost,
      monthlyProfit,
      cashflow,
    };
  },

  // 生成现金流数据（按季度预付3个月实际租金）
  generateCashflow(
    initialInvestment,
    monthlyRevenue,
    monthlyCost,
    actualMonthlyRent,
  ) {
    const cashflow = [];
    let cumulative = -initialInvestment;

    // 基础月度现金流：将月租从月成本中拿掉，避免重复
    const monthlyCashFlowBase =
      monthlyRevenue - (monthlyCost - actualMonthlyRent);

    // 计算日运营成本和日收入（用于部分月份计算）
    const dailyRevenue = monthlyRevenue / 30;
    const dailyCost = (monthlyCost - actualMonthlyRent) / 30;

    const monthsCount = Number(this.data.months) || 12;
    for (let i = 0; i <= monthsCount; i++) {
      cashflow.push(cumulative);
      if (i > 0) {
        const rentLump = getActualMonthlyRent(i) * 3;
        let monthlyCashFlow;

        // 第一个月（11月）：只有租金，没有运营收入和成本
        if (i === 1) {
          monthlyCashFlow = -rentLump;
        }
        // 第二个月（12月）：从23日开始经营，约1/3个月的收入和成本
        else if (i === 2) {
          const partialRevenue = dailyRevenue * 8; // 12月23日至31日共8天
          const partialCost = dailyCost * 8;
          monthlyCashFlow = partialRevenue - partialCost - rentLump;
        }
        // 后续月份：完整的月度现金流
        else {
          monthlyCashFlow = monthlyCashFlowBase - rentLump;
        }

        cumulative += monthlyCashFlow;
      }
    }
    return cashflow;
  },

  calculateResults() {
    const params = {
      ...this.data,
    };

    const joinResult = this.calculateJoinMode(params);

    // 计算毛利率和净利率
    // 毛利率 = (月收入 - 直接成本) / 月收入 * 100
    // 直接成本包括：耗材成本、水电成本、月租、运营费用
    const directCostJoin =
      params.materialCostPerOrder * joinResult.totalOrders +
      joinResult.staffCount * params.utilityCostPerStaff +
      joinResult.actualMonthlyRent +
      params.marketingFee +
      2700 + // 员工宿舍房租
      1000 + // 清洁工工资
      400; // 代理记账+收银系统
    const grossProfitJoin = joinResult.monthlyRevenue - directCostJoin;
    const grossMarginJoin = (
      (grossProfitJoin / joinResult.monthlyRevenue) *
      100
    ).toFixed(1);
    const netMarginJoin = (
      (joinResult.monthlyProfit / joinResult.monthlyRevenue) *
      100
    ).toFixed(1);

    // 基于现金流数据计算更准确的回本周期
    let paybackPeriodJoin = 0;
    const cashflow = joinResult.cashflow;
    const monthsCount = Number(this.data.months) || 12;
    for (let i = 1; i < cashflow.length; i++) {
      if (cashflow[i] >= 0 && cashflow[i - 1] < 0) {
        // 找到现金流从负转正的月份
        const deficit = Math.abs(cashflow[i - 1]);
        const monthlyProfit = cashflow[i] - cashflow[i - 1];
        // 计算具体的回本天数
        const days = Math.ceil(deficit / (monthlyProfit / 30));
        paybackPeriodJoin = (i - 1 + days / 30).toFixed(1);
        break;
      }
    }
    // 如果现金流始终为负，设置一个较大的值
    if (paybackPeriodJoin === 0) {
      paybackPeriodJoin = ">" + monthsCount;
    }

    this.setData(
      {
        staffCount: joinResult.staffCount,
        totalOrders: joinResult.totalOrders,
        monthlyRevenue: parseInt(joinResult.monthlyRevenue),
        initialInvestment: parseInt(joinResult.initialInvestment),
        monthlyCost: parseInt(joinResult.monthlyCost),
        monthlyProfit: parseInt(joinResult.monthlyProfit),
        grossMargin: grossMarginJoin,
        netMargin: netMarginJoin,
        paybackPeriod: paybackPeriodJoin,
        cashflowData: joinResult.cashflow,
        actualMonthlyRent: joinResult.actualMonthlyRent,
        salaryPerStaff: joinResult.salaryPerStaff,
      },
      () => {
        this.setData({
          rents: this.getMonthlyRent(),
        });
      },
    );

    this.updateChart();
    this.updateCostPieChart();
  },

  getMonthLabels(startYear, startMonth, count) {
    const labels = [];
    let y = Number(startYear);
    let m = Number(startMonth);
    const monthsCount = Number(this.data.months) || count || 12;
    for (let i = 0; i < monthsCount; i++) {
      const mm = m < 10 ? "0" + m : "" + m;
      labels.push(`${y}-${mm}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    // 首个为期初，总刻度为 months+1
    return ["期初", ...labels];
  },

  initChart() {
    const { cashflowData, startYear, startMonth } = this.data;
    const months = this.getMonthLabels(startYear, startMonth, this.data.months);

    const sys = wx.getWindowInfo();
    // 按点间距*(刻度数-1)+边距，使最后一点靠近最右侧
    const pointGap = 56;
    const edgePadding = 40;
    const computedWidth =
      pointGap * Math.max(0, months.length - 1) + edgePadding;
    const canvasWidth = Math.max(sys.windowWidth, computedWidth);
    const canvasHeight = 260;

    cashflowChart = new WxCharts({
      canvasId: "cashflowChart",
      type: "line",
      categories: months,
      animation: true,
      background: "#ffffff",
      series: [
        {
          name: "现金流",
          data: cashflowData,
          color: "#1890ff",
          format: function (val) {
            return parseWan(val);
          },
        },
        {
          name: "月租金",
          data: [0].concat(this.getMonthlyRent().map((r) => r * 3)),
          color: "#52c41a",
          format: function (val) {
            return parseWan(val);
          },
        },
      ],
      xAxis: {
        disableGrid: true,
        fontColor: "#666666",
      },
      yAxis: {
        title: "现金流(万元)",
        format: function (val) {
          return parseWan(val);
        },
        min: Math.min(...cashflowData) * 1.1,
        max: Math.max(...cashflowData) * 1.1,
      },
      width: canvasWidth,
      height: canvasHeight,
      dataLabel: true,
      dataPointShape: true,
      extra: {
        lineStyle: "curve",
      },
    });

    this.setData({
      chartWidth: canvasWidth,
    });
  },

  updateChart() {
    if (!cashflowChart) {
      this.initChart();
      return;
    }

    const { cashflowData, startYear, startMonth } = this.data;
    const months = this.getMonthLabels(startYear, startMonth, this.data.months);
    const sys = wx.getWindowInfo();
    const pointGap = 56;
    const edgePadding = 40;
    const computedWidth =
      pointGap * Math.max(0, months.length - 1) + edgePadding;
    const canvasWidth = Math.max(sys.windowWidth, computedWidth);
    this.setData({
      chartWidth: canvasWidth,
    });

    cashflowChart.updateData({
      categories: months,
      series: [
        {
          name: "现金流",
          data: cashflowData,
          color: "#1890ff",
          format: function (val) {
            return parseWan(val);
          },
        },
        {
          name: "月租金",
          data: [0].concat(this.getMonthlyRent().map((r) => r * 3)),
          color: "#52c41a",
          format: function (val) {
            return parseWan(val);
          },
        },
      ],
    });
  },

  getMonthlyRent() {
    const res = [];
    for (let i = 0; i < this.data.months; i++) {
      res.push(getActualMonthlyRent(i));
    }
    return res;
  },

  // 初始化成本饼图
  initCostPieChart() {
    const sys = wx.getWindowInfo();
    const canvasWidth = sys.windowWidth * 0.9;
    const canvasHeight = 300;

    const costData = this.generateCostData();

    costPieChart = new WxCharts({
      canvasId: "costPieChart",
      type: "pie",
      animation: true,
      width: canvasWidth - 20,
      height: canvasHeight - 20,
      series: costData,
      dataLabel: true,
      legend: true,
      extra: {
        pie: {
          offsetAngle: 0,
          radius: 100,
        },
      },
    });
  },

  // 更新成本饼图
  updateCostPieChart() {
    if (!costPieChart) {
      this.initCostPieChart();
      return;
    }

    const costData = this.generateCostData();
    costPieChart.updateData({
      series: costData,
    });
  },

  // 生成成本数据
  generateCostData() {
    const {
      actualMonthlyRent,
      staffCount,
      totalOrders,
      salaryPerStaff,
      marketingFee,
    } = this.data;
    const propertyFee = 8 * this.data.S;
    const staffSalary = staffCount * salaryPerStaff;
    const materialCost = totalOrders * this.data.materialCostPerOrder;
    const utilityCost = staffCount * this.data.utilityCostPerStaff;
    const merchantMonthlyFee = merchantFee / 12;

    let brandFee = 0;
    brandFee = Math.min(3500 + this.data.monthlyRevenue * 0.02, MIN_BRAND_FEE);

    const costData = [
      {
        name: "员工薪资",
        data: staffSalary,
        color: "#1890ff",
        format: function () {
          return staffSalary + "薪";
        },
      },
      {
        name: "租金",
        data: actualMonthlyRent + propertyFee,
        color: "#52c41a",
        format: function () {
          return (actualMonthlyRent + propertyFee).toFixed(0) + "租";
        },
      },
      {
        name: "材料成本",
        data: materialCost,
        color: "#f5222d",
        format: function () {
          return materialCost + "材";
        },
      },
      {
        name: "水电费",
        data: utilityCost,
        color: "#722ed1",
        format: function () {
          return utilityCost + "电";
        },
      },
      {
        name: "宿舍清洁记账",
        data: 4000,
        color: "#fa8c16",
        format: function () {
          return 4000 + "固";
        },
      },
      {
        name: "营销费用",
        data: marketingFee + merchantMonthlyFee,
        color: "#eb2f96",
        format: function () {
          return parseInt(marketingFee + merchantMonthlyFee) + "营";
        },
      },
    ];

    if (brandFee > 0) {
      costData.push({
        name: "品牌管理费",
        data: brandFee,
        color: "#fa8c16",
        format: function () {
          return brandFee.toFixed(0) + "抽";
        },
      });
    }

    // 过滤掉0或负值的数据项
    return costData.filter((item) => item.data > 0);
  },
});
