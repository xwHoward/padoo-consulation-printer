import { cloudDb, Collections } from '../../utils/cloud-db';

interface FocusVersion {
  timestamp: string;
  urgency: number;
  importance: number;
  anxietyLevel: number;
  changeNote: string;
  displayTime?: string;
}

interface Focus {
  _id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  type: 'task' | 'anxiety';
  status: 'active' | 'resolved';
  createdTime: string;
  resolvedTime?: string;
  resolvedTimeDisplay?: string;
  versions: FocusVersion[];
}

interface EvolutionNode {
  leftPct: number;
  bottomPct: number;
}

interface EvolutionSegment {
  midLeftPct: number;
  midBottomPct: number;
  lengthPct: number;
  angleDeg: number;
}

Page({
  data: {
    focus: {} as Focus,
    selectedIndex: 0,
    selectedVersion: null as FocusVersion | null,
    evolutionNodes: [] as EvolutionNode[],
    evolutionSegments: [] as EvolutionSegment[],
    editing: false,
    editUrgency: 3,
    editImportance: 3,
    editAnxiety: 3,
    editNote: '',
    showResolveModal: false,
    showDeleteModal: false,
  },

  onLoad(options: Record<string, string>) {
    const id = options.id;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.loadFocus(id);
  },

  async loadFocus(id: string) {
    try {
      const focus = await cloudDb.findById<Focus>(Collections.FOCUSES, id);
      if (!focus) {
        wx.showToast({ title: '焦点不存在', icon: 'none' });
        wx.navigateBack();
        return;
      }

      // Format version display times
      focus.versions = focus.versions.map(v => ({
        ...v,
        displayTime: this.formatTime(v.timestamp)
      }));

      if (focus.resolvedTime) {
        focus.resolvedTimeDisplay = this.formatTime(focus.resolvedTime);
      }

      const lastIndex = focus.versions.length - 1;
      this.setData({
        focus,
        selectedIndex: lastIndex,
        selectedVersion: focus.versions[lastIndex]
      });

      this.buildEvolution(focus.versions);
    } catch (_e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  formatTime(isoStr: string): string {
    const d = new Date(isoStr);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${min}`;
  },

  /**
   * 根据版本列表计算演化图的节点坐标与轨迹线段
   */
  buildEvolution(versions: FocusVersion[]) {
    const round = (n: number) => Math.round(n * 100) / 100;
    const nodes: EvolutionNode[] = versions.map(v => ({
      leftPct: round(((v.urgency - 0.5) / 5) * 100),
      bottomPct: round(((v.importance - 0.5) / 5) * 100)
    }));

    const segments: EvolutionSegment[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const dx = b.leftPct - a.leftPct;
      const dy = b.bottomPct - a.bottomPct;
      segments.push({
        midLeftPct: round((a.leftPct + b.leftPct) / 2),
        midBottomPct: round((a.bottomPct + b.bottomPct) / 2),
        lengthPct: round(Math.sqrt(dx * dx + dy * dy)),
        angleDeg: round(Math.atan2(-dy, dx) * 180 / Math.PI)
      });
    }

    this.setData({ evolutionNodes: nodes, evolutionSegments: segments });
  },

  selectVersion(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index;
    const { focus } = this.data;
    this.setData({
      selectedIndex: index,
      selectedVersion: focus.versions[index]
    });
  },

  // --- Edit flow ---
  startEdit() {
    const { selectedVersion } = this.data;
    if (!selectedVersion) return;
    this.setData({
      editing: true,
      editUrgency: selectedVersion.urgency,
      editImportance: selectedVersion.importance,
      editAnxiety: selectedVersion.anxietyLevel,
      editNote: ''
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  onEditUrgency(e: WechatMiniprogram.SliderChange) {
    this.setData({ editUrgency: e.detail.value });
  },

  onEditImportance(e: WechatMiniprogram.SliderChange) {
    this.setData({ editImportance: e.detail.value });
  },

  onEditAnxiety(e: WechatMiniprogram.SliderChange) {
    this.setData({ editAnxiety: e.detail.value });
  },

  onEditNote(e: WechatMiniprogram.Input) {
    this.setData({ editNote: e.detail.value });
  },

  async confirmEdit() {
    const { focus, editUrgency, editImportance, editAnxiety, editNote } = this.data;
    const now = new Date().toISOString();

    const newVersion: FocusVersion = {
      timestamp: now,
      urgency: editUrgency,
      importance: editImportance,
      anxietyLevel: editAnxiety,
      changeNote: editNote,
      displayTime: this.formatTime(now)
    };

    const updatedVersions = [...focus.versions, newVersion];

    try {
      await cloudDb.updateById(Collections.FOCUSES, focus._id, {
        versions: updatedVersions
      } as any);

      const updatedFocus = { ...focus, versions: updatedVersions };
      const lastIndex = updatedVersions.length - 1;

      this.setData({
        focus: updatedFocus,
        editing: false,
        selectedIndex: lastIndex,
        selectedVersion: updatedVersions[lastIndex]
      });

      this.buildEvolution(updatedVersions);
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (_e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // --- Resolve flow ---
  resolveFocus() {
    this.setData({ showResolveModal: true });
  },

  cancelResolve() {
    this.setData({ showResolveModal: false });
  },

  async confirmResolve() {
    const { focus } = this.data;
    const now = new Date().toISOString();

    try {
      await cloudDb.updateById(Collections.FOCUSES, focus._id, {
        status: 'resolved',
        resolvedTime: now
      } as any);

      wx.vibrateShort({ type: 'medium' });
      wx.showToast({ title: '已化解 ✨', icon: 'none' });

      this.setData({ showResolveModal: false });

      setTimeout(() => {
        wx.navigateBack();
      }, 1200);
    } catch (_e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // --- Delete flow ---
  deleteFocus() {
    this.setData({ showDeleteModal: true });
  },

  cancelDelete() {
    this.setData({ showDeleteModal: false });
  },

  async confirmDelete() {
    const { focus } = this.data;
    try {
      await cloudDb.deleteById(Collections.FOCUSES, focus._id);
      wx.showToast({ title: '已删除', icon: 'success' });
      this.setData({ showDeleteModal: false });
      setTimeout(() => {
        wx.navigateBack();
      }, 800);
    } catch (_e) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  }
});
