<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-bold text-gray-900">收银管理</h2>
      <div class="flex items-center gap-2">
        <button class="rounded border px-2 py-1 text-xs hover:bg-gray-50" @click="goToPrevDay">◀</button>
        <input type="date" :value="selectedDate" class="rounded border px-2 py-1 text-sm" @change="onDateChange" />
        <button class="rounded border px-2 py-1 text-xs hover:bg-gray-50" @click="goToNextDay">▶</button>
        <button class="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700" @click="goToToday">今天</button>
        <button class="rounded border px-3 py-1 text-xs hover:bg-gray-50" @click="loadData" :disabled="loading">{{ loading ? '加载中...' : '刷新' }}</button>
      </div>
    </div>

    <div v-if="loading && !hasData" class="py-16 text-center text-sm text-gray-400">加载中...</div>

    <template v-else>
      <!-- 排钟 (Timeline) -->
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">排钟</h3>
        </div>
        <TimelineView
          v-if="hasData"
          :consultations="consultations"
          :reservations="reservations"
          :cancelled-reservations="cancelledReservations"
          :staff="staff"
          :schedules="schedules"
          :rotation-list="rotationItems"
          @block-click="onTimelineBlockClick"
        />
        <div v-else class="py-8 text-center text-sm text-gray-400">暂无数据</div>
      </div>

      <!-- 快速预约 -->
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">预约</h3>
        </div>
        <div class="flex gap-4 mb-3">
          <div class="flex-1 flex items-center justify-between rounded-lg border bg-gray-50 p-3">
            <span class="text-sm font-medium">男技师</span>
            <div class="flex items-center gap-1">
              <button class="w-7 h-7 rounded border bg-white text-sm hover:bg-blue-50" @click="changeQuickGender('male', -1)">-</button>
              <span class="min-w-[20px] text-center text-lg font-semibold text-blue-600">{{ quickSlots.maleCount }}</span>
              <button class="w-7 h-7 rounded border bg-white text-sm hover:bg-blue-50" @click="changeQuickGender('male', 1)">+</button>
            </div>
          </div>
          <div class="flex-1 flex items-center justify-between rounded-lg border bg-gray-50 p-3">
            <span class="text-sm font-medium">女技师</span>
            <div class="flex items-center gap-1">
              <button class="w-7 h-7 rounded border bg-white text-sm hover:bg-pink-50" @click="changeQuickGender('female', -1)">-</button>
              <span class="min-w-[20px] text-center text-lg font-semibold text-pink-600">{{ quickSlots.femaleCount }}</span>
              <button class="w-7 h-7 rounded border bg-white text-sm hover:bg-pink-50" @click="changeQuickGender('female', 1)">+</button>
            </div>
          </div>
        </div>
        <div v-if="quickLoading" class="text-center py-3 text-sm text-gray-400">查询中...</div>
        <div v-else-if="quickSlots.earliestTime" class="mb-2 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm">
          <span class="text-gray-500">最快可约：</span><span class="font-semibold text-green-600">{{ quickSlots.earliestTime }}</span>
        </div>
        <div v-if="!quickLoading && quickSlots.slots.length > 0" class="space-y-1 max-h-[200px] overflow-y-auto">
          <div v-for="slot in quickSlots.slots" :key="slot.time" class="flex items-center justify-between rounded border border-orange-100 bg-orange-50 px-3 py-2 text-xs cursor-pointer hover:bg-orange-100" @click="copyReservationSlot(slot)">
            <span class="font-medium text-orange-600">{{ slot.time }}</span>
            <span>
              <span v-if="slot.maleStaff && slot.maleStaff.length" class="text-blue-500">男:{{ slot.maleStaff.join(',') }}</span>
              <span v-if="slot.femaleStaff && slot.femaleStaff.length" class="ml-2 text-pink-500">女:{{ slot.femaleStaff.join(',') }}</span>
            </span>
          </div>
        </div>
        <div v-if="!quickLoading && quickSlots.slots.length === 0 && (quickSlots.maleCount + quickSlots.femaleCount > 0)" class="text-center py-3 text-sm text-gray-400">
          {{ quickSlots.emptyReason || '暂无可约时段' }}
        </div>
      </div>

      <!-- 轮牌 -->
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">轮牌</h3>
          <div class="flex gap-2">
            <button class="rounded border border-orange-300 px-3 py-1 text-xs text-orange-600 hover:bg-orange-50" @click="resetRotation">重置</button>
          </div>
        </div>
        <div v-if="rotationItems.length > 0" class="space-y-2">
          <div v-for="(item, index) in rotationItems" :key="item.staffId" class="flex items-center rounded-lg border bg-gray-50 p-3">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white mr-3">{{ index + 1 }}</span>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{{ item.name }}</span>
                <span class="rounded px-1.5 py-0.5 text-xs" :class="item.shift === 'morning' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'">
                  {{ item.shift === 'morning' ? '早班' : '晚班' }}
                </span>
              </div>
              <div v-if="item.availableSlots" class="mt-1 flex items-center gap-2 text-xs text-green-600">
                <span>可约: {{ item.availableSlots }}</span>
                <button class="rounded border border-orange-200 px-1.5 py-0.5 text-orange-500 hover:bg-orange-50" @click="copyTechnicianSlot(item)">复制</button>
              </div>
            </div>
            <div class="flex gap-1">
              <button class="rounded border px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-30" :disabled="index === 0" @click="moveRotation(index, -1)">↑</button>
              <button class="rounded border px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-30" :disabled="index === rotationItems.length - 1" @click="moveRotation(index, 1)">↓</button>
            </div>
          </div>
        </div>
        <div v-else class="py-4 text-center text-sm text-gray-400">今日暂无上班排班</div>
      </div>

      <!-- 房间状态 -->
      <div class="section">
        <h3 class="section-title">房间</h3>
        <div class="grid grid-cols-3 gap-2">
          <div v-for="room in roomsWithStatus" :key="room.name" class="flex flex-col items-center rounded-lg border p-3" :class="room.isOccupied ? 'border-orange-200 bg-orange-50' : 'bg-gray-50 text-gray-400'">
            <span class="text-sm font-semibold">{{ room.name }}</span>
            <div v-if="room.isOccupied" class="mt-2 space-y-1 w-full">
              <div v-for="(r, ri) in room.occupiedRecords" :key="ri" class="flex flex-wrap items-center justify-center gap-1 text-xs">
                <span class="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700 font-medium">{{ r.customerName }}</span>
                <span class="rounded bg-orange-100 px-1.5 py-0.5 text-orange-600">{{ r.technician }}</span>
                <span class="rounded bg-orange-100 px-1.5 py-0.5 text-orange-500">{{ r.endTime }}下</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <ConsultDetailModal
      :visible="detailVisible"
      :record="detailRecord"
      @close="detailVisible = false"
      @settle="onDetailSettle"
      @void="onDetailVoid"
    />

    <SettlementModal
      :visible="settlementVisible"
      :record="settlementRecord"
      :project-price="0"
      @close="settlementVisible = false"
      @confirm="handleSettlement"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import type { ConsultationRecord, ReservationRecord } from "./cashier.types";
