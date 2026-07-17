import { cloudDb, Collections } from '../../utils/cloud-db';

interface FocusVersion {
  timestamp: string;
  urgency: number;
  importance: number;
  anxietyLevel: number;
  changeNote: string;
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
  versions: FocusVersion[];
}

interface FocusDisplay extends Focus {
  color: string;
  x: number;
  y: number;
}

const ANXIETY_COLORS: Record<number, string> = {
  1: '#A0C4D8',
  2: '#8BB0C4',
  3: '#F0C27A',
  4: '#E89F6E',
  5: '#F08A7E'
};

const QUADRANT_NAMES: Record<string, string> = {
  'q1': '紧急且重要',
  'q2': '重要不紧急',
  'q3': '不重要不紧急',
  'q4': '紧急不重要'
};

Page({
  canvas: null as any,
  ctx: null as any,
  canvasWidth: 0,
  canvasHeight: 0,
  canvasLeft: 0,
  canvasTop: 0,
  dpr: 1,

  data: {
    loading: false,
    activeFocuses: [] as FocusDisplay[],
    resolvedFocuses: [] as Focus[],
    showCapture: false,
    captureTitle: '',
    captureType: 'anxiety' as 'task' | 'anxiety',
    captureUrgency: 3,
    captureImportance: 3,
    captureAnxiety: 3,
    guideBubbleText: '',
    showBubbleList: false,
    bubbleQuadrantName: '',
    bubbleItems: [] as FocusDisplay[],
  },

  onLoad() {
    this.loadFocuses();
  },

  onShow() {
    if (this.ctx) {
      this.loadFocuses();
    }
  },

  async loadFocuses() {
    this.setData({ loading: true });
    try {
      const allFocuses = await cloudDb.find<Focus>(Collections.FOCUSES, {});
      const activeFocuses = allFocuses.filter(f => f.status === 'active');
      const resolvedFocuses = allFocuses.filter(f => f.status === 'resolved');

      const displayFocuses = activeFocuses.map(f => this.toDisplay(f));
      this.setData({
        activeFocuses: displayFocuses,
        resolvedFocuses
      });

      this.initCanvas();
    } catch (_e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  toDisplay(focus: Focus): FocusDisplay {
    const latest = focus.versions[focus.versions.length - 1];
    const color = ANXIETY_COLORS[latest.anxietyLevel] || ANXIETY_COLORS[3];
    return {
      ...focus,
      color,
      x: latest.urgency,
      y: latest.importance
    };
  },

  initCanvas() {
    const query = this.createSelectorQuery();
    query.select('#quadrantCanvas')
      .fields({ node: true, size: true, rect: true })
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
        this.canvasLeft = res[0].left || 0;
        this.canvasTop = res[0].top || 0;
        this.dpr = dpr;

        this.drawQuadrant();
      });
  },

  drawQuadrant() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    const padding = 30;
    const drawW = w - padding * 2;
    const drawH = h - padding * 2;
    const cx = padding + drawW / 2;
    const cy = padding + drawH / 2;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw quadrant backgrounds
    // Q1: right-top (urgent + important)
    ctx.fillStyle = 'rgba(255,200,180,0.15)';
    ctx.fillRect(cx, padding, drawW / 2, drawH / 2);
    // Q2: left-top (important, not urgent)
    ctx.fillStyle = 'rgba(180,220,210,0.15)';
    ctx.fillRect(padding, padding, drawW / 2, drawH / 2);
    // Q3: left-bottom (not important, not urgent)
    ctx.fillStyle = 'rgba(200,200,200,0.15)';
    ctx.fillRect(padding, cy, drawW / 2, drawH / 2);
    // Q4: right-bottom (urgent, not important)
    ctx.fillStyle = 'rgba(250,230,170,0.15)';
    ctx.fillRect(cx, cy, drawW / 2, drawH / 2);

    // Draw guardian stars (resolved focuses)
    const { resolvedFocuses } = this.data;
    resolvedFocuses.forEach(f => {
      const latest = f.versions[f.versions.length - 1];
      const sx = this.valueToX(latest.urgency, padding, drawW);
      const sy = this.valueToY(latest.importance, padding, drawH);
      this.drawStar(ctx, sx, sy, 3, 'rgba(255,215,0,0.4)');
    });

    // Draw axes
    ctx.strokeStyle = '#3A4A5C';
    ctx.lineWidth = 1;
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

    // Axis labels
    ctx.fillStyle = '#8B9CAF';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('紧急度 →', w - padding, cy + 14);
    ctx.textAlign = 'left';
    ctx.fillText('重要性 ↑', cx + 6, padding + 12);

    // Draw active focuses or aggregate bubbles
    const { activeFocuses } = this.data;
    const quadrants: Record<string, FocusDisplay[]> = { q1: [], q2: [], q3: [], q4: [] };

    activeFocuses.forEach(f => {
      const qKey = this.getQuadrantKey(f.x, f.y);
      quadrants[qKey].push(f);
    });

    Object.entries(quadrants).forEach(([qKey, items]) => {
      if (items.length === 0) return;
      if (items.length > 5) {
        // Draw aggregate bubble
        const bx = this.getQuadrantCenter(qKey, padding, drawW, drawH).x;
        const by = this.getQuadrantCenter(qKey, padding, drawW, drawH).y;
        const radius = 12 + items.length * 1;
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD166';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(items.length), bx, by);
      } else {
        items.forEach(f => {
          const fx = this.valueToX(f.x, padding, drawW);
          const fy = this.valueToY(f.y, padding, drawH);
          this.drawFocusIcon(ctx, fx, fy, f);
        });
      }
    });
  },

  valueToX(urgency: number, padding: number, drawW: number): number {
    // urgency 1-5 maps to left-right, center is 3
    return padding + ((urgency - 0.5) / 5) * drawW;
  },

  valueToY(importance: number, padding: number, drawH: number): number {
    // importance 1-5 maps to bottom-top, center is 3
    return padding + drawH - ((importance - 0.5) / 5) * drawH;
  },

  getQuadrantKey(urgency: number, importance: number): string {
    if (urgency >= 3 && importance >= 3) return 'q1';
    if (urgency < 3 && importance >= 3) return 'q2';
    if (urgency < 3 && importance < 3) return 'q3';
    return 'q4';
  },

  getQuadrantCenter(qKey: string, padding: number, drawW: number, drawH: number) {
    const cx = padding + drawW / 2;
    const cy = padding + drawH / 2;
    switch (qKey) {
      case 'q1': return { x: cx + drawW / 4, y: padding + drawH / 4 };
      case 'q2': return { x: padding + drawW / 4, y: padding + drawH / 4 };
      case 'q3': return { x: padding + drawW / 4, y: cy + drawH / 4 };
      case 'q4': return { x: cx + drawW / 4, y: cy + drawH / 4 };
      default: return { x: cx, y: cy };
    }
  },

  drawFocusIcon(ctx: any, x: number, y: number, focus: FocusDisplay) {
    const size = 9;
    ctx.fillStyle = focus.color;

    if (focus.type === 'task') {
      // Circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Diamond
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.fill();
    }

    // Ghost tail indicator for versioned focuses
    if (focus.versions.length > 1) {
      ctx.strokeStyle = '#FFD166';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + size - 2, y - size + 2, 4, -Math.PI * 0.3, Math.PI * 0.5);
      ctx.stroke();
    }
  },

  drawStar(ctx: any, x: number, y: number, radius: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  },

  onCanvasTap(e: WechatMiniprogram.TouchEvent) {
    // touchend: touches is empty, use changedTouches
    const touch = e.changedTouches?.[0] || e.touches?.[0];
    if (!touch) return;
    // Convert page coordinates to canvas-relative coordinates
    const x = touch.clientX - this.canvasLeft;
    const y = touch.clientY - this.canvasTop;
    const padding = 30;
    const drawW = this.canvasWidth - padding * 2;
    const drawH = this.canvasHeight - padding * 2;

    const { activeFocuses } = this.data;
    const quadrants: Record<string, FocusDisplay[]> = { q1: [], q2: [], q3: [], q4: [] };
    activeFocuses.forEach(f => {
      quadrants[this.getQuadrantKey(f.x, f.y)].push(f);
    });

    // Check aggregate bubble tap
    for (const [qKey, items] of Object.entries(quadrants)) {
			if (items.length > 5) {
				const center = this.getQuadrantCenter(qKey, padding, drawW, drawH);
        const dist = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
        if (dist < 20) {
          this.setData({
            showBubbleList: true,
            bubbleQuadrantName: QUADRANT_NAMES[qKey],
            bubbleItems: items
          });
          return;
        }
      } else {
				// Check individual focus tap
        for (const f of items) {
					const fx = this.valueToX(f.x, padding, drawW);
          const fy = this.valueToY(f.y, padding, drawH);
          const dist = Math.sqrt((x - fx) ** 2 + (y - fy) ** 2);
          if (dist < 15) {
            this.goDetail({ currentTarget: { dataset: { id: f._id } } } as any);
            return;
          }
        }
      }
    }
  },

  closeBubbleList() {
    this.setData({ showBubbleList: false, bubbleItems: [] });
  },

  goDetail(e: WechatMiniprogram.BaseEvent) {
		console.log('Go detail', e);
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/xinlun-detail/xinlun-detail?id=${id}` });
  },

  goMuseum() {
    wx.navigateTo({ url: '/pages/xinlun-museum/xinlun-museum' });
  },

  // --- Capture flow ---
  openCapture() {
    this.setData({
      showCapture: true,
      captureTitle: '',
      captureType: 'anxiety',
      captureUrgency: 3,
      captureImportance: 3,
      captureAnxiety: 3,
      guideBubbleText: ''
    });
  },

  onCaptureClose() {
    this.setData({ showCapture: false });
  },

  onCaptureInput(e: WechatMiniprogram.Input) {
    this.setData({ captureTitle: e.detail.value });
  },

  setCaptureType(e: WechatMiniprogram.BaseEvent) {
    this.setData({ captureType: e.currentTarget.dataset.type });
  },

  onUrgencyChange(e: WechatMiniprogram.SliderChange) {
    this.setData({ captureUrgency: e.detail.value });
    this.updateGuideBubble();
  },

  onImportanceChange(e: WechatMiniprogram.SliderChange) {
    this.setData({ captureImportance: e.detail.value });
    this.updateGuideBubble();
  },

  onAnxietyChange(e: WechatMiniprogram.SliderChange) {
    this.setData({ captureAnxiety: e.detail.value });
  },

  updateGuideBubble() {
    const { captureUrgency: u, captureImportance: i } = this.data;
    let text = '';
    if (u <= 2 && i <= 2) {
      text = '放下这个担忧，会为你此刻的身心腾出多少空间？';
    } else if (u >= 4 && i <= 2) {
      text = '这件事如果拒绝或交给别人，最坏的结果是什么？';
    } else if (u <= 2 && i >= 4) {
      text = '能让这件事推进的最小一步是什么？';
    } else if (u >= 4 && i >= 4) {
      text = '深呼吸，专注完成它。完成后记得来庆祝。';
    }
    this.setData({ guideBubbleText: text });
  },

  async confirmCapture() {
    const { captureTitle, captureType, captureUrgency, captureImportance, captureAnxiety } = this.data;
    if (!captureTitle.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }

    const now = new Date().toISOString();
    const newFocus = {
      title: captureTitle.trim(),
      type: captureType,
      status: 'active',
      createdTime: now,
      versions: [{
        timestamp: now,
        urgency: captureUrgency,
        importance: captureImportance,
        anxietyLevel: captureAnxiety,
        changeNote: ''
      }]
    };

    try {
      await cloudDb.insert(Collections.FOCUSES, newFocus as any);
      wx.showToast({ title: '已添加', icon: 'success' });
      this.setData({ showCapture: false });
      this.loadFocuses();
    } catch (_e) {
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  }
});
