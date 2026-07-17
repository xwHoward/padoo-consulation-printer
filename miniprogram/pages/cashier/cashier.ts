// cashier.ts - 收银台主页面（模块化重构版）
import { checkLogin } from '../../utils/auth';
import { loadingService, LockKeys } from '../../utils/loading-service';
import { hasButtonPermission, requirePagePermission } from '../../utils/permission';
import { COUPON_PLATFORM_NAMES } from '../../utils/constants';
import { calculateProjectEndTime, formatDate, formatTime, getCurrentDate, parseProjectDuration } from '../../utils/util';
import type { CashierPage, PaymentMethodItem, QuickReservationGroup } from './cashier.types';
import { ReservationHandler } from './handlers/reservation.handler';
import { SettlementHandler } from './handlers/settlement.handler';
import { PushHandler } from './handlers/push.handler';
import { CashierDataLoaderService } from './services/data-loader.service';
import { searchCustomer, applyMatchedCustomer, clearMatchedCustomer } from './utils/customer-match';
import { cloudDb, Collections } from '../../utils/cloud-db';

const app = getApp<IAppOption>();

// 处理器实例（延迟初始化）
let reservationHandler: ReservationHandler | null = null;
let settlementHandler: SettlementHandler | null = null;
let pushHandler: PushHandler | null = null;
let dataLoader: CashierDataLoaderService | null = null;

