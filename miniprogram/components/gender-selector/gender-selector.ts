import { GENDERS } from '../../utils/constants';
import { getLang } from '../../utils/i18n';

const GENDERS_EN = [
  { _id: 'male',   name: 'Mr.' },
  { _id: 'female', name: 'Ms.' },
];

Component({
  properties: {
    selectedGender: {
      type: String,
      value: ''
    },
    lang: {
      type: String,
      value: 'zh'
    }
  },

  data: {
    genders: GENDERS as Array<{ _id: string; name: string }>
  },

  observers: {
    'lang'() {
      this.setData({ genders: getLang() === 'en' ? GENDERS_EN : GENDERS });
    }
  },

  methods: {
    onSelect(e: WechatMiniprogram.CustomEvent) {
      const { id } = e.currentTarget.dataset;
      this.triggerEvent('change', { value: id });
    }
  }
});

