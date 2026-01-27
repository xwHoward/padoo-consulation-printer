import {db, Collections} from "../../utils/db";
import {AppConfig} from '../../config/index';

Page({
  data: {
    cardList: [] as MembershipCard[],
    showEditModal: false,
    modalTitle: '',
    editCard: null as MembershipCard | null,
    formName: '',
    formOriginalPrice: '',
    formTotalTimes: '',
    formProject: '',
    projects: [] as AppProject[]
  },

  onLoad() {
    this.loadCardList();
    this.loadProjects();
  },

  onShow() {
    this.loadCardList();
  },

  loadProjects() {
    try {
      const app = getApp<IAppOption>();
      let allProjects = [];

      if (AppConfig.useCloudDatabase && app.getProjects) {
        allProjects = app.getProjects();
      } else {
        const {PROJECTS} = require('../../utils/constants');
        allProjects = PROJECTS;
      }

      const defaultProject = allProjects.length > 1 ? allProjects[1].name : '';
      this.setData({
        projects: allProjects,
        formProject: defaultProject
      });
    } catch (error) {
      console.error('加载项目失败:', error);
      this.setData({projects: []});
    }
  },

  loadCardList() {
    try {
      const cards = db.getAll<MembershipCard>(Collections.MEMBERSHIP);
      this.setData({cardList: cards});
    } catch (error) {
      console.error('加载会员卡列表失败:', error);
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
      formOriginalPrice: '',
      formTotalTimes: '',
      formProject: defaultProject
    });
  },

  showEditCard(e: any) {
    const card = e.currentTarget.dataset.card as MembershipCard;
    this.setData({
      showEditModal: true,
      modalTitle: '编辑会员卡',
      editCard: card,
      formName: card.name,
      formOriginalPrice: card.originalPrice.toString(),
      formTotalTimes: card.totalTimes.toString(),
      formProject: card.project
    });
  },

  onModalCancel() {
    const defaultProject = this.data.projects.length > 1 ? this.data.projects[1].name : '';
    this.setData({
      showEditModal: false,
      editCard: null,
      formName: '',
      formOriginalPrice: '',
      formTotalTimes: '',
      formProject: defaultProject
    });
  },

  onModalConfirm() {
    const {formName, formOriginalPrice, formTotalTimes, formProject, editCard} = this.data;

    if (!formName.trim()) {
      wx.showToast({title: '请输入会员卡名称', icon: 'none'});
      return;
    }

    const originalPrice = parseFloat(formOriginalPrice);
    if (isNaN(originalPrice) || originalPrice <= 0) {
      wx.showToast({title: '请输入有效的原价', icon: 'none'});
      return;
    }

    const totalTimes = parseInt(formTotalTimes);
    if (isNaN(totalTimes) || totalTimes <= 0) {
      wx.showToast({title: '请输入有效的次数', icon: 'none'});
      return;
    }

    if (!formProject.trim()) {
      wx.showToast({title: '请选择关联项目', icon: 'none'});
      return;
    }

    const cardData: Omit<MembershipCard, 'id' | 'createdAt' | 'updatedAt'> = {
      name: formName,
      originalPrice,
      totalTimes,
      project: formProject,
      status: 'active'
    };

    try {
      if (editCard) {
        const success = db.updateById<MembershipCard>(Collections.MEMBERSHIP, editCard.id, cardData);
        if (success) {
          wx.showToast({title: '更新成功', icon: 'success'});
          this.loadCardList();
        } else {
          wx.showToast({title: '更新失败', icon: 'none'});
        }
      } else {
        const success = db.insert<MembershipCard>(Collections.MEMBERSHIP, cardData);
        if (success) {
          wx.showToast({title: '添加成功', icon: 'success'});
          this.loadCardList();
        } else {
          wx.showToast({title: '添加失败', icon: 'none'});
        }
      }
      this.onModalCancel();
    } catch (error) {
      console.error('保存会员卡失败:', error);
      wx.showToast({title: '保存失败', icon: 'none'});
    }
  },

  onDeleteCard(e: any) {
    const card = e.currentTarget.dataset.card as MembershipCard;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除会员卡"${ card.name }"吗？`,
      confirmText: '删除',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          try {
            const success = db.deleteById(Collections.MEMBERSHIP, card.id);
            if (success) {
              wx.showToast({title: '删除成功', icon: 'success'});
              this.loadCardList();
            } else {
              wx.showToast({title: '删除失败', icon: 'none'});
            }
          } catch (error) {
            console.error('删除会员卡失败:', error);
            wx.showToast({title: '删除失败', icon: 'none'});
          }
        }
      }
    });
  }
});