Page({
    data: {
        isLandscape: false,
        selectedDate: '',
        rooms: [] as Room[],
        rotationList: [] as RotationItem[],
        rotationOrder: [] as string[],
        timelineRefreshTrigger: 0,
        _isFirstShow: true, // 用于防止首次加载时onLoad和onShow重复请求
        // 日期选择器状态
        dateSelector: {
            selectedDate: '',
            previousDate: '',
            nextDate: '',
            isToday: false
        },
        // 权限状态
        canCreateReservation: false,
        canPushRotation: false,
        // 预约弹窗相关
        showReserveModal: false,
        projects: [] as Project[],
        activeStaffList: [] as StaffInfo[],
        staffAvailability: [] as StaffAvailability[],
        availableMaleCount: 0,
        availableFemaleCount: 0,
        reserveForm: {
            _id: '',
            date: '',
            customerName: '',
            gender: 'male' as 'male' | 'female',
            project: '',
            projects: [] as string[],
            phone: '',
            requirementType: 'gender' as 'specific' | 'gender',
            selectedTechnicians: [] as Array<{ _id: string; name: string; phone: string; isClockIn: boolean }>,
            genderRequirement: { male: 0, female: 0 },
            startTime: '',
            technicianId: '',
            technicianName: '',
        },
        startTimeMultiIndex: [0, 0],
        startTimeRange: [] as string[][],
        originalReservation: null as ReservationRecord | null,
        editingGroupIds: [] as string[],
        // 结算弹窗相关
        showSettlementModal: false,
        settlementRecordId: '',
        settlementCouponCode: '',
        projectOriginalPrice: 0,
        totalSettlementAmount: 0,
        paymentMethods: Object.entries(COUPON_PLATFORM_NAMES).map(([key, label]) => ({
            key, label, selected: false, amount: '', couponCode: ''
        })),
        // loading状态
        loading: false,
        loadingText: '加载中...',
        // 顾客匹配
        matchedCustomer: null as CustomerRecord | null,
        matchedCustomerApplied: false,
        pushModalLocked: false,
        // 轮牌推送确认弹窗
        rotationPushModal: {
            show: false,
            loading: false
        },
        // 快速预约时段（5种固定组合）
        quickReservationGroups: [] as QuickReservationGroup[],
        quickReservationLoading: false,
        // 加钟弹窗
        extraTimeModal: {
            show: false,
            sourceRecordId: '' as string,
            projects: [] as Project[],
            selectedProject: '' as string,
            selectedProjectName: '' as string,
            quantity: 1
        }
    },

    // ========== 生命周期 ==========
    async onLoad() {
        const isLoggedIn = await checkLogin();
        if (!isLoggedIn) return;

        if (!requirePagePermission('cashier')) return;

        this.initHandlers();

        const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
        const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
        this.setData({ startTimeRange: [hours, minutes] });

        const today = getCurrentDate();
        this.setData({ selectedDate: today });
        this.loadProjects();
        
        // 首次加载在onLoad中执行，避免与onShow重复
        this.setData({
            canCreateReservation: hasButtonPermission('createReservation'),
            canPushRotation: hasButtonPermission('pushRotation')
        });
        this.loadInitialData();
    },

    async onShow() {
        const isLoggedIn = await checkLogin();
        if (!isLoggedIn) return;

        if (!requirePagePermission('cashier')) return;

        // 首次显示时跳过，因为已在onLoad中加载
        if (this.data._isFirstShow) {
            this.setData({ _isFirstShow: false });
            return;
        }

        // 后续回到页面时重新加载数据
        this.setData({
            canCreateReservation: hasButtonPermission('createReservation'),
            canPushRotation: hasButtonPermission('pushRotation')
        });
        this.loadInitialData();
    },

    // ========== 初始化 ==========
    initHandlers() {
        pushHandler = new PushHandler(this as CashierPage);
        reservationHandler = new ReservationHandler(this as CashierPage);
        settlementHandler = new SettlementHandler(this as CashierPage);
        dataLoader = new CashierDataLoaderService(this as CashierPage);
    },

    // ========== 切换横屏/竖屏 ==========
    toggleLandscape() {
        const isLandscape = !this.data.isLandscape;
        this.setData({ isLandscape });

        try {
            wx.setPageOrientation({
                pageOrientation: isLandscape ? 'landscape' : 'portrait'
            });
        } catch (error) {
            wx.showToast({ title: '设置失败', icon: 'none' });
        }
    },

    // ========== 数据加载 ==========
    async loadProjects() {
        const projects = app.globalData.projects || [];
        this.setData({ projects });
    },

    async loadInitialData() {
        if (dataLoader) {
            await dataLoader.loadInitialData();
        }
    },

    async loadTimelineData() {
        if (dataLoader) {
            await dataLoader.loadTimelineData();
        }
    },

    // ========== 日期选择 ==========
    onDatePickerChange(e: WechatMiniprogram.CustomEvent) {
        const date = e.detail.date;
        this.setData({ selectedDate: date });
    },

    copyReservationSlot(e: WechatMiniprogram.CustomEvent) {
        const { text, label, malecount, femalecount } = e.currentTarget.dataset;

        const timeRange = text.match(/^(\d{2}:\d{2}-\d{2}:\d{2})/)?.[1] || text;

        const parts: string[] = [];
        const mc = parseInt(malecount) || 0;
        const fc = parseInt(femalecount) || 0;
        if (mc > 0) parts.push(`${mc}位男技师`);
        if (fc > 0) parts.push(`${fc}位女技师`);
        const staffLabel = parts.join('+') || label || '';

        const message = `您好，目前${staffLabel}可预约时段为${timeRange}哦，您可以告诉小趴到店时间，小趴给您保留预约哦~`;

        wx.setClipboardData({
            data: message,
            success: () => {
                wx.showToast({
                    title: '已复制到剪贴板',
                    icon: 'success',
                    duration: 2000
                });
            },
            fail: () => {
                wx.showToast({
                    title: '复制失败',
                    icon: 'error',
                    duration: 2000
                });
            }
        });
    },

    // ========== 轮牌相关 ==========
    async moveRotation(e: WechatMiniprogram.TouchEvent) {
        const { index, direction } = e.currentTarget.dataset;
        const list = [...this.data.rotationList];

        let fromIndex = index;
        let toIndex = index;

        if (direction === 'up' && index > 0) {
            toIndex = index - 1;
        } else if (direction === 'down' && index < list.length - 1) {
            toIndex = index + 1;
        } else {
            return;
        }

        await loadingService.withLoading(this, async () => {
            const result = await app.adjustRotationPosition(this.data.selectedDate, fromIndex, toIndex);

            if (result) {
                [list[fromIndex], list[toIndex]] = [list[toIndex], list[fromIndex]];
                this.setData({ rotationList: list });
                await app.loadGlobalData();
                wx.showToast({ title: '调整成功', icon: 'success' });
            } else {
                throw new Error('调整失败');
            }
        }, {
            loadingText: '调整中...',
            lockKey: LockKeys.ADJUST_ROTATION,
            errorText: '调整失败'
        });
    },
    
    // ========== 时间轴轮牌事件（来自 timeline 组件） ==========
    async onTimelineAdjustRotation(e: WechatMiniprogram.CustomEvent) {
        const { index, direction } = e.detail;
        const list = [...this.data.rotationList];

        let fromIndex = index;
        let toIndex = index;

        if (direction === 'up' && index > 0) {
            toIndex = index - 1;
        } else if (direction === 'down' && index < list.length - 1) {
            toIndex = index + 1;
        } else {
            return;
        }

        await loadingService.withLoading(this, async () => {
            const result = await app.adjustRotationPosition(this.data.selectedDate, fromIndex, toIndex);

            if (result) {
                [list[fromIndex], list[toIndex]] = [list[toIndex], list[fromIndex]];
                const rotationOrder = list.map(item => item._id);
                this.setData({ 
                    rotationList: list, 
                    rotationOrder,
                    timelineRefreshTrigger: this.data.timelineRefreshTrigger + 1
                });
                await app.loadGlobalData();
                wx.showToast({ title: '调整成功', icon: 'success' });
            } else {
                throw new Error('调整失败');
            }
        }, {
            loadingText: '调整中...',
            lockKey: LockKeys.ADJUST_ROTATION,
            errorText: '调整失败'
        });
    },

    onTimelineCopySlot(e: WechatMiniprogram.CustomEvent) {
        const { staffName, slots } = e.detail;
        
        if (slots === '已满') {
            wx.setClipboardData({
                data: `您好，${staffName}老师今日预约已满，无法预约了哦`,
                success: () => {
                    wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 2000 });
                },
                fail: () => {
                    wx.showToast({ title: '复制失败', icon: 'error', duration: 2000 });
                }
            });
            return;
        }
        
        const message = `您好，目前${staffName}老师可预约时段为${slots}哦，您可以告诉小趴到店时间，小趴给您保留预约哦~`;
        
        wx.setClipboardData({
            data: message,
            success: () => {
                wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 2000 });
            },
            fail: () => {
                wx.showToast({ title: '复制失败', icon: 'error', duration: 2000 });
            }
        });
    },

    async onTimelineResetRotation() {
        await this.resetRotation();
    },

    onTimelinePushRotation() {
        const { rotationList, selectedDate } = this.data;
        if (rotationList.length === 0) {
            wx.showToast({ title: '暂无轮牌数据', icon: 'none' });
            return;
        }
        
        const rotationLines = rotationList.map((staff, idx) =>
            `${idx + 1}. ${staff.name} (${staff.shift === 'morning' ? '早班' : '晚班'})`
        ).join('\n');
        
        const message = `【今日轮牌】\n\n日期：${selectedDate}\n\n${rotationLines}\n\n请各位同事确认今日轮牌顺序，有问题与店长沟通！`;
        
        wx.setClipboardData({
            data: message,
            success: () => {
                wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 2000 });
            },
            fail: () => {
                wx.showToast({ title: '复制失败，请重试', icon: 'none' });
            }
        });
    },

    // ========== 预约相关（委托给 ReservationHandler） ==========
    async openReserveModal() {
        if (reservationHandler) await reservationHandler.openReserveModal();
    },

    closeReserveModal() {
        if (reservationHandler) reservationHandler.closeReserveModal();
    },

    async checkStaffAvailability() {
        if (reservationHandler) await reservationHandler.checkStaffAvailability();
    },

    onRequirementTypeChange(e: WechatMiniprogram.CustomEvent) {
        if (reservationHandler) reservationHandler.onRequirementTypeChange(e);
    },

    onChangeGenderCount(e: WechatMiniprogram.CustomEvent) {
        if (reservationHandler) reservationHandler.onChangeGenderCount(e);
    },

    onReserveFieldChange(e: WechatMiniprogram.CustomEvent) {
        if (reservationHandler) reservationHandler.onReserveFieldChange(e);
    },

    onStartTimeChange(e: WechatMiniprogram.CustomEvent) {
        if (reservationHandler) reservationHandler.onStartTimeChange(e);
    },

    selectReserveTechnician(e: WechatMiniprogram.CustomEvent) {
        if (reservationHandler) reservationHandler.selectReserveTechnician(e);
    },

    async selectReserveProject(e: WechatMiniprogram.CustomEvent) {
        if (reservationHandler) await reservationHandler.selectReserveProject(e);
    },

    onReserveGenderChange(e: WechatMiniprogram.CustomEvent) {
        if (reservationHandler) reservationHandler.onReserveGenderChange(e);
    },

    onRenewalToggle(e: WechatMiniprogram.CustomEvent) {
        if (reservationHandler) reservationHandler.onRenewalToggle(e);
    },

    async confirmReserve() {
        if (reservationHandler) await reservationHandler.confirmReserve();
    },

    async cancelReservation(_id: string) {
        if (reservationHandler) await reservationHandler.cancelReservation(_id);
    },

    async editReservation(_id: string) {
        if (reservationHandler) await reservationHandler.editReservation(_id);
    },

    async handleArrival(reserveId: string) {
        if (reservationHandler) await reservationHandler.handleArrival(reserveId);
    },

    async handleEarlyFinish(recordId: string) {
        if (reservationHandler) await reservationHandler.handleEarlyFinish(recordId);
    },

    // ========== 加钟 ==========
    async openExtraTimeModal(recordId: string) {
        const projects = (this.data.projects || []);
        this.setData({
            extraTimeModal: {
                show: true,
                sourceRecordId: recordId,
                projects,
                selectedProject: '',
                selectedProjectName: '',
                quantity: 1
            }
        });
    },

    closeExtraTimeModal() {
        this.setData({
            'extraTimeModal.show': false
        });
    },

    selectExtraTimeProject(e: WechatMiniprogram.CustomEvent) {
        const { id, name } = e.currentTarget.dataset;
        this.setData({
            'extraTimeModal.selectedProject': id,
            'extraTimeModal.selectedProjectName': name
        });
    },

    onExtraTimeQuantityChange(e: WechatMiniprogram.CustomEvent) {
        const { action } = e.currentTarget.dataset;
        const current = this.data.extraTimeModal.quantity;
        if (action === 'increase') {
            this.setData({ 'extraTimeModal.quantity': current + 1 });
        } else if (action === 'decrease' && current > 1) {
            this.setData({ 'extraTimeModal.quantity': current - 1 });
        }
    },

    async confirmExtraTime() {
        const { sourceRecordId, selectedProject, selectedProjectName, quantity } = this.data.extraTimeModal;
        if (!selectedProject) {
            wx.showToast({ title: '请选择一个加钟项目', icon: 'none' });
            return;
        }

        this.setData({ loading: true, loadingText: '加钟中...' });
        try {
            const record = await cloudDb.findById<ConsultationRecord>(Collections.CONSULTATION, sourceRecordId);
            if (!record) {
                wx.showToast({ title: '未找到原始单据', icon: 'error' });
                return;
            }

            const [endH, endM] = record.endTime.split(':').map(Number);
            const [year, month, day] = record.date.split('-').map(Number);
            const startTimeDate = new Date(year, month - 1, day, endH, endM, 0, 0);
            const startTime = formatTime(startTimeDate, false);

            const duration = parseProjectDuration(selectedProjectName) || 90;
            const totalDuration = duration * quantity;
            const endTimeDate = new Date(startTimeDate.getTime() + totalDuration * 60 * 1000);
            const endTime = formatTime(endTimeDate, false);

            const extraRecord: Add<ConsultationRecord> = {
                surname: record.surname,
                gender: record.gender,
                project: selectedProjectName,
                technician: record.technician,
                room: record.room,
                massageStrength: record.massageStrength,
                essentialOil: record.essentialOil,
                selectedParts: record.selectedParts || {},
                isClockIn: false,
                remarks: record.remarks || '',
                phone: record.phone || '',
                couponCode: '',
                couponPlatform: record.couponPlatform || 'meituan',
                extraTime: 0,
                date: record.date,
                startTime,
                endTime,
                isVoided: false,
                overtime: 0,
                guasha: false,
                isExtraTime: true
            };

            await cloudDb.saveConsultation(extraRecord);

            this.closeExtraTimeModal();
            await this.loadTimelineData();
            wx.showToast({ title: '加钟成功', icon: 'success' });
        } catch (error: any) {
            wx.showToast({
                title: error?.message || '加钟失败',
                icon: 'error'
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    // ========== 顾客匹配（委托给 utils） ==========
    async searchCustomer() {
        await searchCustomer(this as CashierPage);
    },

    applyMatchedCustomer() {
        applyMatchedCustomer(this as CashierPage);
    },

    clearMatchedCustomer() {
        clearMatchedCustomer(this as CashierPage);
    },

    // ========== 结算相关（委托给 SettlementHandler） ==========
    async openSettlement(_id: string) {
        if (settlementHandler) await settlementHandler.openSettlement(_id);
    },

    loadSettlement(_id: string, record: ConsultationRecord) {
        if (settlementHandler) settlementHandler.loadSettlement(_id, record);
    },

    closeSettlementModal() {
        if (settlementHandler) settlementHandler.closeSettlementModal();
    },

    calculateTotalAmount(paymentMethods: PaymentMethodItem[]) {
        if (settlementHandler) settlementHandler.calculateTotalAmount(paymentMethods);
    },

    togglePaymentMethod(e: WechatMiniprogram.CustomEvent) {
        if (settlementHandler) settlementHandler.togglePaymentMethod(e);
    },

    onPaymentAmountInput(e: WechatMiniprogram.CustomEvent) {
        if (settlementHandler) settlementHandler.onPaymentAmountInput(e);
    },

    onPaymentCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
        if (settlementHandler) settlementHandler.onPaymentCouponCodeInput(e);
    },

    async confirmSettlement() {
        if (settlementHandler) await settlementHandler.confirmSettlement();
    },

    // ========== 推送相关（委托给 PushHandler） ==========
    getReservationTypeText(technicians: Array<{ _id: string; name: string; phone: string; isClockIn: boolean }>): string {
        if (pushHandler) return pushHandler.getReservationTypeText(technicians);
        return '排钟';
    },

    openRotationPushModal() {
        if (pushHandler) pushHandler.openRotationPushModal();
    },

    async copyTechnicianSlot(e: WechatMiniprogram.CustomEvent) {
        const { name, slots } = e.currentTarget.dataset;
if(slots === '已满'){
        wx.setClipboardData({
            data: `您好，${name}老师今日预约已满，无法预约了哦`,
            success: () => {
                wx.showToast({
                    title: '已复制到剪贴板',
                    icon: 'success',
                    duration: 2000
                });
            },
            fail: () => {
                wx.showToast({
                    title: '复制失败',
                    icon: 'error',
                    duration: 2000
                });
            }
        });
        return;
}
        const message = `您好，目前${name}老师可预约时段为${slots}哦，您可以告诉小趴到店时间，小趴给您保留预约哦~`;

        wx.setClipboardData({
            data: message,
            success: () => {
                wx.showToast({
                    title: '已复制到剪贴板',
                    icon: 'success',
                    duration: 2000
                });
            },
            fail: () => {
                wx.showToast({
                    title: '复制失败',
                    icon: 'error',
                    duration: 2000
                });
            }
        });
    },

    async resetRotation() {
        const { selectedDate } = this.data;
        if (!selectedDate) return;

        await loadingService.withLoading(this, async () => {
            await app.initRotation(selectedDate);
            await this.loadTimelineData();
            wx.showToast({ title: '重置成功', icon: 'success' });
        }, {
            loadingText: '重置中...',
            lockKey: LockKeys.ADJUST_ROTATION,
            errorText: '重置失败'
        });
    },

    onRotationPushModalCancel() {
        if (pushHandler) pushHandler.onRotationPushModalCancel();
    },

    async onRotationPushModalConfirm() {
        if (pushHandler) await pushHandler.onRotationPushModalConfirm();
    },

    // ========== 时间轴点击操作 ==========
    onBlockClick(e: WechatMiniprogram.CustomEvent) {
        const { id: _id, reservation, settled, inprogress } = e.detail;

        let itemList: string[];

        if (reservation) {
            itemList = ['编辑', '到店', '取消预约'];
        } else {
            if (inprogress) {
                itemList = settled ? ['编辑', '修改结算', '提前下钟'] : ['编辑', '结算', '加钟', '提前下钟'];
            } else {
                itemList = settled ? ['编辑', '修改结算'] : ['编辑', '结算'];
            }
        }

        wx.showActionSheet({
            itemList,
            success: (res) => {
                const action = itemList[res.tapIndex];
                if (action === '编辑') {
                    if (reservation) {
                        this.editReservation(_id);
                    } else {
                        wx.navigateTo({ url: `/pages/index/index?editId=${_id}` });
                    }
                } else if (action === '到店') {
                    this.handleArrival(_id);
                } else if (action === '取消预约') {
                    this.cancelReservation(_id);
                } else if (action === '结算' || action === '修改结算') {
                    this.openSettlement(_id);
                } else if (action === '提前下钟') {
                    this.handleEarlyFinish(_id);
                } else if (action === '加钟') {
                    this.openExtraTimeModal(_id);
                }
            }
        });
    },

    // 跳转到主页
    goToHome() {
        wx.navigateTo({
            url: "/pages/store-config/store-config",
        });
    },

    onScreensaver() {
        wx.navigateTo({
            url: "/pages/screensaver/screensaver",
        });
    },

    goToIndex() {
        wx.navigateTo({
            url: "/pages/index/index",
        });
    },

    // 跳转到历史页面
    goToHistory() {
        wx.navigateTo({
            url: "/pages/history/history",
        });
    },

    goToProjectList() {
        wx.navigateTo({
            url: "/pages/project-list/project-list",
        });
    },
});