import ConsultDetailModal from "./ConsultDetailModal.vue";
import SettlementModal from "./SettlementModal.vue";
import TimelineView from "./TimelineView.vue";
import {
  loadCashierData,
  voidConsultation,
  updateConsultationSettlement,
  getCustomerMembership,
  deductMembership,
  insertMembershipUsage,
  callGetAvailableTechnicians,
  callManageRotation,
  formatDate,
  getPreviousDate as pDay,
  getNextDate as nDay,
} from "./cashier.service";

const loading = ref(false);
const hasData = ref(false);
const selectedDate = ref(formatDate(new Date()));
const consultations = ref<ConsultationRecord[]>([]);
const reservations = ref<ReservationRecord[]>([]);
const cancelledReservations = ref<ReservationRecord[]>([]);
const staff = ref<Array<{ _id: string; name: string; gender?: string }>>([]);
const schedules = ref<Array<{ staffId: string; shift: string }>>([]);
const rooms = ref<Array<{ _id: string; name: string; status: string }>>([]);
const rotationItems = ref<Array<{ staffId: string; name: string; shift: string; availableSlots: string }>>([]);
const quickSlots = ref<{ maleCount: number; femaleCount: number; earliestTime: string; slots: any[]; emptyReason?: string }>({
  maleCount: 0, femaleCount: 2, earliestTime: "", slots: [],
});
const quickLoading = ref(false);

