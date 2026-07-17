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

interface Badge {
  label: string;
  bg: string;
  color: string;
}

interface MuseumItem extends Focus {
  resolvedDateDisplay: string;
  badges: Badge[];
  dotLeft: number;
  dotBottom: number;
}

Page({
  data: {
    loading: false,
    refreshing: false,
    resolvedFocuses: [] as MuseumItem[],
  },

  onLoad() {
    this.loadResolved();
  },

  onShow() {
    this.loadResolved();
  },

  async onRefresh() {
    this.setData({ refreshing: true });
    await this.loadResolved();
    this.setData({ refreshing: false });
  },

  async loadResolved() {
    this.setData({ loading: true });
    try {
      const allFocuses = await cloudDb.find<Focus>(Collections.FOCUSES, { status: 'resolved' });

      // Sort by resolvedTime descending
      allFocuses.sort((a, b) => {
        const ta = a.resolvedTime || a.createdTime;
        const tb = b.resolvedTime || b.createdTime;
        return new Date(tb).getTime() - new Date(ta).getTime();
      });

      const museumItems: MuseumItem[] = allFocuses.map(f => {
        const latest = f.versions[f.versions.length - 1];
        return {
          ...f,
          resolvedDateDisplay: this.formatDate(f.resolvedTime || f.createdTime),
          badges: this.generateBadges(f),
          dotLeft: ((latest.urgency - 1) / 4) * 100,
          dotBottom: ((latest.importance - 1) / 4) * 100,
        };
      });

      this.setData({ resolvedFocuses: museumItems });
    } catch (_e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatDate(isoStr: string): string {
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  },

  generateBadges(focus: Focus): Badge[] {
    const badges: Badge[] = [];
    const versions = focus.versions;
    const latest = versions[versions.length - 1];
    const first = versions[0];

    // "风暴平息者" - anxiety went from high(>=4) to low(<=2)
    if (first.anxietyLevel >= 4 && latest.anxietyLevel <= 2) {
      badges.push({ label: '风暴平息者', bg: 'rgba(160,196,216,0.2)', color: '#5B8FA8' });
    }

    // "边界守护者" - was urgent+not important, successfully offloaded
    if (first.urgency >= 4 && first.importance <= 2) {
      badges.push({ label: '边界守护者', bg: 'rgba(240,194,122,0.2)', color: '#B8860B' });
    }

    // "远见家" - important+not urgent focus completed
    if (first.importance >= 4 && first.urgency <= 2) {
      badges.push({ label: '远见家', bg: 'rgba(180,220,210,0.3)', color: '#2E8B57' });
    }

    // "卸载达人" - not urgent + not important, quickly resolved
    if (latest.urgency <= 2 && latest.importance <= 2) {
      badges.push({ label: '卸载达人', bg: 'rgba(200,200,200,0.2)', color: '#6B7B8D' });
    }

    // Default badge if none matched
    if (badges.length === 0) {
      badges.push({ label: '已化解', bg: 'rgba(255,209,102,0.2)', color: '#B8860B' });
    }

    return badges;
  },

  goDetail(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/xinlun-detail/xinlun-detail?id=${id}` });
  }
});
