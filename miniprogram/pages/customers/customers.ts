import {db, Collections} from "../../utils/db";

Page({
  data: {
    customerList: [] as CustomerRecord[],
    showEditModal: false,
    modalTitle: '',
    editCustomer: null as CustomerRecord | null,
    formPhone: '',
    formName: '',
    formResponsibleTechnician: '',
    formLicensePlate: '',
    formRemarks: '',
    technicianList: [] as {id: string; name: string;}[],
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
    customerMemberships: [] as CustomerMembership[]
  },

  onLoad() {
    this.loadTechnicianList();
    this.loadCustomerList();
  },

  onShow() {
    this.loadCustomerList();
  },

  loadTechnicianList() {
    try {
      const staffList = db.find<{id: string; name: string; status: string; createdAt: string; updatedAt: string;}>(Collections.STAFF, {
        status: 'active'
      });
      this.setData({technicianList: staffList});
    } catch (error) {
      console.error('加载技师列表失败:', error);
    }
  },

  loadCustomerList() {
    try {
      // 1. 获取数据库中已保存的顾客
      const savedCustomers = db.getAll<CustomerRecord>(Collections.CUSTOMERS);
      const customerMap: Record<string, CustomerRecord> = {};

      savedCustomers.forEach(c => {
        const key = c.phone || c.id;
        customerMap[key] = c;
      });

      // 2. 从咨询单历史中同步未保存的顾客（向前兼容/补全逻辑）
      const consultationHistory = wx.getStorageSync('consultationHistory') || {};
      let hasNewCustomer = false;

      Object.keys(consultationHistory).forEach(date => {
        const records = consultationHistory[date] as any[];
        records.forEach((record: any) => {
          if (record.isVoided) return;

          const phone = record.phone || '';
          const name = record.surname || '';
          const customerKey = phone || record.id;

          if (!customerMap[customerKey]) {
            const newCustomer: Omit<CustomerRecord, 'id' | 'createdAt' | 'updatedAt'> = {
              phone,
              name,
              responsibleTechnician: '',
              licensePlate: '',
              remarks: '',
              totalAmount: 0
            };
            const inserted = db.insert<CustomerRecord>(Collections.CUSTOMERS, newCustomer);
            if (inserted) {
              customerMap[customerKey] = inserted;
              hasNewCustomer = true;
            }
          }
        });
      });

      const customerList = Object.values(customerMap).sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      this.setData({customerList});
    } catch (error) {
      console.error('加载顾客列表失败:', error);
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
      formResponsibleTechnician: '',
      formLicensePlate: '',
      formRemarks: ''
    });
  },

  showEditCustomer(e: any) {
    const customer = e.currentTarget.dataset.customer as CustomerRecord;
    this.setData({
      showEditModal: true,
      modalTitle: '编辑顾客',
      editCustomer: customer,
      formPhone: customer.phone,
      formName: customer.name,
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
      formResponsibleTechnician: '',
      formLicensePlate: '',
      formRemarks: ''
    });
  },

  onModalConfirm() {
    const {editCustomer, formPhone, formName, formResponsibleTechnician, formLicensePlate, formRemarks} = this.data;

    if (!formPhone && !formName) {
      wx.showToast({
        title: '请填写手机号或姓名',
        icon: 'none'
      });
      return;
    }

    try {
      if (editCustomer) {
        // 更新现有顾客
        db.updateById(Collections.CUSTOMERS, editCustomer.id, {
          phone: formPhone,
          name: formName,
          responsibleTechnician: formResponsibleTechnician,
          licensePlate: formLicensePlate,
          remarks: formRemarks
        });
      } else {
        // 新增顾客
        db.insert<CustomerRecord>(Collections.CUSTOMERS, {
          phone: formPhone,
          name: formName,
          responsibleTechnician: formResponsibleTechnician,
          licensePlate: formLicensePlate,
          remarks: formRemarks,
          totalAmount: 0
        });
      }

      this.setData({
        showEditModal: false,
        editCustomer: null,
        formPhone: '',
        formName: '',
        formResponsibleTechnician: '',
        formLicensePlate: '',
        formRemarks: ''
      });

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      this.loadCustomerList();
    } catch (error) {
      console.error('保存顾客信息失败:', error);
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      });
    }
  },

  onPhoneInput(e: any) {
    this.setData({formPhone: e.detail.value});
  },

  onNameInput(e: any) {
    this.setData({formName: e.detail.value});
  },

  onTechnicianSelect(e: any) {
    const technician = e.currentTarget.dataset.technician;
    this.setData({formResponsibleTechnician: technician});
  },

  onLicensePlateInput(e: any) {
    this.setData({formLicensePlate: e.detail.value});
  },

  onRemarksInput(e: any) {
    this.setData({formRemarks: e.detail.value});
  },

  loadCustomerVisits(e: any) {
    const customer = e.currentTarget.dataset.customer as CustomerRecord;
    const consultationHistory = wx.getStorageSync('consultationHistory') || {};
    const visitRecords: CustomerVisit[] = [];
    Object.keys(consultationHistory).forEach(date => {
      const records = consultationHistory[date] as any[];

      records.forEach((record: any) => {
        if (record.isVoided) {
          return;
        }

        const customerKey = record.phone || record.id;
        const targetKey = customer.phone || customer.id;

        if (customerKey === targetKey) {
          visitRecords.push({
            id: record.id,
            date,
            project: record.project,
            technician: record.technician,
            room: record.room,
            amount: record.amount,
            isClockIn: record.isClockIn,
          });
        }
      });
    });

    visitRecords.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    try {
      const memberships = db.find<CustomerMembership>(Collections.CUSTOMER_MEMBERSHIP, {
        customerId: customer.id
      });
      this.setData({
        selectedCustomer: customer,
        visitRecords,
        customerMemberships: memberships,
        showDetailModal: true
      });
    } catch (error) {
      console.error('加载顾客会员卡失败:', error);
      this.setData({
        selectedCustomer: customer,
        visitRecords,
        customerMemberships: [],
        showDetailModal: true
      });
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
      url: `/pages/history/history?customerPhone=${ selectedCustomer.phone }&customerId=${ selectedCustomer.phone || selectedCustomer.id }&readonly=true`
    });
  },

  loadMembershipCards() {
    try {
      const cards = db.getAll<MembershipCard>(Collections.MEMBERSHIP);
      const activeCards = cards.filter(card => card.status === 'active');
      this.setData({membershipCards: activeCards});
    } catch (error) {
      console.error('加载会员卡列表失败:', error);
      wx.showToast({
        title: '加载会员卡失败',
        icon: 'error'
      });
    }
  },

  showOpenCardModal(e: any) {
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

  onCardSelect(e: any) {
    const card = e.currentTarget.dataset.card as MembershipCard;
    this.setData({
      selectedCardId: card.id,
      selectedCardInfo: card
    });
  },

  onPaidAmountInput(e: any) {
    this.setData({formPaidAmount: e.detail.value});
  },

  onSalesStaffSelect(e: any) {
    const staff = e.currentTarget.dataset.staff;
    this.setData({formSalesStaff: staff});
  },

  onCardRemarksInput(e: any) {
    this.setData({formCardRemarks: e.detail.value});
  },

  onOpenCardConfirm() {
    const {selectedCustomerForCard, selectedCardInfo, formPaidAmount, formSalesStaff, formCardRemarks} = this.data;

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
      const now = new Date().toISOString();
      db.insert(Collections.CUSTOMER_MEMBERSHIP, {
        customerId: selectedCustomerForCard.id,
        customerName: selectedCustomerForCard.name,
        customerPhone: selectedCustomerForCard.phone,
        cardId: selectedCardInfo.id,
        cardName: selectedCardInfo.name,
        originalPrice: selectedCardInfo.originalPrice,
        paidAmount,
        remainingTimes: selectedCardInfo.remainingTimes,
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
        formCardRemarks: ''
      });

      wx.showToast({
        title: '开卡成功',
        icon: 'success'
      });
    } catch (error) {
      console.error('开卡失败:', error);
      wx.showToast({
        title: '开卡失败',
        icon: 'error'
      });
    }
  },

});
