import { cloudDb, Collections } from '../../utils/cloud-db';

const app = getApp<IAppOption>();

Page({
  data: {
    loading: false,
    customerList: [] as CustomerRecord[],
    showEditModal: false,
    modalTitle: '',
    editCustomer: null as CustomerRecord | null,
    formPhone: '',
    formName: '',
    formGender: '' as 'male' | 'female' | '',
    formResponsibleTechnician: '',
    formLicensePlate: '',
    formRemarks: '',
    technicianList: [] as StaffInfo[],
    selectedCustomer: null as CustomerRecord | null,
    visitRecords: [] as CustomerVisit[],
    showDetailModal: false,
    showOpenCardModal: false,
    selectedCustomerForCard: null as CustomerRecord | null,
    membershipCards: [] as MembershipCard[],
    selectedCardId: '',
    selectedCardInfo: null as MembershipCard | null,
    formPaidAmount: '',
    formSalesStaff: '',
    formCardRemarks: '',
    customerMemberships: [] as CustomerMembership[],
    searchKeyword: '',
    currentPage: 1,
    pageSize: 20,
    total: 0,
    hasMore: true
  },

  onLoad() {
    this.loadTechnicianList();
  },

  onShow() {
    this.loadCustomerList();
  },

  async loadTechnicianList() {
    try {
      const staffList = await app.getActiveStaffs();
      this.setData({ technicianList: staffList });
    } catch (error) {
      console.error('加载技师列表失败:', error);
    }
  },

  async loadCustomerList(resetPage: boolean = true) {
    try {
      if (resetPage) {
        this.setData({ 
          loading: true, 
          currentPage: 1,
          customerList: [] 
        });
      } else {
        this.setData({ loading: true });
      }

      const { searchKeyword, currentPage, pageSize } = this.data;

      const result = await cloudDb.findWithPage<CustomerRecord>(
        Collections.CUSTOMERS,
        (customer) => {
          if (!searchKeyword) return true;
          
          const keyword = searchKeyword.toLowerCase();
          const nameMatch = customer.name ? customer.name.toLowerCase().includes(keyword) : false;
          const phoneMatch = customer.phone ? customer.phone.includes(keyword) : false;
          
          return nameMatch || phoneMatch;
        },
        currentPage,
        pageSize,
        { field: 'createdAt', direction: 'desc' }
      );

      const newList = resetPage ? result.data : [...this.data.customerList, ...result.data];

      this.setData({ 
        customerList: newList,
        total: result.total,
        hasMore: result.hasMore,
        loading: false 
      });
    } catch (error) {
      console.error('加载顾客列表失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  showAddCustomer() {
    this.setData({
      showEditModal: true,
      modalTitle: '新增顾客',
      editCustomer: null,
      formPhone: '',
      formName: '',
      formGender: '',
      formResponsibleTechnician: '',
      formLicensePlate: '',
      formRemarks: ''
    });
  },

  showEditCustomer(e: WechatMiniprogram.CustomEvent) {
    const customer = e.currentTarget.dataset.customer as CustomerRecord;
    this.setData({
      showEditModal: true,
      modalTitle: '编辑顾客',
      editCustomer: customer,
      formPhone: customer.phone,
      formName: customer.name,
      formGender: customer.gender || '',
      formResponsibleTechnician: customer.responsibleTechnician,
      formLicensePlate: customer.licensePlate,
      formRemarks: customer.remarks
    });
  },

  onModalCancel() {
    this.setData({
      showEditModal: false,
      editCustomer: null,
      formPhone: '',
      formName: '',
      formGender: '',
      formResponsibleTechnician: '',
      formLicensePlate: '',
      formRemarks: ''
    });
  },

  async onModalConfirm() {
    const { editCustomer, formPhone, formName, formGender, formResponsibleTechnician, formLicensePlate, formRemarks } = this.data;

    if (!formPhone && !formName) {
      wx.showToast({
        title: '请填写手机号或姓名',
        icon: 'none'
      });
      return;
    }

    try {
      this.setData({ loading: true });
      if (editCustomer) {
        await cloudDb.updateById<CustomerRecord>(Collections.CUSTOMERS, editCustomer._id, {
          phone: formPhone,
          name: formName,
          gender: formGender,
          responsibleTechnician: formResponsibleTechnician,
          licensePlate: formLicensePlate,
          remarks: formRemarks
        });
      } else {
        await cloudDb.insert(Collections.CUSTOMERS, {
          phone: formPhone,
          name: formName,
          gender: formGender,
          responsibleTechnician: formResponsibleTechnician,
          licensePlate: formLicensePlate,
          remarks: formRemarks,
        });
      }

      this.setData({
        showEditModal: false,
        editCustomer: null,
        formPhone: '',
        formName: '',
        formGender: '',
        formResponsibleTechnician: '',
        formLicensePlate: '',
        formRemarks: ''
      });

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      await this.loadCustomerList();
    } catch (error) {
      console.error('保存顾客信息失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      });
    }
  },

  onPhoneInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ formPhone: e.detail.value });
  },

  onNameInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ formName: e.detail.value });
  },

  onGenderChange(e: WechatMiniprogram.CustomEvent) {
    const gender = e.currentTarget.dataset.gender;
    this.setData({ formGender: gender });
  },

  onTechnicianSelect(e: WechatMiniprogram.CustomEvent) {
    const technician = e.currentTarget.dataset.technician;
    this.setData({ formResponsibleTechnician: technician });
  },

  onLicensePlateInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ formLicensePlate: e.detail.value });
  },

  onRemarksInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ formRemarks: e.detail.value });
  },

  async loadCustomerVisits(e: WechatMiniprogram.CustomEvent) {
    try {
      this.setData({ loading: true });
      const customer = e.currentTarget.dataset.customer as CustomerRecord;
      const visitRecords: CustomerVisit[] = [];
      let customerMemberships: CustomerMembership[] = [];

      if (customer.phone) {
        const res = await wx.cloud.callFunction({
          name: 'getCustomerHistory',
          data: {
            phone: customer.phone
          }
        });

        if (!res.result || typeof res.result !== 'object') {
          throw new Error('获取顾客历史失败');
        }

        const { code, data, message } = res.result as any;

        if (code === 0 && data) {
          data.visitRecords.forEach((record: any) => {
            if (!record.isVoided) {
              visitRecords.push({
                _id: record._id,
                date: record.date,
                project: record.project,
                technician: record.technician,
                room: record.room,
                amount: record.amount,
                isClockIn: record.isClockIn
              });
            }
          });

          visitRecords.sort((a, b) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
          });

          customerMemberships = data.customerMemberships || [];
        }
      }

      this.setData({
        selectedCustomer: customer,
        visitRecords,
        customerMemberships,
        showDetailModal: true,
        loading: false
      });
    } catch (error) {
      console.error('加载顾客历史失败:', error);
      this.setData({ loading: false });
    }
  },

  closeDetailModal() {
    this.setData({
      showDetailModal: false,
      selectedCustomer: null,
      visitRecords: [],
      customerMemberships: []
    });
  },

  goToConsultationDetail() {
    const selectedCustomer = this.data.selectedCustomer!;
    wx.navigateTo({
      url: `/pages/history/history?customerPhone=${selectedCustomer.phone}&customerId=${selectedCustomer.phone || selectedCustomer._id}&readonly=true`
    });
  },

  async loadMembershipCards() {
    try {
      this.setData({ loading: true });
      const cards = await cloudDb.getAll<MembershipCard>(Collections.MEMBERSHIP);
      const activeCards = cards.filter(card => card.status === 'active');
      this.setData({ membershipCards: activeCards, loading: false });
    } catch (error) {
      console.error('加载会员卡列表失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载会员卡失败',
        icon: 'error'
      });
    }
  },

  showOpenCardModal(e: WechatMiniprogram.CustomEvent) {
    const customer = e.currentTarget.dataset.customer as CustomerRecord;
    this.loadMembershipCards();
    this.setData({
      showOpenCardModal: true,
      selectedCustomerForCard: customer,
      selectedCardId: '',
      selectedCardInfo: null,
      formPaidAmount: '',
      formSalesStaff: '',
      formCardRemarks: ''
    });
  },

  onOpenCardCancel() {
    this.setData({
      showOpenCardModal: false,
      selectedCustomerForCard: null,
      selectedCardId: '',
      selectedCardInfo: null,
      formPaidAmount: '',
      formSalesStaff: '',
      formCardRemarks: ''
    });
  },

  onCardSelect(e: WechatMiniprogram.CustomEvent) {
    const card = e.currentTarget.dataset.card as MembershipCard;
    this.setData({
      selectedCardId: card._id,
      selectedCardInfo: card
    });
  },

  onPaidAmountInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ formPaidAmount: e.detail.value });
  },

  onSalesStaffSelect(e: WechatMiniprogram.CustomEvent) {
    const staff = e.currentTarget.dataset.staff;
    this.setData({ formSalesStaff: staff });
  },

  onCardRemarksInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ formCardRemarks: e.detail.value });
  },

  async onOpenCardConfirm() {
    const { selectedCustomerForCard, selectedCardInfo, formPaidAmount, formSalesStaff, formCardRemarks } = this.data;

    if (!selectedCustomerForCard) {
      wx.showToast({
        title: '顾客信息错误',
        icon: 'none'
      });
      return;
    }

    if (!selectedCardInfo) {
      wx.showToast({
        title: '请选择会员卡',
        icon: 'none'
      });
      return;
    }

    if (!formPaidAmount.trim()) {
      wx.showToast({
        title: '请输入实付金额',
        icon: 'none'
      });
      return;
    }

    if (!formSalesStaff.trim()) {
      wx.showToast({
        title: '请选择销售员工',
        icon: 'none'
      });
      return;
    }

    const paidAmount = parseFloat(formPaidAmount);
    if (isNaN(paidAmount) || paidAmount < 0) {
      wx.showToast({
        title: '实付金额不能小于0',
        icon: 'none'
      });
      return;
    }

    try {
      this.setData({ loading: true });
      await cloudDb.insert(Collections.CUSTOMER_MEMBERSHIP, {
        customerId: selectedCustomerForCard._id,
        customerName: selectedCustomerForCard.name,
        customerPhone: selectedCustomerForCard.phone,
        cardId: selectedCardInfo._id,
        cardName: selectedCardInfo.name,
        originalPrice: selectedCardInfo.originalPrice,
        paidAmount,
        remainingTimes: selectedCardInfo.totalTimes,
        project: selectedCardInfo.project,
        salesStaff: formSalesStaff,
        remarks: formCardRemarks,
        status: 'active'
      });

      this.setData({
        showOpenCardModal: false,
        selectedCustomerForCard: null,
        selectedCardId: '',
        selectedCardInfo: null,
        formPaidAmount: '',
        formSalesStaff: '',
        formCardRemarks: '',
        loading: false
      });

      wx.showToast({
        title: '开卡成功',
        icon: 'success'
      });
    } catch (error) {
      console.error('开卡失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '开卡失败',
        icon: 'error'
      });
    }
  },

  onSearchInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearchConfirm() {
    this.loadCustomerList(true);
  },

  onClearSearch() {
    this.setData({ searchKeyword: '' });
    this.loadCustomerList(true);
  },

  onLoadMore() {
    const { hasMore, loading } = this.data;
    if (!hasMore || loading) {
      return;
    }

    const nextPage = this.data.currentPage + 1;
    this.setData({ currentPage: nextPage });
    this.loadCustomerList(false);
  },
});
