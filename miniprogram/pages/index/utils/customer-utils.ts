export class CustomerUtils {
  static async searchCustomer(
    consultationInfo: any,
    isDualMode: boolean,
    activeGuest: 1 | 2,
    guest1Info: any,
    guest2Info: any
  ): Promise<CustomerRecord | null> {
    let currentSurname = '';
    let currentGender = '';
    let currentPhone = '';

    if (isDualMode) {
      const guestInfo = activeGuest === 1 ? guest1Info : guest2Info;
      currentSurname = guestInfo.surname;
      currentGender = guestInfo.gender;
    } else {
      currentSurname = consultationInfo.surname;
      currentGender = consultationInfo.gender;
    }
    currentPhone = consultationInfo.phone;

    if (!currentSurname && !currentPhone) {
      return null;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'matchCustomer',
        data: {
          surname: currentSurname,
          gender: currentGender,
          phone: currentPhone
        }
      });
      
      if (!res.result || typeof res.result !== 'object') {
        throw new Error('匹配顾客失败');
      }
      
      if (res.result.code === 0 && res.result.data) {
        return res.result.data;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  static buildCustomerUpdates(
    matchedCustomer: CustomerRecord,
    isDualMode: boolean,
    activeGuest: 1 | 2
  ): Record<string, any> {
    if (!matchedCustomer) return {};

    const guestKey = activeGuest === 1 ? 'guest1Info' : 'guest2Info';
    const updates: any = {};

    if (isDualMode) {
      updates[`${guestKey}.surname`] = matchedCustomer.name.replace(/先生|女士/g, '');
      updates[`${guestKey}.gender`] = matchedCustomer.name.endsWith('女士') ? 'female' : 'male';

      if (matchedCustomer.responsibleTechnician) {
        updates[`${guestKey}.technician`] = matchedCustomer.responsibleTechnician;
      }

      if (matchedCustomer.phone) {
        updates['consultationInfo.phone'] = matchedCustomer.phone;
      }

      if (matchedCustomer.licensePlate) {
        const plateUpdates = this.buildPlateNumberUpdates(matchedCustomer.licensePlate);
        Object.assign(updates, plateUpdates);
      }
    } else {
      updates['consultationInfo.surname'] = matchedCustomer.name.replace(/先生|女士/g, '');
      updates['consultationInfo.gender'] = matchedCustomer.name.endsWith('女士') ? 'female' : 'male';

      if (matchedCustomer.phone) {
        updates['consultationInfo.phone'] = matchedCustomer.phone;
      }

      if (matchedCustomer.responsibleTechnician) {
        updates['consultationInfo.technician'] = matchedCustomer.responsibleTechnician;
      }

      if (matchedCustomer.licensePlate) {
        const plateUpdates = this.buildPlateNumberUpdates(matchedCustomer.licensePlate);
        Object.assign(updates, plateUpdates);
      }
    }

    updates.matchedCustomerApplied = true;

    return updates;
  }

  private static buildPlateNumberUpdates(licensePlate: string): Record<string, any> {
    const updates: any = {
      'licensePlate': licensePlate
    };

    const isNewEnergyVehicle = licensePlate.length === 8;
    const maxPlateLength = isNewEnergyVehicle ? 8 : 7;
    const plateNumber = Array(maxPlateLength).fill('');
    const plateChars = licensePlate.split('');
    
    plateChars.forEach((char, index) => {
      if (index < maxPlateLength) {
        plateNumber[index] = char;
      }
    });
    
    updates['plateNumber'] = plateNumber;

    return updates;
  }
}
