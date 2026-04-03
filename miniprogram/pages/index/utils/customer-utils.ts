import { matchCustomer as matchCustomerService, parseCustomerName, buildPlateNumberUpdates } from '../../../services/customer.service';

export class CustomerUtils {
  static async searchCustomer(
    consultationInfo: Add<ConsultationInfo>,
    isDualMode: boolean,
    activeGuest: 1 | 2,
    guest1Info: GuestInfo,
    guest2Info: GuestInfo
  ): Promise<CustomerRecord | null> {
    let currentSurname = '';
    let currentGender: 'male' | 'female' | '' = '';
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

    // 使用统一的服务层
    const result = await matchCustomerService({
      surname: currentSurname,
      gender: currentGender,
      phone: currentPhone
    });

    return result.customer;
  }

  static buildCustomerUpdates(
    matchedCustomer: CustomerRecord,
    isDualMode: boolean,
    activeGuest: 1 | 2
  ): Record<string, unknown> {
    if (!matchedCustomer) return {};

    const guestKey = activeGuest === 1 ? 'guest1Info' : 'guest2Info';
    const updates: Record<string, unknown> = {};
    const { surname, gender } = parseCustomerName(matchedCustomer.name);

    if (isDualMode) {
      updates[`${guestKey}.surname`] = surname;
      updates[`${guestKey}.gender`] = gender;

      if (matchedCustomer.responsibleTechnician) {
        updates[`${guestKey}.technician`] = matchedCustomer.responsibleTechnician;
      }

      if (matchedCustomer.phone) {
        updates['consultationInfo.phone'] = matchedCustomer.phone;
      }

      if (matchedCustomer.licensePlate) {
        const plateUpdates = buildPlateNumberUpdates(matchedCustomer.licensePlate);
        updates['licensePlate'] = plateUpdates.licensePlate;
        updates['plateNumber'] = plateUpdates.plateNumber;
      }
    } else {
      updates['consultationInfo.surname'] = surname;
      updates['consultationInfo.gender'] = gender;

      if (matchedCustomer.phone) {
        updates['consultationInfo.phone'] = matchedCustomer.phone;
      }

      if (matchedCustomer.responsibleTechnician) {
        updates['consultationInfo.technician'] = matchedCustomer.responsibleTechnician;
      }

      if (matchedCustomer.licensePlate) {
        const plateUpdates = buildPlateNumberUpdates(matchedCustomer.licensePlate);
        updates['licensePlate'] = plateUpdates.licensePlate;
        updates['plateNumber'] = plateUpdates.plateNumber;
      }
    }

    updates.matchedCustomerApplied = true;

    return updates;
  }
}
