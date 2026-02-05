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

export function validateGuestInfo(guest: GuestInfo, guestNum: 1 | 2): ValidationResult {
  if (!guest.gender) {
    return { isValid: false, message: `请选择顾客${guestNum}称呼` };
  }
  if (!guest.project) {
    return { isValid: false, message: `请选择顾客${guestNum}项目` };
  }
  if (!guest.technician) {
    return { isValid: false, message: `请选择顾客${guestNum}技师` };
  }
  return { isValid: true };
}

export function validateDualModeInfo(guest1: GuestInfo, guest2: GuestInfo): ValidationResult {
  const guest1Result = validateGuestInfo(guest1, 1);
  if (!guest1Result.isValid) {
    return guest1Result;
  }
  const guest2Result = validateGuestInfo(guest2, 2);
  if (!guest2Result.isValid) {
    return guest2Result;
  }
  return { isValid: true };
}

export function validateConsultationForPrint(consultationInfo: Add<ConsultationInfo>, isEssentialOilOnly: boolean, needEssentialOil: boolean, isDualMode: boolean, guest1Info?: GuestInfo, guest2Info?: GuestInfo): ValidationResult {
  if (isDualMode) {
    if (!guest1Info || !guest2Info) {
      return { isValid: false, message: '双人模式信息不完整' };
    }
    const dualResult = validateDualModeInfo(guest1Info, guest2Info);
    if (!dualResult.isValid) {
      return dualResult;
    }
  } else {
    const singleResult = validateConsultationInfo(consultationInfo, isEssentialOilOnly, needEssentialOil);
    if (!singleResult.isValid) {
      return singleResult;
    }
  }

  if (!consultationInfo.room) {
    return { isValid: false, message: '请选择房间' };
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
