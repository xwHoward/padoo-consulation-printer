// data-loader.service.ts - Cashier 数据加载服务
import { cloudDb } from '../../../utils/cloud-db';
import { loadingService, LockKeys } from '../../../utils/loading-service';
import type { QuickReservationGroup, QuickSlot, QuickSlotRaw } from '../cashier.types';
import {
	getCurrentDate,
	getNextDate,
	getPreviousDate,
	formatTime,
	earlierThan,
	laterOrEqualTo
} from '../../../utils/util';
import type { CashierPage } from '../cashier.types';

const app = getApp<IAppOption>();

export class CashierDataLoaderService {
	private page: CashierPage;

	constructor(page: CashierPage) {
		this.page = page;
	}

	async loadProjects(): Promise<void> {
		const projects = app.globalData.projects || [];
		this.page.setData({ projects });
	}

	async loadInitialData(): Promise<void> {
		await loadingService.withLoading(this.page, async () => {
			const today = this.page.data.selectedDate || getCurrentDate();
			const currentTimeStr = formatTime(new Date(), false);
			const todayStr = getCurrentDate();
			const isToday = today === todayStr;

			// 并行获取所有基础数据（含轮牌+快速预约，一次云函数调用）
			const [allRooms, todayRecords, allStaff, rotationResult] = await Promise.all([
				app.getRooms(),
				cloudDb.getConsultationsByDate<ConsultationRecord>(today),
				app.getStaffs(),
				this.prepareRotationList(today)
			]);

			// 计算房间占用状态
			const filteredRooms = allRooms.filter((r: Room) => r.status === 'normal');

			const rooms = filteredRooms.map((room) => {
				let occupiedRecords = todayRecords
					.filter(r => !r.isVoided && r.room === room.name)
					.map(r => ({
						customerName: r.surname + (r.gender === 'male' ? '先生' : '女士'),
						technician: r.technician || '',
						startTime: r.startTime,
						endTime: r.endTime || ''
					}));

				// 只显示当前时间正在占用的记录（对于今天）
				if (isToday && currentTimeStr) {
					occupiedRecords = occupiedRecords.filter(r => {
						return laterOrEqualTo(currentTimeStr, r.startTime) && earlierThan(currentTimeStr, r.endTime);
					});
				}

				// 按结束时间降序排列
				occupiedRecords.sort((a, b) => b.endTime.localeCompare(a.endTime));

				const isOccupied = occupiedRecords.length > 0;

				return {
					...room,
					isOccupied,
					occupiedRecords
				};
			});

			// 准备日期选择器数据
			const dateSelector = {
				selectedDate: today,
				previousDate: getPreviousDate(today),
				nextDate: getNextDate(today),
				isToday: today === getCurrentDate()
			};

			const { rotationList, quickReservationGroups } = rotationResult;

			this.page.setData({
				rooms,
				activeStaffList: allStaff.filter(s => s.status === 'active'&&s.role === 'technician'),
				dateSelector,
				rotationList,
				rotationOrder: rotationList.map(item => item._id),
				quickReservationGroups,
				timelineRefreshTrigger: this.page.data.timelineRefreshTrigger + 1
			});
		}, {
			loadingText: '加载数据...',
			lockKey: LockKeys.LOAD_CASHIER_DATA,
			errorText: '加载数据失败'
		});
	}

	async loadTimelineData(): Promise<void> {
		const { pushModalLocked, pushModal } = this.page.data;

		// 只有在非推送确认弹窗状态下才显示loading
		const shouldShowLoading = !pushModalLocked && !pushModal?.show;
		if (shouldShowLoading) {
			this.page.setData({ loading: true, loadingText: '加载中...' });
		}

		try {
			const today = this.page.data.selectedDate || getCurrentDate();
			const dateSelector = {
				selectedDate: today,
				previousDate: getPreviousDate(today),
				nextDate: getNextDate(today),
				isToday: today === getCurrentDate()
			};

			// 更新轮牌列表并计算快速预约时段
			const rotationResult = await this.prepareRotationList(today);
			const rotationList = rotationResult.rotationList;

			this.page.setData({
				dateSelector,
				rotationList,
				rotationOrder: rotationList.map(item => item._id),
				quickReservationGroups: rotationResult.quickReservationGroups,
				timelineRefreshTrigger: this.page.data.timelineRefreshTrigger + 1
			});
		} finally {
			if (shouldShowLoading) {
				this.page.setData({ loading: false });
			}
		}
	}

