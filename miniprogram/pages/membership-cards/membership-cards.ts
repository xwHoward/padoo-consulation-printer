import { cloudDb, Collections } from '../../utils/cloud-db';

Page({
  data: {
    loading: false,
    cardList: [] as MembershipCard[],
    showEditModal: false,
    modalTitle: '',
    editCard: null as MembershipCard | null,
    formName: '',
    formType: 'times' as 'times' | 'value',
    formOriginalPrice: '',
    formTotalTimes: '',
    formBalance: '',
    formProject: '',
    projects: [] as Project[]
  },

  async onLoad() {
    await Promise.all([this.loadCardList(), this.loadProjects()]);
  },

  onShow() {
    this.loadCardList();
  },

  async loadProjects() {
    try {
      const app = getApp<IAppOption>();
      const allProjects = await app.getProjects();
      const defaultProject = allProjects.length > 1 ? allProjects[1].name : '';
      this.setData({
        projects: allProjects,
        formProject: defaultProject
      });
    } catch (error) {
      console.error('加载项目失败:', error);
      this.setData({ projects: [] });
    }
  },

  async loadCardList() {
    try {
      this.setData({ loading: true });
      const cards = await cloudDb.getAll<MembershipCard>(Collections.MEMBERSHIP);
      this.setData({ cardList: cards, loading: false });
    } catch (error) {
      console.error('加载会员卡列表失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  showAddCard() {
    const defaultProject = this.data.projects.length > 1 ? this.data.projects[1].name : '';
    this.setData({
      showEditModal: true,
      modalTitle: '新增会员卡',
      editCard: null,
      formName: '',
      formType: 'times',
      formOriginalPrice: '',
      formTotalTimes: '',
      formBalance: '',
      formProject: defaultProject
    });
  },

  showEditCard(e: WechatMiniprogram.CustomEvent) {
    const card = e.currentTarget.dataset.card as MembershipCard;
    this.setData({
      showEditModal: true,
      modalTitle: '编辑会员卡',
      editCard: card,
      formName: card.name,
      formType: card.type,
      formOriginalPrice: card.originalPrice ? card.originalPrice.toString() : '',
      formTotalTimes: card.totalTimes ? card.totalTimes.toString() : '',
      formBalance: card.balance ? card.balance.toString() : '',
      formProject: card.project || ''
    });
  },

  onModalCancel() {
    const defaultProject = this.data.projects.length > 1 ? this.data.projects[1].name : '';
    this.setData({
      showEditModal: false,
      editCard: null,
      formName: '',
      formType: 'times',
      formOriginalPrice: '',
      formTotalTimes: '',
      formBalance: '',
      formProject: defaultProject
    });
  },

  onTypeSelect(e: WechatMiniprogram.CustomEvent) {
    const type = e.currentTarget.dataset.type as 'times' | 'value';
    this.setData({
      formType: type,
      formTotalTimes: '',
      formBalance: ''
    });
  },

  onNameInput(e: WechatMiniprogram.Input) {
    this.setData({ formName: e.detail.value });
  },

  onOriginalPriceInput(e: WechatMiniprogram.Input) {
    this.setData({ formOriginalPrice: e.detail.value });
  },

  onTotalTimesInput(e: WechatMiniprogram.Input) {
    const updates: any = { formTotalTimes: e.detail.value };
    if (this.data.formProject) {
      updates.formName = `${e.detail.value}次卡·${this.data.formProject}`;
    }
    this.setData(updates);
  },

  onBalanceInput(e: WechatMiniprogram.Input) {
    this.setData({ formBalance: e.detail.value });
  },

  onProjectSelect(e: WechatMiniprogram.CustomEvent) {
    const updates: any = { formProject: e.detail.project };
    if (this.data.formTotalTimes) {
      updates.formName = `${this.data.formTotalTimes}次卡·${this.data.formProject}`;
    }
    this.setData(updates);
  },

  async onModalConfirm() {
    const { formName, formType, formOriginalPrice, formTotalTimes, formBalance, formProject, editCard } = this.data;

    if (!formName.trim()) {
      wx.showToast({ title: '请输入会员卡名称', icon: 'none' });
      return;
    }

    let cardData: Update<MembershipCard> = {
      name: formName,
      type: formType,
      status: 'active'
    };

    if (formType === 'times') {
      const originalPrice = parseFloat(formOriginalPrice);
      if (isNaN(originalPrice) || originalPrice <= 0) {
        wx.showToast({ title: '请输入有效的原价', icon: 'none' });
        return;
      }
      cardData.originalPrice = originalPrice;

      const totalTimes = parseInt(formTotalTimes);
      if (isNaN(totalTimes) || totalTimes <= 0) {
        wx.showToast({ title: '请输入有效的次数', icon: 'none' });
        return;
      }
      cardData.totalTimes = totalTimes;

      if (!formProject.trim()) {
        wx.showToast({ title: '请选择关联项目', icon: 'none' });
        return;
      }
      cardData.project = formProject;
    } else {
      const balance = parseFloat(formBalance);
      if (isNaN(balance) || balance < 0) {
        wx.showToast({ title: '请输入有效的储值金额', icon: 'none' });
        return;
      }
      cardData.balance = balance;
    }

    try {
      this.setData({ loading: true });
      if (editCard) {
        const success = await cloudDb.updateById<MembershipCard>(Collections.MEMBERSHIP, editCard.id, cardData);
        if (success) {
          wx.showToast({ title: '更新成功', icon: 'success' });
          await this.loadCardList();
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '更新失败', icon: 'none' });
        }
      } else {
        const result = await cloudDb.insert<MembershipCard>(Collections.MEMBERSHIP, cardData);
        if (result) {
          wx.showToast({ title: '添加成功', icon: 'success' });
          await this.loadCardList();
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: '添加失败', icon: 'none' });
        }
      }
      this.onModalCancel();
    } catch (error) {
      console.error('保存会员卡失败:', error);
      this.setData({ loading: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async toggleCardStatus(e: WechatMiniprogram.CustomEvent) {
    const card = e.currentTarget.dataset.card as MembershipCard;
    const newStatus = card.status === 'active' ? 'disabled' : 'active';

    try {
      this.setData({ loading: true });
      const success = await cloudDb.updateById<MembershipCard>(Collections.MEMBERSHIP, card.id, {
        status: newStatus
      });
      if (success) {
        wx.showToast({
          title: newStatus === 'active' ? '已启用' : '已禁用',
          icon: 'success'
        });
        await this.loadCardList();
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    } catch (error) {
      console.error('切换会员卡状态失败:', error);
      this.setData({ loading: false });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async onDeleteCard(e: WechatMiniprogram.CustomEvent) {
    const card = e.currentTarget.dataset.card as MembershipCard;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除会员卡"${card.name}"吗？`,
      confirmText: '删除',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          try {
            this.setData({ loading: true });
            const success = await cloudDb.deleteById(Collections.MEMBERSHIP, card.id);
            if (success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadCardList();
            } else {
              this.setData({ loading: false });
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          } catch (error) {
            console.error('删除会员卡失败:', error);
            this.setData({ loading: false });
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
