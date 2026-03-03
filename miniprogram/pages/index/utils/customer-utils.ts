import { CustomerUtils as CommonCustomerUtils } from "../../common/utils/customer-utils";

export class CustomerUtils {
  static async searchCustomer(
    consultationInfo: any,
    isDualMode: boolean,
    activeGuest: 1 | 2,
    guest1Info: any,
    guest2Info: any
  ): Promise<CustomerRecord | null> {
    let currentSurname = '';
    let currentGender: 'male' | 'female';
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

    return await CommonCustomerUtils.searchCustomer(currentSurname, currentGender, currentPhone);
  }

  static buildCustomerUpdates(
    matchedCustomer: CustomerRecord,
    isDualMode: boolean,
    activeGuest: 1 | 2
  ): Record<string, any> {
    const baseUpdates = CommonCustomerUtils.buildCustomerUpdates(matchedCustomer, {});
    const updates: Record<string, any> = {};

    if (isDualMode) {
      const guestKey = activeGuest === 1 ? 'guest1Info' : 'guest2Info';
      updates[`${guestKey}.surname`] = matchedCustomer.name.replace(/先生|女士/g, '');
      updates[`${guestKey}.gender`] = matchedCustomer.name.endsWith('女士') ? 'female' : 'male';

      if (matchedCustomer.responsibleTechnician) {
        updates[`${guestKey}.technician`] = matchedCustomer.responsibleTechnician;
      }

      if (matchedCustomer.phone && !baseUpdates.phone) {
        updates['consultationInfo.phone'] = matchedCustomer.phone;
      }

      if (matchedCustomer.licensePlate) {
        const plateUpdates = this.buildPlateNumberUpdates(matchedCustomer.licensePlate);
        Object.assign(updates, plateUpdates);
      }
    } else {
      updates['consultationInfo.surname'] = matchedCustomer.name.replace(/先生|女士/g, '');
      updates['consultationInfo.gender'] = matchedCustomer.name.endsWith('女士') ? 'female' : 'male';

      if (matchedCustomer.phone && !baseUpdates.phone) {
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
