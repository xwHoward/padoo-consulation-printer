import { t, getLang, buildI18nData } from '../../utils/i18n';

Component({
  properties: {
    selectedParts: {
      type: Object,
      value: {}
    },
    lang: {
      type: String,
      value: 'zh'
    }
  },
  data: {
    parts: [] as Array<{ _id: string; name: string }>,
    t: {} as Record<string, string>
  },

  observers: {
    'lang'() {
      this.setData({ t: buildI18nData('bodySelector') });
      this.updateParts();
    }
  },

  methods: {
    onPartTap(e: WechatMiniprogram.CustomEvent) {
      const part = e.currentTarget.dataset.part;
      this.triggerEvent('change', { part });
    },

    updateParts() {
      const parts = [
        { _id: 'head',     name: t('head') },
        { _id: 'neck',     name: t('neck') },
        { _id: 'shoulder', name: t('shoulder') },
        { _id: 'back',     name: t('back') },
        { _id: 'arm',      name: t('arm') },
        { _id: 'abdomen',  name: t('abdomen') },
        { _id: 'waist',    name: t('waist') },
        { _id: 'thigh',    name: t('thigh') },
        { _id: 'calf',     name: t('calf') }
      ];
      this.setData({ parts });
    }
  },

  lifetimes: {
    attached() {
      this.setData({ t: buildI18nData('bodySelector') });
      this.updateParts();
    }
  }
});
