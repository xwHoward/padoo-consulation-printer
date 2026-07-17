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

Page({
  canvas: null as any,
  ctx: null as any,
  canvasWidth: 0,
  canvasHeight: 0,

  data: {
    focus: {} as Focus,
    selectedIndex: 0,
    selectedVersion: null as FocusVersion | null,
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

      this.initEvolutionCanvas();
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

  initEvolutionCanvas() {
    const query = this.createSelectorQuery();
    query.select('#evolutionCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvasNode = res[0].node;
        const ctx = canvasNode.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio;
        const width = res[0].width;
        const height = res[0].height;

        canvasNode.width = width * dpr;
        canvasNode.height = height * dpr;
        ctx.scale(dpr, dpr);

        this.canvas = canvasNode;
        this.ctx = ctx;
        this.canvasWidth = width;
        this.canvasHeight = height;

        this.drawEvolution();
      });
  },

  drawEvolution() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    const { focus, selectedIndex } = this.data;
    const versions = focus.versions;
    if (!versions || versions.length === 0) return;

    const padding = 20;
    const drawW = w - padding * 2;
    const drawH = h - padding * 2;
    const cx = padding + drawW / 2;
    const cy = padding + drawH / 2;

    ctx.clearRect(0, 0, w, h);

    // Draw faint quadrant grid
    ctx.strokeStyle = '#E5E9F0';
    ctx.lineWidth = 0.5;
    // X axis
    ctx.beginPath();
    ctx.moveTo(padding, cy);
    ctx.lineTo(w - padding, cy);
    ctx.stroke();
    // Y axis
    ctx.beginPath();
    ctx.moveTo(cx, padding);
    ctx.lineTo(cx, h - padding);
    ctx.stroke();

    // Draw trajectory path
    if (versions.length > 1) {
      ctx.strokeStyle = '#FFD166';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < versions.length; i++) {
        const vx = this.vToX(versions[i].urgency, padding, drawW);
        const vy = this.vToY(versions[i].importance, padding, drawH);
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }

    // Draw version nodes
    versions.forEach((v, i) => {
      const vx = this.vToX(v.urgency, padding, drawW);
      const vy = this.vToY(v.importance, padding, drawH);
      const isSelected = i === selectedIndex;

      ctx.beginPath();
      ctx.arc(vx, vy, isSelected ? 6 : 4, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#FFD166';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#FFD166';
        ctx.fill();
      }
    });
  },

  vToX(urgency: number, padding: number, drawW: number): number {
    return padding + ((urgency - 0.5) / 5) * drawW;
  },

  vToY(importance: number, padding: number, drawH: number): number {
    return padding + drawH - ((importance - 0.5) / 5) * drawH;
  },

  selectVersion(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index;
    const { focus } = this.data;
    this.setData({
      selectedIndex: index,
      selectedVersion: focus.versions[index]
    });
    this.drawEvolution();
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

      this.drawEvolution();
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