onMounted(() => { loadData(); });
watch(selectedDate, () => { loadData(); });

async function loadData() {
  loading.value = true;
  try {
    const data = await loadCashierData(selectedDate.value);
    consultations.value = data.consultations;
    reservations.value = data.reservations;
    cancelledReservations.value = data.cancelledReservations;
    staff.value = data.staff;
    schedules.value = data.schedules;
    rooms.value = data.rooms;
    hasData.value = true;

    if (data.rotationResult?.code === 0 && data.rotationResult.data) {
      rotationItems.value = data.rotationResult.data.rotationItems || [];
      const defSlots = data.rotationResult.data.quickReservationSlots?.twoFemale || [];
      quickSlots.value = {
        maleCount: quickSlots.value.maleCount,
        femaleCount: quickSlots.value.femaleCount,
        earliestTime: defSlots[0]?.time || "",
        slots: defSlots.map((s: any) => ({ ...s, maleStaff: [], femaleStaff: s.staffNames || [] })),
      };
    }

    if (quickSlots.value.maleCount > 0 || quickSlots.value.femaleCount > 0) {
      await fetchQuickSlots();
    }
  } catch (e) {
    console.error("loadData failed:", e);
  } finally {
    loading.value = false;
  }
}

async function fetchQuickSlots() {
  quickLoading.value = true;
  try {
    const res = await callGetAvailableTechnicians({
      mode: "quickSlots",
      date: selectedDate.value,
      maleCount: quickSlots.value.maleCount,
      femaleCount: quickSlots.value.femaleCount,
    });
    if (res?.code === 0 && res.data) {
      quickSlots.value.earliestTime = res.data.earliestTime || "";
      quickSlots.value.slots = res.data.slots || [];
      quickSlots.value.emptyReason = res.data.emptyReason || "";
    }
  } catch {} finally {
    quickLoading.value = false;
  }
}

async function changeQuickGender(gender: string, delta: number) {
  const key = gender === "male" ? "maleCount" : "femaleCount";
  const newVal = Math.max(0, (quickSlots.value as any)[key] + delta);
  (quickSlots.value as any)[key] = newVal;
  await fetchQuickSlots();
}

function copyReservationSlot(slot: any) {
  const text = `您好，目前可预约时段为${slot.time}哦，您可以告诉小趴到店时间~`;
  navigator.clipboard.writeText(text).then(() => alert("已复制到剪贴板")).catch(() => {});
}

function copyTechnicianSlot(item: any) {
  const text = `您好，${item.name}老师可预约时段为${item.availableSlots}哦~`;
  navigator.clipboard.writeText(text).then(() => alert("已复制到剪贴板")).catch(() => {});
}

async function moveRotation(index: number, dir: number) {
  const fromIdx = index;
  const toIdx = index + dir;
  if (toIdx < 0 || toIdx >= rotationItems.value.length) return;
  const result = await callManageRotation({ action: "adjustRotationPosition", date: selectedDate.value, fromIndex: fromIdx, toIndex: toIdx });
  if (result?.code === 0) {
    const list = [...rotationItems.value];
    [list[fromIdx], list[toIdx]] = [list[toIdx], list[fromIdx]];
    rotationItems.value = list;
  }
}

async function resetRotation() {
  if (!confirm("确认重置当天轮牌？")) return;
  await callManageRotation({ action: "init", date: selectedDate.value });
  loadData();
}

