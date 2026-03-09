import { DataLoaderService } from "../services/data-loader.service";

export class FormHandler {
  private page: IndexPage<DataLoaderService>;

  constructor(page: IndexPage<DataLoaderService>) {
    this.page = page;
  }

  onSurnameInput(e: WechatMiniprogram.CustomEvent) {
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.surname' : 'guest2Info.surname';
      this.page.setData({ [key]: e.detail.value });
    } else {
      this.page.setData({ "consultationInfo.surname": e.detail.value });
    }
    this.page.searchCustomer();
  }

  onGenderSelect(e: WechatMiniprogram.CustomEvent) {
    const gender = e.detail.value;
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.gender' : 'guest2Info.gender';
      this.page.setData({ [key]: gender });
    } else {
      this.page.setData({ "consultationInfo.gender": gender });
    }
    this.page.searchCustomer();
  }

  onProjectSelect(e: WechatMiniprogram.CustomEvent) {
    const project = e.detail.project || e.currentTarget.dataset.project;
    const { isDualMode, activeGuest, projects } = this.page.data;

    const selectedProject = projects.find((p: Project) => p.name === project);
    const isEssentialOilOnly = selectedProject?.isEssentialOilOnly || false;

    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.project' : 'guest2Info.project';
      this.page.setData({ 
        [key]: project, 
        currentProjectIsEssentialOilOnly: isEssentialOilOnly, 
        currentProjectNeedEssentialOil: selectedProject?.needEssentialOil || false 
      });
    } else {
      this.page.setData({ 
        "consultationInfo.project": project, 
        currentProjectIsEssentialOilOnly: isEssentialOilOnly, 
        currentProjectNeedEssentialOil: selectedProject?.needEssentialOil || false 
      });
    }
    this.page.dataLoader?.loadTechnicianList();
  }

  onTechnicianSelect(e: WechatMiniprogram.CustomEvent) {
    const { technician, occupied, reason, hasNonClockInConflict } = e.detail.technician ? e.detail : e.currentTarget.dataset;
    
    // 新建咨询场景下，即使有占用也允许选择，只显示提示
    if (occupied) {
      wx.showToast({ title: reason || '该技师当前时段已有安排，请注意协调', icon: 'none', duration: 2500 });
    } else if (hasNonClockInConflict) {
      wx.showToast({ title: '该技师有非点钟预约冲突，请注意协调', icon: 'none', duration: 2500 });
    }
    
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.technician' : 'guest2Info.technician';
      this.page.setData({ [key]: technician });
    } else {
      this.page.setData({ "consultationInfo.technician": technician });
    }
  }

  onClockInSelect() {
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const currentInfo = activeGuest === 1 ? this.page.data.guest1Info : this.page.data.guest2Info;
      const key = activeGuest === 1 ? 'guest1Info.isClockIn' : 'guest2Info.isClockIn';
      this.page.setData({ [key]: !currentInfo.isClockIn });
    } else {
      this.page.setData({ "consultationInfo.isClockIn": !this.page.data.consultationInfo.isClockIn });
    }
  }

  onRemarksInput(e: WechatMiniprogram.CustomEvent) {
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.remarks' : 'guest2Info.remarks';
      this.page.setData({ [key]: e.detail.value });
    } else {
      this.page.setData({ "consultationInfo.remarks": e.detail.value });
    }
  }

  onPhoneInput(e: WechatMiniprogram.CustomEvent) {
    this.page.setData({
      "consultationInfo.phone": e.detail.value,
    });
    this.page.searchCustomer();
  }

  onCouponCodeInput(e: WechatMiniprogram.CustomEvent) {
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.couponCode' : 'guest2Info.couponCode';
      this.page.setData({ [key]: e.detail.value });
    } else {
      this.page.setData({ "consultationInfo.couponCode": e.detail.value });
    }
  }

  onCouponPlatformSelect(e: WechatMiniprogram.CustomEvent) {
    const platform = e.detail.value;
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const currentInfo = activeGuest === 1 ? this.page.data.guest1Info : this.page.data.guest2Info;
      const key = activeGuest === 1 ? 'guest1Info.couponPlatform' : 'guest2Info.couponPlatform';
      this.page.setData({ [key]: currentInfo.couponPlatform === platform ? '' : platform });
    } else {
      const currentPlatform = this.page.data.consultationInfo.couponPlatform;
      this.page.setData({ "consultationInfo.couponPlatform": currentPlatform === platform ? '' : platform });
    }
  }

  onRoomSelect(e: WechatMiniprogram.CustomEvent) {
    const room = e.detail.room || e.currentTarget.dataset.room;
    this.page.setData({
      "consultationInfo.room": room,
    });
  }

  onMassageStrengthSelect(e: WechatMiniprogram.CustomEvent) {
    const strength = e.detail.strength || e.currentTarget.dataset.strength;
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.massageStrength' : 'guest2Info.massageStrength';
      this.page.setData({ [key]: strength });
    } else {
      this.page.setData({ "consultationInfo.massageStrength": strength });
    }
  }

  onEssentialOilSelect(e: WechatMiniprogram.CustomEvent) {
    const oil = e.detail.oil || e.currentTarget.dataset.oil;
    const { isDualMode, activeGuest } = this.page.data;
    if (isDualMode) {
      const key = activeGuest === 1 ? 'guest1Info.essentialOil' : 'guest2Info.essentialOil';
      this.page.setData({ [key]: oil });
    } else {
      this.page.setData({ "consultationInfo.essentialOil": oil });
    }
  }

  onBodyPartSelect(e: WechatMiniprogram.CustomEvent) {
    const part = e.detail.part || e.currentTarget.dataset.part;
    const { isDualMode, activeGuest } = this.page.data;

    if (isDualMode) {
      const infoKey = activeGuest === 1 ? 'guest1Info' : 'guest2Info';
      const currentInfo = activeGuest === 1 ? this.page.data.guest1Info : this.page.data.guest2Info;
      const selectedParts = { ...currentInfo.selectedParts };
      selectedParts[part] = !selectedParts[part];
      this.page.setData({ [`${infoKey}.selectedParts`]: selectedParts });
    } else {
      const selectedParts: Record<string, boolean> = {
        ...this.page.data.consultationInfo.selectedParts,
      };
      selectedParts[part] = !selectedParts[part];
      const updatedInfo = {
        ...this.page.data.consultationInfo,
        selectedParts: selectedParts,
      };
      this.page.setData({ consultationInfo: updatedInfo });
    }
  }
}
