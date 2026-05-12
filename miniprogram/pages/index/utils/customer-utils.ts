import { matchCustomer as matchCustomerService, parseCustomerName, buildPlateNumberUpdates } from '../../../services/customer.service';

export class CustomerUtils {
  static async searchCustomer(
    consultationInfo: Add<ConsultationInfo>,
    guestCount: number,
    activeGuest: number,
    guestInfos: GuestInfo[]
  ): Promise<CustomerRecord | null> {
    let currentSurname = '';
    let currentGender: 'male' | 'female' | '' = '';
    let currentPhone = '';

    if (guestCount > 1) {
      const guestInfo = guestInfos[activeGuest - 1];
      currentSurname = guestInfo?.surname || '';
      currentGender = guestInfo?.gender || '';
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
    guestCount: number,
    activeGuest: number
  ): Record<string, unknown> {
    if (!matchedCustomer) return {};

    const updates: Record<string, unknown> = {};
    const { surname, gender } = parseCustomerName(matchedCustomer.name);

    if (guestCount > 1) {
      const guestIdx = activeGuest - 1;
      updates[`guestInfos[${guestIdx}].surname`] = surname;
      updates[`guestInfos[${guestIdx}].gender`] = gender;

      if (matchedCustomer.responsibleTechnician) {
        updates[`guestInfos[${guestIdx}].technician`] = matchedCustomer.responsibleTechnician;
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
