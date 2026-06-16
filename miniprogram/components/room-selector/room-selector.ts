import { getLang } from '../../utils/i18n';

Component({
  properties: {
    selectedRoom: {
      type: String,
      value: ''
    },
    disabled: {
      type: Boolean,
      value: false
    },
    lang: {
      type: String,
      value: 'zh'
    }
  },
  data: {
    rooms: [] as string[]
  },

  observers: {
    'lang'() {
      this.loadRooms();
    }
  },

  methods: {
    async loadRooms() {
      try {
        const app = getApp<IAppOption>();
        const allRooms = await app.getRooms();
        const normalRooms = allRooms.filter((r: Room) => r.status === 'normal' || !r.status);
        const lang = getLang();
        const roomNames = normalRooms.map((r: Room) => {
          return lang === 'en' && r.nameEn ? r.nameEn : r.name;
        });
        this.setData({ rooms: roomNames });
      } catch (error) {
        this.setData({ rooms: [] });
      }
    },

    onRoomTap(e: WechatMiniprogram.CustomEvent) {
      if (this.properties.disabled) return;
      const room = e.currentTarget.dataset.room;
      this.triggerEvent('change', { room });
    }
  },

  lifetimes: {
    attached() {
      this.loadRooms();
    }
  }
});

