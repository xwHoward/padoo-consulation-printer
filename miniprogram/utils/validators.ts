export interface ValidationResult {
  isValid: boolean;
  message?: string;
}

export function validateConsultationInfo(info: Add<ConsultationInfo>, isEssentialOilOnly: boolean, needEssentialOil: boolean): ValidationResult {
  if (!info.gender) {
    return { isValid: false, message: '请选择称呼' };
  }
  if (!info.project) {
    return { isValid: false, message: '请选择项目' };
  }
  if (!info.technician) {
    return { isValid: false, message: '请选择技师' };
  }
  if (!info.room) {
    return { isValid: false, message: '请选择房间' };
  }
  if (!info.essentialOil && !isEssentialOilOnly && needEssentialOil) {
    return { isValid: false, message: '请选择精油' };
  }

  return { isValid: true };
}

export function validateGuestInfo(guest: GuestInfo, guestNum: number): ValidationResult {
  if (!guest.gender) {
    return { isValid: false, message: `请选择顾客${guestNum}称呼` };
  }
  if (!guest.project) {
    return { isValid: false, message: `请选择顾客${guestNum}项目` };
  }
  if (!guest.technician) {
    return { isValid: false, message: `请选择顾客${guestNum}技师` };
  }
  if (!guest.room) {
    return { isValid: false, message: `请选择顾客${guestNum}房间` };
  }
  return { isValid: true };
}

export function validateMultiModeInfo(guestInfos: GuestInfo[]): ValidationResult {
  for (let i = 0; i < guestInfos.length; i++) {
    const result = validateGuestInfo(guestInfos[i], i + 1);
    if (!result.isValid) return result;
  }
  return { isValid: true };
}

export function validateConsultationForPrint(consultationInfo: Add<ConsultationInfo>, isEssentialOilOnly: boolean, needEssentialOil: boolean, guestCount: number, guestInfos: GuestInfo[]): ValidationResult {
  if (guestCount > 1) {
    const multiResult = validateMultiModeInfo(guestInfos);
    if (!multiResult.isValid) {
      return multiResult;
    }
  } else {
    const singleResult = validateConsultationInfo(consultationInfo, isEssentialOilOnly, needEssentialOil);
    if (!singleResult.isValid) {
      return singleResult;
    }
    if (!consultationInfo.room) {
      return { isValid: false, message: '请选择房间' };
    }
  }

  return { isValid: true };
}

export function showValidationError(result: ValidationResult): boolean {
  if (!result.isValid) {
    wx.showToast({ title: result.message || '校验失败', icon: 'none' });
    return false;
  }
  return true;
}
