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

interface FocusNode {
  _id: string;
  title: string;
  type: string;
  color: string;
  leftPct: number;
  bottomPct: number;
  hasHistory: boolean;
}

interface BubbleNode {
  qKey: string;
  count: number;
  leftPct: number;
  bottomPct: number;
}

interface StarNode {
  id: string;
  leftPct: number;
  bottomPct: number;
  rotate: number;
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

/** 象限几何中心（百分比） */
const QUADRANT_CENTERS: Record<string, { left: number; bottom: number }> = {
  'q1': { left: 75, bottom: 75 },
  'q2': { left: 25, bottom: 75 },
  'q3': { left: 25, bottom: 25 },
  'q4': { left: 75, bottom: 25 }
};

function urgencyToLeftPct(urgency: number): number {
  return ((urgency - 0.5) / 5) * 100;
}

function importanceToBottomPct(importance: number): number {
  return ((importance - 0.5) / 5) * 100;
}

function getQuadrantKey(urgency: number, importance: number): string {
  if (urgency >= 3 && importance >= 3) return 'q1';
  if (urgency < 3 && importance >= 3) return 'q2';
  if (urgency < 3 && importance < 3) return 'q3';
  return 'q4';
}

Page({
  data: {
    loading: false,
    activeCount: 0,
    focusNodes: [] as FocusNode[],
    aggregateBubbles: [] as BubbleNode[],
    guardianStars: [] as StarNode[],
    showCapture: false,
    captureTitle: '',
    captureType: 'anxiety' as 'task' | 'anxiety',
    captureUrgency: 3,
    captureImportance: 3,
    captureAnxiety: 3,
    guideBubbleText: '',
    showBubbleList: false,
    bubbleQuadrantName: '',
    bubbleItems: [] as FocusNode[],
  },

  /** 按象限缓存的焦点列表，用于聚合气泡展开 */
  quadrantGroups: {} as Record<string, FocusNode[]>,

  onLoad() {
    this.loadFocuses();
  },

  onShow() {
    if (this.data.activeCount > 0 || this.data.guardianStars.length > 0) {
      this.loadFocuses();
    }
  },

  async loadFocuses() {
    this.setData({ loading: true });
    try {
      const allFocuses = await cloudDb.find<Focus>(Collections.FOCUSES, {});
      const activeFocuses = allFocuses.filter(f => f.status === 'active');
      const resolvedFocuses = allFocuses.filter(f => f.status === 'resolved');

      // 守护星
      const guardianStars: StarNode[] = resolvedFocuses.map((f, i) => {
        const latest = f.versions[f.versions.length - 1];
        return {
          id: f._id,
          leftPct: urgencyToLeftPct(latest.urgency),
          bottomPct: importanceToBottomPct(latest.importance),
          rotate: (i * 37) % 30 - 15
        };
      });

      // 按象限分组
      const groups: Record<string, FocusNode[]> = { q1: [], q2: [], q3: [], q4: [] };
      activeFocuses.forEach(f => {
        const latest = f.versions[f.versions.length - 1];
        const node: FocusNode = {
          _id: f._id,
          title: f.title,
          type: f.type,
          color: ANXIETY_COLORS[latest.anxietyLevel] || ANXIETY_COLORS[3],
          leftPct: urgencyToLeftPct(latest.urgency),
          bottomPct: importanceToBottomPct(latest.importance),
          hasHistory: f.versions.length > 1
        };
        groups[getQuadrantKey(latest.urgency, latest.importance)].push(node);
      });
      this.quadrantGroups = groups;

      // 超过5个的象限聚合为气泡，其余直接展示
      const focusNodes: FocusNode[] = [];
      const aggregateBubbles: BubbleNode[] = [];
      Object.entries(groups).forEach(([qKey, items]) => {
        if (items.length === 0) return;
        if (items.length > 5) {
          const center = QUADRANT_CENTERS[qKey];
          aggregateBubbles.push({
            qKey,
            count: items.length,
            leftPct: center.left,
            bottomPct: center.bottom
          });
        } else {
          focusNodes.push(...items);
        }
      });

      this.setData({
        activeCount: activeFocuses.length,
        focusNodes,
        aggregateBubbles,
        guardianStars
      });
    } catch (_e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // --- 象限图交互 ---
  onTapFocus(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/xinlun-detail/xinlun-detail?id=${id}` });
  },

  onTapBubble(e: WechatMiniprogram.BaseEvent) {
    const qKey = e.currentTarget.dataset.qkey;
    this.setData({
      showBubbleList: true,
      bubbleQuadrantName: QUADRANT_NAMES[qKey] || '',
      bubbleItems: this.quadrantGroups[qKey] || []
    });
  },

  closeBubbleList() {
    this.setData({ showBubbleList: false, bubbleItems: [] });
  },

  goMuseum() {
    wx.navigateTo({ url: '/pages/xinlun-museum/xinlun-museum' });
  },

  // --- 捕捉流程 ---
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
