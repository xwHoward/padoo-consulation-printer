import { COUPON_PLATFORMS } from '../../utils/constants';
import { getLang } from '../../utils/i18n';

const COUPON_PLATFORMS_EN = [
  { _id: 'meituan',    name: 'MT' },
  { _id: 'dianping',   name: 'DP' },
  { _id: 'douyin',     name: 'DY' },
  { _id: 'wechat',     name: 'WX' },
  { _id: 'alipay',     name: 'ZFB' },
  { _id: 'cash',       name: 'Cash' },
  { _id: 'gaode',      name: 'GD' },
  { _id: 'free',       name: 'Free' },
  { _id: 'membership', name: 'Card' },
];

Component({
  properties: {
    selectedPlatform: {
      type: String,
      value: ''
    },
    lang: {
      type: String,
      value: 'zh'
    }
  },

  data: {
    platforms: COUPON_PLATFORMS as Array<{ _id: string; name: string }>
  },

  observers: {
    'lang'() {
      this.setData({ platforms: getLang() === 'en' ? COUPON_PLATFORMS_EN : COUPON_PLATFORMS });
    }
  },

  methods: {
    onSelect(e: WechatMiniprogram.CustomEvent) {
      const { id } = e.currentTarget.dataset;
      this.triggerEvent('change', { value: id });
    }
  }
});

