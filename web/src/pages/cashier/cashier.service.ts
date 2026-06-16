import { app } from "../../utils/cloudbase";
import type {
  ConsultationRecord,
  ReservationRecord,
  CustomerMembership,
  MembershipUsageRecord,
} from "./cashier.types";

const db = app.database();
const _ = db.command;

const COLLECTIONS = {
  CONSULTATION: "consultation_records",
  RESERVATIONS: "reservations",
  CUSTOMER_MEMBERSHIP: "customer_membership",
  MEMBERSHIP_USAGE: "membership_usage",
  SCHEDULE: "schedule",
  STAFF: "staff",
  ROOMS: "rooms",
};

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

function getNextDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

export { getPreviousDate, getNextDate };

export async function getConsultationsByDate(date: string): Promise<ConsultationRecord[]> {
  try {
    const res = await db.collection(COLLECTIONS.CONSULTATION).where({ date }).orderBy("startTime", "asc").get();
    return (res.data || []) as ConsultationRecord[];
  } catch {
    return [];
  }
}

export async function getConsultationById(id: string): Promise<ConsultationRecord | null> {
  try {
    const res = await db.collection(COLLECTIONS.CONSULTATION).doc(id).get();
    if (res.data && (res.data as any[]).length > 0) return (res.data as any[])[0] as ConsultationRecord;
    return null;
  } catch {
    return null;
  }
}

export async function voidConsultation(id: string): Promise<boolean> {
  try {
    await db.collection(COLLECTIONS.CONSULTATION).doc(id).update({ isVoided: true, updatedAt: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

export async function updateConsultationSettlement(
  id: string,
  settlement: { payments: Array<{ method: string; amount: number; couponCode?: string }>; totalAmount: number; couponCode?: string; settledAt: string }
): Promise<boolean> {
  try {
    await db.collection(COLLECTIONS.CONSULTATION).doc(id).update({ settlement, updatedAt: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

export async function getCustomerMembership(phone: string, name: string): Promise<CustomerMembership | null> {
  try {
    const res = await db.collection(COLLECTIONS.CUSTOMER_MEMBERSHIP)
      .where(_.or([
        { customerPhone: phone, remainingTimes: _.gt(0), status: "active" },
        { customerName: name, remainingTimes: _.gt(0), status: "active" },
      ])).get();
    const list = (res.data || []) as CustomerMembership[];
    return list.length > 0 ? list[0] : null;
  } catch {
    return null;
  }
}

export async function deductMembership(membershipId: string, remainingTimes: number, deduction: number): Promise<boolean> {
  try {
    await db.collection(COLLECTIONS.CUSTOMER_MEMBERSHIP).doc(membershipId).update({ remainingTimes: remainingTimes - deduction });
    return true;
  } catch {
    return false;
  }
}

export async function insertMembershipUsage(record: Omit<MembershipUsageRecord, "_id">): Promise<boolean> {
  try {
    await db.collection(COLLECTIONS.MEMBERSHIP_USAGE).add(record);
    return true;
  } catch {
    return false;
  }
}

export async function getAllReservationsByDate(date: string): Promise<ReservationRecord[]> {
  try {
    const res = await db.collection(COLLECTIONS.RESERVATIONS).where({ date, status: "active" }).orderBy("startTime", "asc").get();
    return (res.data || []) as ReservationRecord[];
  } catch {
    return [];
  }
}

export async function getAllStaff(): Promise<Array<{ _id: string; name: string; gender?: string; phone?: string; status: string }>> {
  try {
    const res = await db.collection(COLLECTIONS.STAFF).where({ status: "active" }).get();
    return (res.data || []) as any[];
  } catch {
    return [];
  }
}

export async function getSchedulesByDate(date: string): Promise<Array<{ staffId: string; shift: string }>> {
  try {
    const res = await db.collection(COLLECTIONS.SCHEDULE).where({ date }).get();
    return (res.data || []) as any[];
  } catch {
    return [];
  }
}

export async function getAllRooms(): Promise<Array<{ _id: string; name: string; status: string }>> {
  try {
    const res = await db.collection(COLLECTIONS.ROOMS).where({ status: "normal" }).get();
    return (res.data || []) as any[];
  } catch {
    return [];
  }
}

export async function callGetAvailableTechnicians(params: Record<string, unknown>): Promise<any> {
  try {
    const res = await app.callFunction({ name: "getAvailableTechnicians", data: params });
    return (res as any).result;
  } catch (e) {
    console.error("callGetAvailableTechnicians failed:", e);
    return null;
  }
}

export async function callManageRotation(params: Record<string, unknown>): Promise<any> {
  try {
    const res = await app.callFunction({ name: "manageRotation", data: params });
    return (res as any).result;
  } catch (e) {
    console.error("callManageRotation failed:", e);
    return null;
  }
}

export async function loadCashierData(date: string) {
  const [
    consultations,
    reservations,
    staff,
    schedules,
    rooms,
    rotationResult,
    cancelledReservations,
  ] = await Promise.all([
    getConsultationsByDate(date),
    getAllReservationsByDate(date),
    getAllStaff(),
    getSchedulesByDate(date),
    getAllRooms(),
    callGetAvailableTechnicians({ mode: "rotationQuickSlots", date }),
    db.collection(COLLECTIONS.RESERVATIONS).where({ date, status: "cancelled" }).get().then((r: any) => (r.data || []) as ReservationRecord[]).catch(() => [] as ReservationRecord[]),
  ]);

  return {
    consultations,
    reservations,
    staff,
    schedules,
    rooms,
    rotationResult,
    cancelledReservations,
  };
}
