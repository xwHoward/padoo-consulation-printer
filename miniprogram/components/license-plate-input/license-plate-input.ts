Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    value: {
      type: String,
      value: ''
    }
  },

  data: {
    provinceCodes: ['京', '津', '冀', '晋', '蒙', '辽', '吉', '黑', '沪', '苏', '浙', '皖', '闽', '赣', '鲁', '豫', '鄂', '湘', '粤', '桂', '琼', '川', '黔', '滇', '藏', '陕', '甘', '青', '宁', '新', '渝', '使', '临'],
    plateCharacters: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    plateNumber: ['', '', '', '', '', '', '', ''],
    currentPlatePosition: 0,
    initialized: false,
    isNewEnergyVehicle: false,
    isNoPlate: false
  },

  observers: {
    'visible': function(visible: boolean) {
      if (visible && !this.data.initialized) {
        this.initializePlateData();
      }
    },

    'value': function(value: string) {
      if (this.data.initialized) {
        this.syncWithValue(value);
      }
    }
  },

  methods: {
    initializePlateData() {
      const { value } = this.properties;
      const isNewEnergyVehicle = value.length === 8;
      const isNoPlate = value.startsWith('临');
      const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
      const plateNumber = Array(maxPlateLength).fill('');

      if (value) {
        const plateChars = value.split('');
        plateChars.forEach((char, index) => {
          if (index < maxPlateLength) {
            plateNumber[index] = char;
          }
        });
      }

      const currentPlatePosition = value.length;

      this.setData({
        plateNumber,
        currentPlatePosition,
        initialized: true,
        isNewEnergyVehicle,
        isNoPlate
      });
    },

    syncWithValue(value: string) {
      const isNewEnergyVehicle = value.length === 8;
      const isNoPlate = value.startsWith('临');
      this.setData({
        isNewEnergyVehicle,
        isNoPlate
      });
      this.adjustPlateLength();
    },

    adjustPlateLength() {
      const { plateNumber, currentPlatePosition, isNewEnergyVehicle, isNoPlate } = this.data;
      const maxPlateLength = isNewEnergyVehicle ? 8 : 7;

      if (isNoPlate) {
        const newPlateNumber = Array(maxPlateLength).fill('');
        newPlateNumber[0] = '临';
        this.setData({
          plateNumber: newPlateNumber,
          currentPlatePosition: 1
        });
        return;
      }

      if (plateNumber.length === maxPlateLength) {
        return;
      }

      let newPlateNumber: string[];
      let newPosition = currentPlatePosition;

      if (maxPlateLength > plateNumber.length) {
        newPlateNumber = [...plateNumber.slice(0, 7), ''];
      } else {
        newPlateNumber = plateNumber.slice(0, 7);
        if (currentPlatePosition === 8) {
          newPosition = 7;
        }
      }

      this.setData({
        plateNumber: newPlateNumber,
        currentPlatePosition: newPosition
      });
    },
    onMaskTap() {
      this.setData({ initialized: false });
      this.triggerEvent('cancel');
    },

    selectProvince(e: WechatMiniprogram.CustomEvent) {
      const province = e.currentTarget.dataset.province;
      this.setData({
        'plateNumber[0]': province,
        currentPlatePosition: 1
      });
    },

    selectCharacter(e: WechatMiniprogram.CustomEvent) {
      const char = e.currentTarget.dataset.char;
      const { isNewEnergyVehicle } = this.data;
      const maxPlateLength = isNewEnergyVehicle ? 8 : 7;

      if (this.data.currentPlatePosition < maxPlateLength) {
        const newPlateNumber = [...this.data.plateNumber];
        newPlateNumber[this.data.currentPlatePosition] = char;
        this.setData({
          plateNumber: newPlateNumber,
          currentPlatePosition: this.data.currentPlatePosition + 1
        });
      }
    },

    deletePlateChar() {
      const { isNoPlate } = this.data;
      const { currentPlatePosition } = this.data;
      if (currentPlatePosition > (isNoPlate ? 1 : 0)) {
        const newPlateNumber = [...this.data.plateNumber];
        newPlateNumber[currentPlatePosition - 1] = '';
        this.setData({
          plateNumber: newPlateNumber,
          currentPlatePosition: currentPlatePosition - 1
        });
      }
    },

    resetPlateInput() {
      const { isNoPlate, isNewEnergyVehicle } = this.data;
      const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
      const plateNumber = Array(maxPlateLength).fill('');
      if (isNoPlate) {
        plateNumber[0] = '临';
      }
      this.setData({
        plateNumber,
        currentPlatePosition: isNoPlate ? 1 : 0
      });
    },

    confirmPlateInput() {
      const licensePlate = this.data.plateNumber.join('');
      this.setData({ initialized: false });
      this.triggerEvent('confirm', { value: licensePlate });
    },

    toggleNewEnergy() {
      const { isNewEnergyVehicle, plateNumber, currentPlatePosition } = this.data;
      const newIsNewEnergyVehicle = !isNewEnergyVehicle;

      let newPlateNumber: string[];
      let newPosition = currentPlatePosition;

      if (newIsNewEnergyVehicle) {
        newPlateNumber = [...plateNumber.slice(0, 7), ''];
        if (currentPlatePosition === 7) {
          newPosition = 7;
        }
      } else {
        const removedChar = plateNumber[7] || '';
        newPlateNumber = plateNumber.slice(0, 7);
        if (currentPlatePosition === 8 && removedChar) {
          newPosition = 7;
        }
      }

      this.setData({
        plateNumber: newPlateNumber,
        currentPlatePosition: newPosition,
        isNewEnergyVehicle: newIsNewEnergyVehicle
      });

      this.triggerEvent('change', {
        isNewEnergyVehicle: newIsNewEnergyVehicle,
        isNoPlate: this.data.isNoPlate
      });
    },

    toggleNoPlate() {
      const { isNoPlate, isNewEnergyVehicle } = this.data;
      const newIsNoPlate = !isNoPlate;

      const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
      const plateNumber = Array(maxPlateLength).fill('');

      if (newIsNoPlate) {
        plateNumber[0] = '临';
      }

      this.setData({
        plateNumber,
        currentPlatePosition: newIsNoPlate ? 1 : 0,
        isNoPlate: newIsNoPlate
      });

      this.triggerEvent('change', {
        isNewEnergyVehicle: this.data.isNewEnergyVehicle,
        isNoPlate: newIsNoPlate
      });
    }
  }
});
