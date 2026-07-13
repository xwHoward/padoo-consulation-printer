import { cloudDb, Collections } from '../../utils/cloud-db';
import { loadingService, LockKeys } from '../../utils/loading-service';
import { formatDate } from '../../utils/util';
import {
	buildProjectCommissionMap,
	computeConsultationCommission,
	deduplicateOvertimeByDate,
	OVERTIME_RATE,
	GUASHA_BONUS,
	formatMonth,
} from '../../utils/salary';

const app = getApp<IAppOption>();

const EXPENSE_CATEGORIES: { key: ExpenseCategory; name: string; }[] = [
    { key: 'utilities', name: '水电费' },
    { key: 'supplies', name: '物料采购' },
    { key: 'rent', name: '房租' },
    { key: 'salary', name: '工资' },
    { key: 'maintenance', name: '维修费' },
    { key: 'other', name: '其他' }
];



interface ExpenseGroup {
    category: ExpenseCategory;
    categoryName: string;
    totalAmount: number;
    count: number;
    expanded: boolean;
    items: StoreExpense[];
}

Page({
    data: {
        loading: false,
        loadingText: '加载中...',
        monthSelector: {
            selectedYear: 0,
            selectedMonth: 0,
            years: [] as number[],
            months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        },
        expenseList: [] as StoreExpense[],
        expenseGroups: [] as ExpenseGroup[],
        showExpenseModal: false,
        editingExpense: null as StoreExpense | null,
        expenseForm: {
            category: 'other' as ExpenseCategory,
            content: '',
            amount: '',
            date: '',
            remarks: ''
        },
        expenseCategories: EXPENSE_CATEGORIES,
        salaryList: [] as TechnicianSalary[],
        totalExpense: 0,
        totalSalary: 0,
        totalPerformanceBonus: 0
    },

    onLoad() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const years = [];
        for (let y = currentYear - 2; y <= currentYear + 1; y++) {
            years.push(y);
        }

        this.setData({
            'monthSelector.selectedYear': currentYear,
            'monthSelector.selectedMonth': currentMonth,
            'monthSelector.years': years,
            'expenseForm.date': formatDate(now)
        });
    },

    onShow() {
        this.loadAllData();
    },

    onYearChange(e: WechatMiniprogram.CustomEvent) {
        const index = parseInt(e.detail.value);
        const year = this.data.monthSelector.years[index];
        this.setData({
            'monthSelector.selectedYear': year
        }, () => {
            this.loadAllData();
        });
    },

    onMonthChange(e: WechatMiniprogram.CustomEvent) {
        const month = parseInt(e.detail.value) + 1;
        this.setData({
            'monthSelector.selectedMonth': month
        }, () => {
            this.loadAllData();
        });
    },

    async loadAllData() {
        await loadingService.withLoading(this, async () => {
            await Promise.all([
                this.loadExpenseListByMonth(),
                this.calculateSalaries()
            ]);
        }, {
            loadingText: '加载中...',
            lockKey: LockKeys.LOAD_HISTORY,
            errorText: '加载失败'
        });
    },

    async loadExpenseListByMonth() {
        const { selectedYear, selectedMonth } = this.data.monthSelector;
        const monthStr = formatMonth(selectedYear, selectedMonth);

        const expenses = await cloudDb.find<StoreExpense>(Collections.STORE_EXPENSE, {
            date: cloudDb.getRegExp({ regexp: `^${monthStr}` })
        });

        expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0);

        const groupMap: Record<string, ExpenseGroup> = {};

        EXPENSE_CATEGORIES.forEach(cat => {
            groupMap[cat.key] = {
                category: cat.key,
                categoryName: cat.name,
                totalAmount: 0,
                count: 0,
                expanded: false,
                items: []
            };
        });

        expenses.forEach(expense => {
            const group = groupMap[expense.category];
            if (group) {
                group.totalAmount += expense.amount;
                group.count += 1;
                group.items.push(expense);
            }
        });

        const expenseGroups = Object.values(groupMap).filter(g => g.count > 0);

        expenseGroups.sort((a, b) => b.totalAmount - a.totalAmount);

        this.setData({
            expenseList: expenses,
            expenseGroups,
            totalExpense
        });
    },

    onAddExpense() {
        this.setData({
            showExpenseModal: true,
            editingExpense: null,
            expenseForm: {
                category: 'other',
                content: '',
                amount: '',
                date: formatDate(new Date()),
                remarks: ''
            }
        });
    },

    toggleExpenseGroup(e: WechatMiniprogram.TouchEvent) {
        const category = e.currentTarget.dataset.category as ExpenseCategory;
        const expenseGroups = this.data.expenseGroups.map(group => {
            if (group.category === category) {
                return {
                    ...group,
                    expanded: !group.expanded
                };
            }
            return group;
        });

        this.setData({ expenseGroups });
    },

    onEditExpense(e: WechatMiniprogram.TouchEvent) {
        const expense = e.currentTarget.dataset.expense as StoreExpense;
        this.setData({
            showExpenseModal: true,
            editingExpense: expense,
            expenseForm: {
                category: expense.category,
                content: expense.content,
                amount: expense.amount.toString(),
                date: expense.date,
                remarks: expense.remarks || ''
            }
        });
    },

    onDeleteExpense(e: WechatMiniprogram.TouchEvent) {
        const expense = e.currentTarget.dataset.expense as StoreExpense;

        wx.showModal({
            title: '确认删除',
            content: `确定要删除"${expense.content}"吗？`,
            confirmColor: '#ff4d4f',
            success: async (res) => {
                if (res.confirm) {
                    await loadingService.withLoading(this, async () => {
                        await cloudDb.deleteById(Collections.STORE_EXPENSE, expense._id);
                        await this.loadExpenseListByMonth();
                        wx.showToast({ title: '已删除', icon: 'success' });
                    }, {
                        loadingText: '删除中...',
                        lockKey: LockKeys.DELETE_CONSULTATION,
                        errorText: '删除失败'
                    });
                }
            }
        });
    },

    onExpenseModalCancel() {
        this.setData({
            showExpenseModal: false,
            editingExpense: null
        });
    },

    onCategorySelect(e: WechatMiniprogram.TouchEvent) {
        const category = e.currentTarget.dataset.category as ExpenseCategory;
        this.setData({
            'expenseForm.category': category
        });
    },

    onContentInput(e: WechatMiniprogram.Input) {
        this.setData({
            'expenseForm.content': e.detail.value
        });
    },

    onAmountInput(e: WechatMiniprogram.Input) {
        this.setData({
            'expenseForm.amount': e.detail.value
        });
    },

    onDateChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({
            'expenseForm.date': e.detail.value
        });
    },

    onRemarksInput(e: WechatMiniprogram.Input) {
        this.setData({
            'expenseForm.remarks': e.detail.value
        });
    },

    async onExpenseModalConfirm() {
        const { expenseForm, editingExpense } = this.data;

        if (!expenseForm.content.trim()) {
            wx.showToast({ title: '请输入内容', icon: 'none' });
            return;
        }

        const amount = parseFloat(expenseForm.amount);
        if (isNaN(amount) || amount <= 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
        }

        if (!expenseForm.date) {
            wx.showToast({ title: '请选择日期', icon: 'none' });
            return;
        }

        await loadingService.withLoading(this, async () => {
            const data: Omit<StoreExpense, '_id' | 'createdAt' | 'updatedAt'> = {
                category: expenseForm.category,
                content: expenseForm.content.trim(),
                amount,
                date: expenseForm.date,
                remarks: expenseForm.remarks.trim() || undefined
            };

            if (editingExpense) {
                await cloudDb.updateById<StoreExpense>(Collections.STORE_EXPENSE, editingExpense._id, data);
                wx.showToast({ title: '修改成功', icon: 'success' });
            } else {
                await cloudDb.insert<StoreExpense>(Collections.STORE_EXPENSE, data);
                wx.showToast({ title: '添加成功', icon: 'success' });
            }

            this.setData({ showExpenseModal: false, editingExpense: null });
            await this.loadExpenseListByMonth();
        }, {
            loadingText: '保存中...',
            lockKey: LockKeys.SAVE_CONSULTATION,
            errorText: '保存失败'
        });
    },

    async calculateSalaries() {
        const { selectedYear, selectedMonth } = this.data.monthSelector;
        const monthStr = formatMonth(selectedYear, selectedMonth);

        const staffList = await app.getActiveStaffs();
        const allProjects = await app.getProjects();
        const commissionMap = buildProjectCommissionMap(allProjects);

        const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
        const monthEnd = new Date(selectedYear, selectedMonth, 0);
        const monthStartStr = formatDate(monthStart);
        const monthEndStr = formatDate(monthEnd);

        const _ = cloudDb.getCommand();
        const [consultations, schedules, memberships] = await Promise.all([
            cloudDb.find<ConsultationRecord>(Collections.CONSULTATION, {
                date: _.gte(monthStartStr).and(_.lte(monthEndStr)),
                isVoided: false
            }),
            cloudDb.find<ScheduleRecord>(Collections.SCHEDULE, {
                date: _.gte(monthStartStr).and(_.lte(monthEndStr))
            }),
            cloudDb.find<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP, {
                createdAt: cloudDb.getRegExp({ regexp: `^${monthStr}` })
            })
        ]);


        const staffIdMap: Record<string, StaffInfo> = {};
        staffList.forEach(s => {
            staffIdMap[s._id] = s;
        });

        const staffNameToId: Record<string, string> = {};
        staffList.forEach(s => {
            staffNameToId[s.name] = s._id;
        });

        const scheduleByStaff: Record<string, ScheduleRecord[]> = {};
        schedules.forEach(s => {
            if (!scheduleByStaff[s.staffId]) {
                scheduleByStaff[s.staffId] = [];
            }
            scheduleByStaff[s.staffId].push(s);
        });

        const consultationByStaff: Record<string, ConsultationRecord[]> = {};
        consultations.forEach(c => {
            const staffId = staffNameToId[c.technician];
            if (staffId) {
                if (!consultationByStaff[staffId]) {
                    consultationByStaff[staffId] = [];
                }
                if (consultationByStaff[staffId].findIndex(item => item.date + item.startTime === c.date + c.startTime) < 0) {
                    consultationByStaff[staffId].push(c);
                }
            }
        });

        const salesByStaff: Record<string, number> = {};
        memberships.forEach(m => {
            if (m.salesStaff && m.salesStaff.length > 0) {
                const salesCount = m.salesStaff.length;
                const salesPerStaff = (m.paidAmount || 0) / salesCount;
                m.salesStaff.forEach(ss => {
                    const staffId = staffNameToId[ss];
                    if (staffId) {
                        if (!salesByStaff[staffId]) {
                            salesByStaff[staffId] = 0;
                        }
                        salesByStaff[staffId] += salesPerStaff;
                    }
                });
            }
        });

        const salaryList: TechnicianSalary[] = [];
        const daysInMonth = monthEnd.getDate();

        staffList.forEach(staff => {
            const staffSchedules = scheduleByStaff[staff._id] || [];
            const staffConsultations = consultationByStaff[staff._id] || [];

            let offDays = 0;
            let leaveDays = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const schedule = staffSchedules.find(s => s.date === dateStr);

                if (schedule) {
                    switch (schedule.shift) {
                        case 'off':
                            offDays++;
                            break;
                        case 'leave':
                            leaveDays++;
                            break;
                    }
                }
            }
            const workDays = daysInMonth - leaveDays - offDays;

            let commission = 0;
            let extraTime = 0;
            let guashaCount = 0;
            let projectCount = 0;
            let clockIn = 0;

            staffConsultations.forEach(c => {
                const result = computeConsultationCommission(c, commissionMap);
                projectCount++;

                if (c.isClockIn) clockIn += 1;
                if (c.guasha) { guashaCount++; projectCount++; }
                if (c.extraTime && c.extraTime > 0) {
                    extraTime += c.extraTime;
                    projectCount += c.extraTime;
                }

                // 排除加班和刮痧（totalSalary 中单独按去重后计算，避免重复累加）
                commission += result.total - result.overtimeHours * OVERTIME_RATE - result.guashaBonus;
            });

            const overtime = deduplicateOvertimeByDate(staffConsultations);

            let mealAllowance = 0;
            let attendanceBonus = 0;

            if (workDays > 0) {
                mealAllowance = Math.round(workDays * 600 / 26);
                attendanceBonus = 200;
            }

            const salesCommission = Math.round((salesByStaff[staff._id] || 0) * 0.04);

            const totalSalary = commission + overtime * OVERTIME_RATE + guashaCount * GUASHA_BONUS + attendanceBonus + mealAllowance + salesCommission;

            salaryList.push({
                technicianId: staff._id,
                technicianName: staff.name,
                projectCount,
                year: selectedYear,
                month: selectedMonth,
                commission,
                overtime,
                extraTime,
                attendanceBonus,
                clockIn,
                mealAllowance,
                salesCommission,
                totalSalary,
                workDays,
                offDays,
                leaveDays
            });
        });

        salaryList.sort((a, b) => b.totalSalary - a.totalSalary);

        const totalSalary = salaryList.reduce((sum, s) => sum + s.totalSalary, 0);

        const enrichedSalaryList = await this.enrichWithPerformance(salaryList);

        const totalPerformanceBonus = enrichedSalaryList.reduce((sum, s) => sum + (s.totalPerformanceBonus || 0), 0);

        this.setData({
            salaryList: enrichedSalaryList,
            totalSalary,
            totalPerformanceBonus
        });
    },

    async enrichWithPerformance(salaryList: TechnicianSalary[]): Promise<TechnicianSalary[]> {
        try {
            const { selectedYear, selectedMonth } = this.data.monthSelector;
            const targetDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-15`;

            const res = await wx.cloud.callFunction({
                name: 'getHistoryData',
                data: {
                    action: 'getDailySummary',
                    targetDate
                }
            });

            if (!res.result || typeof res.result !== 'object') {
                return salaryList;
            }

            const result = res.result as { code: number; data: { performanceMetrics?: { technicians: Record<string, any> } } };
            if (result.code !== 0 || !result.data?.performanceMetrics?.technicians) {
                return salaryList;
            }

            const perfTechs = result.data.performanceMetrics.technicians;

            return salaryList.map(salary => {
                const perf = perfTechs[ salary.technicianName ];
                if (!perf) return salary;

                return {
                    ...salary,
                    returnRate: perf.returnRate,
                    returnOrders: perf.returnOrders,
                    totalOrders: perf.totalOrders,
                    wechatAdds: perf.wechatAdds,
                    uniqueCustomers: perf.uniqueCustomers,
                    wechatRate: perf.wechatRate,
                    renewalFulfilled: perf.renewalFulfilled,
                    packageSales: perf.packageSales,
                    bonusReturn: perf.bonusReturn,
                    bonusWechat: perf.bonusWechat,
                    bonusPackage: perf.bonusPackage,
                    bonusRenewal: perf.bonusRenewal,
                    totalPerformanceBonus: perf.totalBonus
                };
            });
        } catch (error) {
            console.error('[StoreExpense] enrichWithPerformance 失败:', error);
            return salaryList;
        }
    },

    getCategoryName(category: ExpenseCategory): string {
        const found = EXPENSE_CATEGORIES.find(c => c.key === category);
        return found ? found.name : '其他';
    }
});
