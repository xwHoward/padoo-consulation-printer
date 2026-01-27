import {db, Collections} from "../../utils/db";
import {formatTime} from "../../utils/util";
import {PROJECTS} from "../../utils/constants";

Page({
  data: {
    cardList: [] as MembershipCard[],
    showEditModal: false,
    modalTitle: '',
    editCard: null as MembershipCard | null,
    formName: '',
    formOriginalPrice: '',
    formRemainingTimes: '',
    formProject: PROJECTS[1],
    projects: PROJECTS
  },

  onLoad() {
    this.loadCardList();
  },

  onShow() {
    this.loadCardList();
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
    this.setData({
      showEditModal: true,
      modalTitle: '新增会员卡',
      editCard: null,
      formName: '',
      formOriginalPrice: '',
      formRemainingTimes: '',
      formProject: PROJECTS[1]
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
      formRemainingTimes: card.totalTimes.toString(),
      formProject: card.project
    });
  },

  onModalCancel() {
    this.setData({
      showEditModal: false,
      editCard: null,
      formName: '',
      formOriginalPrice: '',
      formRemainingTimes: '',
      formProject: PROJECTS[1]
    });
  },

  onModalConfirm() {
    const {formName, formOriginalPrice, formRemainingTimes, formProject, editCard} = this.data;

    if (!formName.trim()) {
      wx.showToast({title: '请输入会员卡名称', icon: 'none'});
      return;
    }
    if (!formOriginalPrice.trim()) {
      wx.showToast({title: '请输入原价', icon: 'none'});
      return;
    }
    if (!formRemainingTimes.trim()) {
      wx.showToast({title: '请输入次数', icon: 'none'});
      return;
    }
    if (!formProject) {
      wx.showToast({title: '请选择项目', icon: 'none'});
      return;
    }

    const originalPrice = parseFloat(formOriginalPrice);
    const totalTimes = parseInt(formRemainingTimes);

    if (isNaN(originalPrice) || originalPrice <= 0) {
      wx.showToast({title: '原价必须大于0', icon: 'none'});
      return;
    }
    if (isNaN(totalTimes) || totalTimes <= 0) {
      wx.showToast({title: '次数必须大于0', icon: 'none'});
      return;
    }

    try {
      const now = new Date().toISOString();

      if (editCard) {
        db.updateById<MembershipCard>(Collections.MEMBERSHIP, editCard.id, {
          name: formName,
          originalPrice,
          totalTimes,
          project: formProject
        });
        wx.showToast({title: '修改成功', icon: 'success'});
      } else {
        db.insert<MembershipCard>(Collections.MEMBERSHIP, {
          name: formName,
          originalPrice,
          totalTimes,
          project: formProject,
          status: 'active'
        });
        wx.showToast({title: '新增成功', icon: 'success'});
      }

      this.loadCardList();
      this.onModalCancel();
    } catch (error) {
      console.error('保存会员卡失败:', error);
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      });
    }
  },

  toggleCardStatus(e: any) {
    const card = e.currentTarget.dataset.card as MembershipCard;
    const newStatus = card.status === 'active' ? 'disabled' : 'active';

    wx.showModal({
      title: '确认操作',
      content: newStatus === 'disabled' ? '确定要禁用该会员卡吗？' : '确定要启用该会员卡吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            db.updateById<MembershipCard>(Collections.MEMBERSHIP, card.id, {
              status: newStatus
            });
            this.loadCardList();
            wx.showToast({title: '操作成功', icon: 'success'});
          } catch (error) {
            console.error('更新会员卡状态失败:', error);
            wx.showToast({title: '操作失败', icon: 'error'});
          }
        }
      }
    });
  },

  deleteCard(e: any) {
    const card = e.currentTarget.dataset.card as MembershipCard;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除该会员卡吗？删除后不可恢复。',
      success: (res) => {
        if (res.confirm) {
          try {
            db.deleteById(Collections.MEMBERSHIP, card.id);
            this.loadCardList();
            wx.showToast({title: '删除成功', icon: 'success'});
          } catch (error) {
            console.error('删除会员卡失败:', error);
            wx.showToast({title: '删除失败', icon: 'error'});
          }
        }
      }
    });
  },

  onNameInput(e: any) {
    this.setData({formName: e.detail.value});
  },

  onOriginalPriceInput(e: any) {
    this.setData({formOriginalPrice: e.detail.value});
  },

  onRemainingTimesInput(e: any) {
    this.setData({formRemainingTimes: e.detail.value});
  },

  onProjectSelect(e: any) {
    this.setData({formProject: e.detail.project});
  }
});