const roomsWithStatus = computed(() => {
  const today = selectedDate.value;
  const todayRecords = consultations.value.filter(r => !r.isVoided && r.date === today);
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const isToday = today === formatDate(new Date());

  return rooms.value.map(room => {
    let occupiedRecords = todayRecords
      .filter(r => r.room === room.name)
      .map(r => ({ customerName: r.surname + (r.gender === "male" ? "先生" : "女士"), technician: r.technician || "", endTime: r.endTime }));

    if (isToday) {
      occupiedRecords = occupiedRecords.filter(r => nowStr < r.endTime);
    }
    occupiedRecords.sort((a, b) => b.endTime.localeCompare(a.endTime));

    return { ...room, isOccupied: occupiedRecords.length > 0, occupiedRecords };
  });
});

function goToToday() { selectedDate.value = formatDate(new Date()); }
function goToPrevDay() { selectedDate.value = pDay(selectedDate.value); }
function goToNextDay() { selectedDate.value = nDay(selectedDate.value); }
function onDateChange(e: Event) { selectedDate.value = (e.target as HTMLInputElement).value; }

async function onTimelineBlockClick(block: any) {
  let items: string[] = [];
  if (block.isReservation) {
    items = block.isCancelled ? [] : ["到店", "取消预约"];
  } else {
    if (block.isSettled) {
      items = ["修改结算"];
    } else {
      items = ["结算", "作废"];
    }
  }

  if (items.length === 0) return;

  const action = prompt(`选择操作:\n${items.map((a, i) => `${i + 1}. ${a}`).join("\n")}`);
  if (!action) return;
  const idx = parseInt(action) - 1;
  if (isNaN(idx) || idx < 0 || idx >= items.length) return;
  const chosen = items[idx];

  const id = block._id;
  if (chosen === "结算" || chosen === "修改结算") {
    const record = consultations.value.find(r => r._id === id);
    if (record) openSettlementInternal(record);
  } else if (chosen === "作废") {
    if (confirm("确认作废？")) {
      await voidConsultation(id);
      loadData();
    }
  } else if (chosen === "到店") {
    alert("到店处理请在小程序端操作");
  } else if (chosen === "取消预约") {
    alert("取消预约请在小程序端操作");
  }
}

const detailVisible = ref(false);
const detailRecord = ref<ConsultationRecord | null>(null);
function openDetail(record: ConsultationRecord) { detailRecord.value = record; detailVisible.value = true; }
function onDetailSettle() { detailVisible.value = false; if (detailRecord.value) openSettlementInternal(detailRecord.value); }
async function onDetailVoid() {
  if (!detailRecord.value || !confirm("确认作废？")) return;
  if (await voidConsultation(detailRecord.value._id)) { detailVisible.value = false; loadData(); } else { alert("作废失败"); }
}

const settlementVisible = ref(false);
const settlementRecord = ref<ConsultationRecord>({} as ConsultationRecord);
function openSettlementInternal(record: ConsultationRecord) { settlementRecord.value = record; settlementVisible.value = true; }

async function handleSettlement(payments: Array<{ method: string; amount: number; couponCode?: string }>, totalAmount: number) {
  const rec = settlementRecord.value;
  if (!rec?._id) return;
  try {
    const mp = payments.find(p => p.method === "membership");
    if (mp) {
      const membership = await getCustomerMembership(rec.phone, rec.surname);
      if (!membership) { alert("未找到有效会员卡"); return; }
      const deduction = mp.amount || 1;
      if (membership.remainingTimes < deduction) { alert("会员卡余额不足"); return; }
      await deductMembership(membership._id, membership.remainingTimes, deduction);
      await insertMembershipUsage({ cardId: membership.cardId, cardName: membership.cardName, date: rec.date, customerName: rec.surname, project: rec.project, technician: rec.technician, room: rec.room, consultationId: rec._id });
    }
    if (await updateConsultationSettlement(rec._id, { payments, totalAmount, settledAt: new Date().toISOString() })) {
      settlementVisible.value = false;
      loadData();
    } else { alert("结算失败"); }
  } catch { alert("结算失败"); }
}
</script>

<style scoped>
.section { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #e5e7eb; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.section-title { font-size: 15px; font-weight: 600; color: #1f2937; padding-left: 10px; border-left: 3px solid #f97316; line-height: 1.2; }
</style>
