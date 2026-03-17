import {cloudDb, Collections} from '../../utils/cloud-db';
import {loadingService, LockKeys} from '../../utils/loading-service';
import {formatDate} from '../../utils/util';

const app = getApp<IAppOption>();

const EXPENSE_CATEGORIES: {key: ExpenseCategory; name: string;}[] = [
	{key: 'utilities', name: '水电费'},
	{key: 'supplies', name: '物料采购'},
	{key: 'rent', name: '房租'},
	{key: 'salary', name: '工资'},
	{key: 'maintenance', name: '维修费'},
	{key: 'other', name: '其他'}
];

const OVERTIME_RATE = 7.5;

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
		totalSalary: 0
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
		const {selectedYear, selectedMonth} = this.data.monthSelector;
		const monthStr = `${ selectedYear }-${ String(selectedMonth).padStart(2, '0') }`;

		const expenses = await cloudDb.find<StoreExpense>(Collections.STORE_EXPENSE, (item) => {
			return (typeof item.date === 'string') && item.date.startsWith(monthStr);
		});

		expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0);

		this.setData({
			expenseList: expenses,
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
			content: `确定要删除"${ expense.content }"吗？`,
			confirmColor: '#ff4d4f',
			success: async (res) => {
				if (res.confirm) {
					await loadingService.withLoading(this, async () => {
						await cloudDb.deleteById(Collections.STORE_EXPENSE, expense._id);
						await this.loadExpenseListByMonth();
						wx.showToast({title: '已删除', icon: 'success'});
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
		const {expenseForm, editingExpense} = this.data;

		if (!expenseForm.content.trim()) {
			wx.showToast({title: '请输入内容', icon: 'none'});
			return;
		}

		const amount = parseFloat(expenseForm.amount);
		if (isNaN(amount) || amount <= 0) {
			wx.showToast({title: '请输入有效金额', icon: 'none'});
			return;
		}

		if (!expenseForm.date) {
			wx.showToast({title: '请选择日期', icon: 'none'});
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
				wx.showToast({title: '修改成功', icon: 'success'});
			} else {
				await cloudDb.insert<StoreExpense>(Collections.STORE_EXPENSE, data);
				wx.showToast({title: '添加成功', icon: 'success'});
			}

			this.setData({showExpenseModal: false, editingExpense: null});
			await this.loadExpenseListByMonth();
		}, {
			loadingText: '保存中...',
			lockKey: LockKeys.SAVE_CONSULTATION,
			errorText: '保存失败'
		});
	},

	async calculateSalaries() {
		const {selectedYear, selectedMonth} = this.data.monthSelector;
		const monthStr = `${ selectedYear }-${ String(selectedMonth).padStart(2, '0') }`;

		const staffList = await app.getActiveStaffs();
		const allProjects = await app.getProjects();

		const projectCommissionMap: Record<string, number> = {};
		allProjects.forEach(p => {
			projectCommissionMap[p.name] = p.commission || 0;
		});

		const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
		const monthEnd = new Date(selectedYear, selectedMonth, 0);
		const monthStartStr = formatDate(monthStart);
		const monthEndStr = formatDate(monthEnd);

		const [consultations, schedules, memberships] = await Promise.all([
			cloudDb.find<ConsultationRecord>(Collections.CONSULTATION, (item) => {
				return item.date >= monthStartStr && item.date <= monthEndStr && !item.isVoided;
			}),
			cloudDb.find<ScheduleRecord>(Collections.SCHEDULE, (item) => {
				return item.date >= monthStartStr && item.date <= monthEndStr;
			}),
			cloudDb.find<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP, (item) => {
				return (typeof item.createdAt === 'string') && item.createdAt.startsWith(monthStr);
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
				consultationByStaff[staffId].push(c);
			}
		});

		const salesByStaff: Record<string, number> = {};
		memberships.forEach(m => {
			if (m.salesStaff) {
				m.salesStaff.forEach(ss => {
					const staffId = staffNameToId[ss];
					if (staffId) {
						if (!salesByStaff[staffId]) {
							salesByStaff[staffId] = 0;
						}
						salesByStaff[staffId] += m.paidAmount || 0;
					}
				});
			}
		});

		const salaryList: TechnicianSalary[] = [];
		const daysInMonth = monthEnd.getDate();

		staffList.forEach(staff => {
			const staffSchedules = scheduleByStaff[staff._id] || [];
			const staffConsultations = consultationByStaff[staff._id] || [];

			let workDays = 0;
			let offDays = 0;
			let leaveDays = 0;

			for (let day = 1; day <= daysInMonth; day++) {
				const dateStr = `${ selectedYear }-${ String(selectedMonth).padStart(2, '0') }-${ String(day).padStart(2, '0') }`;
				const schedule = staffSchedules.find(s => s.date === dateStr);

				if (schedule) {
					switch (schedule.shift) {
						case 'morning':
						case 'evening':
						case 'overtime':
							workDays++;
							break;
						case 'off':
							offDays++;
							break;
						case 'leave':
							leaveDays++;
							break;
					}
				} else {
					workDays++;
				}
			}

			let commission = 0;
			let overtime = 0;
			let guashaCount = 0;

			staffConsultations.forEach(c => {
				commission += projectCommissionMap[c.project] || 0;

				if (c.overtime && c.overtime > 0) {
					overtime += c.overtime;
				}

				if (c.guasha) {
					guashaCount++;
				}
			});

			const guashaCommission = guashaCount * 10;
			const attendanceBonus = (offDays + leaveDays) <= 4 ? 200 : 0;

			const mealAllowance = Math.round(600 / 26 * workDays);

			const salesCommission = Math.round((salesByStaff[staff._id] || 0) * 0.04);

			const totalSalary = commission + guashaCommission + overtime * OVERTIME_RATE + attendanceBonus + mealAllowance + salesCommission;

			salaryList.push({
				technicianId: staff._id,
				technicianName: staff.name,
				year: selectedYear,
				month: selectedMonth,
				commission,
				guashaCommission,
				overtime: overtime * OVERTIME_RATE,
				attendanceBonus,
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

		this.setData({
			salaryList,
			totalSalary
		});
	},

	getCategoryName(category: ExpenseCategory): string {
		const found = EXPENSE_CATEGORIES.find(c => c.key === category);
		return found ? found.name : '其他';
	}
});