	/** 5种快速预约组合的静态配置 */
	private readonly QUICK_GROUPS_CONFIG: Array<{ key: string; label: string; maleCount: number; femaleCount }> = [
		{ key: 'oneFemale',       label: '1位女技师', maleCount: 0, femaleCount: 1 },
		{ key: 'oneMale',         label: '1位男技师', maleCount: 1, femaleCount: 0 },
		{ key: 'twoFemale',       label: '2位女技师', maleCount: 0, femaleCount: 2 },
		{ key: 'oneMaleOneFemale',label: '1男1女',    maleCount: 1, femaleCount: 1 },
		{ key: 'twoMale',         label: '2位男技师', maleCount: 2, femaleCount: 0 },
	];

	/** 将云函数返回的原始时段转换为前端 QuickSlot */
	private convertRawSlots(rawList: QuickSlotRaw[]): QuickSlot[] {
		// 按 staffNames 中的性别分类（简单规则：名字含常规女名特征 → female，否则 male）
		// 注：staffNames 由云函数返回，无法直接获取性别，这里不再分类展示
		return rawList.map(s => ({
			...s,
			maleStaff: [] as string[],
			femaleStaff: [...s.staffNames]
		}));
	}

	async prepareRotationList(today: string): Promise<{ rotationList: RotationItem[]; quickReservationGroups: QuickReservationGroup[] }> {
		const empty: QuickReservationGroup[] = this.QUICK_GROUPS_CONFIG.map(cfg => ({
			key: cfg.key,
			label: cfg.label,
			maleCount: cfg.maleCount,
			femaleCount: cfg.femaleCount,
			earliestTime: '',
			slots: [],
			emptyReason: '暂无数据'
		}));
		const emptyResult = { rotationList: [] as RotationItem[], quickReservationGroups: empty };

		try {
			const res = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: { mode: 'rotationQuickSlots', date: today }
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as {
					code: number;
					data: {
						rotationItems: RotationItem[];
						quickReservationSlots: Record<string, QuickSlotRaw[]>;
					};
				};
				if (result.code === 0 && result.data) {
					const raw = result.data.quickReservationSlots;
					const groups = this.QUICK_GROUPS_CONFIG.map(cfg => {
						const rawList = (raw[cfg.key] || []) as QuickSlotRaw[];
						const slots = this.convertRawSlots(rawList);
						return {
							key: cfg.key,
							label: cfg.label,
							maleCount: cfg.maleCount,
							femaleCount: cfg.femaleCount,
							earliestTime: slots[0]?.time || '',
							slots,
							emptyReason: slots.length === 0 ? '暂无可约时段' : undefined
						};
					});
					return {
						rotationList: result.data.rotationItems,
						quickReservationGroups: groups
					};
				}
			}
		} catch (error) {
			console.error('prepareRotationList failed:', error);
		}
		return emptyResult;
	}

	// 预加载技师可用性（供预约弹窗使用）
	async loadTechnicianAvailability(date: string, startTime: string, projectDuration: number, excludeReservationIds: string[] = []): Promise<StaffAvailability[]> {
		try {
			const res = await wx.cloud.callFunction({
				name: 'getAvailableTechnicians',
				data: {
					date,
					currentTime: startTime,
					projectDuration,
					currentReservationIds: excludeReservationIds
				}
			});

			if (res.result && typeof res.result === 'object') {
				const result = res.result as { code: number; data: StaffAvailability[] };
				if (result.code === 0 && result.data) {
					return result.data;
				}
			}
			return [];
		} catch (error) {
			return [];
		}
	}

}
