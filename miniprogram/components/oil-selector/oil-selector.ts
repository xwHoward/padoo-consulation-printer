import { getLang } from '../../utils/i18n';

Component({
  properties: {
    selectedOil: {
      type: String,
      value: ''
    },
    lang: {
      type: String,
      value: 'zh'
    }
  },
  data: {
    oils: [] as Array<EssentialOil & { nameEn?: string; effectEn?: string }>
  },

  observers: {
    'lang'() {
      // 重新映射显示名称
      const { oils } = this.data;
      if (oils.length > 0) {
        this.setData({ oils: [...oils] });
      }
    }
  },

  methods: {
    async loadOils() {
      try {
        const app = getApp<IAppOption>();
        const allOils = await app.getEssentialOils();
        const normalOils = allOils.filter((o) => o.status === 'normal' || !o.status);
        this.setData({ oils: normalOils });
      } catch (error) {
        this.setData({ oils: [] });
      }
    },

    onOilTap(e: WechatMiniprogram.CustomEvent) {
      const oil = e.currentTarget.dataset.oil;
      this.triggerEvent('change', { oil });
    }
  },

  lifetimes: {
    attached() {
      this.loadOils();
    }
  }
});

