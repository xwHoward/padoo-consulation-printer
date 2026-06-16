<template>
  <div class="timeline-wrapper">
    <div class="timeline-scroll" ref="scrollRef">
      <div class="timeline-container" :style="{ width: containerWidth + 'px' }">
        <div class="time-axis">
          <div class="time-axis-spacer" :style="{ width: HOUR_WIDTH + 'px' }"></div>
          <div v-for="label in timeLabels" :key="label" class="time-mark" :style="{ flex: '0 0 ' + HOUR_WIDTH + 'px' }">
            {{ label }}
          </div>
        </div>

        <div
          v-for="item in staffTimeline"
          :key="item._id"
          class="staff-row"
          :class="{ highlighted: item.highlighted }"
        >
          <div class="staff-name-col" :style="{ width: HOUR_WIDTH + 'px' }">
            <span class="staff-name">{{ item.name }}</span>
            <span class="rotation-count">(轮{{ item.rotationCount }})</span>
            <span class="shift-tag" :class="item.shift">
              {{ shiftLabels[item.shift] || item.shift }}
            </span>
          </div>

          <div class="timeline-track">
            <div v-for="i in timeLabels.length" :key="i" class="grid-line"></div>

            <div
              v-for="block in item.blocks"
              :key="block._id"
              class="time-block"
              :class="[
                block.gender,
                {
                  reservation: block.isReservation,
                  'in-progress': block.isInProgress && !block.isReservation,
                  settled: block.isSettled && !block.isReservation,
                  cancelled: block.isCancelled,
                  'group-color-0': block.groupSize > 1 && block.groupColorIndex === 0,
                  'group-color-1': block.groupSize > 1 && block.groupColorIndex === 1,
                  'group-color-2': block.groupSize > 1 && block.groupColorIndex === 2,
                }
              ]"
              :style="{ left: block.left, width: block.width }"
              @click="$emit('blockClick', block)"
            >
              <div class="block-content">
                <div class="block-customer">{{ block.customerName }}<span class="block-phone"> | {{ block.phone || '无号码' }}</span></div>
                <div class="block-time">
                  {{ block.startTime }}-{{ block.endTime }}
                  <span v-if="block.isClockIn">[点]</span><span v-else>[轮]</span>
                  <span v-if="block.isExtraTime">[加]</span>
                  <span v-if="block.requirement">[{{ block.requirement }}]</span>
                </div>
                <div class="block-info">{{ block.project }} | {{ block.room }}</div>
              </div>
            </div>

            <div
              v-for="slot in item.availableSlots"
              :key="slot.left"
              class="available-slot"
              :style="{ left: slot.left, width: slot.width }"
            >
              <span class="slot-text">{{ slot.displayText }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConsultationRecord, ReservationRecord } from "./cashier.types";

const HOUR_WIDTH = 90;
const TIMELINE_START = 10;
const timeLabels = ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "00", "01"];

const props = defineProps<{
  consultations: ConsultationRecord[];
  reservations: ReservationRecord[];
  cancelledReservations: ReservationRecord[];
  staff: Array<{ _id: string; name: string; gender?: string }>;
  schedules: Array<{ staffId: string; shift: string }>;
  rotationList: Array<{ staffId: string; name: string; shift: string; availableSlots: string }>;
}>();

defineEmits<{
  blockClick: [block: TimeBlockData];
}>();

const shiftLabels: Record<string, string> = { morning: "早", evening: "晚", overtime: "加" };

const containerWidth = computed(() => (timeLabels.length + 1) * HOUR_WIDTH);

interface TimeBlockData {
  _id: string;
  startTime: string;
  endTime: string;
  left: string;
  width: string;
  customerName: string;
  phone: string;
  gender: string;
  room: string;
  project: string;
  isReservation: boolean;
  isSettled: boolean;
  isInProgress: boolean;
  isClockIn: boolean;
  isExtraTime: boolean;
  isCancelled: boolean;
  requirement: string;
  groupKey: string;
  groupColorIndex: number;
  groupSize: number;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  let hours = h;
  if (hours < TIMELINE_START) hours += 24;
  return (hours - TIMELINE_START) * 60 + m;
}

const staffTimeline = computed(() => {
  const activeRecords = props.consultations.filter((r) => !r.isVoided);
  const staffMap = new Map(props.staff.map((s) => [s._id, s]));
  const scheduledIds = new Set(props.schedules.map((s) => s.staffId));
  const rotationMap = new Map(props.rotationList.map((r) => [r.staffId, r]));

  const rows: Array<{
    _id: string;
    name: string;
    gender: string;
    shift: string;
    highlighted: boolean;
    rotationCount: number;
    blocks: TimeBlockData[];
    availableSlots: Array<{ left: string; width: string; displayText: string }>;
  }> = [];

  for (const s of props.staff) {
    if (!scheduledIds.has(s._id)) continue;
    const schedule = props.schedules.find((sc) => sc.staffId === s._id);
    const shift = schedule?.shift || "morning";
    if (shift !== "morning" && shift !== "evening" && shift !== "overtime") continue;

    const rawBlocks: any[] = [];

    for (const r of activeRecords) {
      if (r.technician === s.name) {
        rawBlocks.push({ ...r, isReservation: false });
      }
    }

    for (const r of props.reservations) {
      if (r.technicianName === s.name || r.technicianId === s._id) {
        rawBlocks.push({
          _id: r._id,
          surname: r.customerName,
          phone: r.phone || "",
          gender: r.gender,
          project: r.project,
          room: "预约",
          date: r.date,
          customerName: r.customerName,
          startTime: r.startTime,
          endTime: r.endTime,
          extraTime: 0,
          isClockIn: r.isClockIn || false,
          isReservation: true,
          technician: r.technicianName,
          requirementType: r.requirementType,
          requiredMaleCount: r.requiredMaleCount,
          requiredFemaleCount: r.requiredFemaleCount,
          groupKey: r.groupKey || "",
        });
      }
    }

    for (const r of props.cancelledReservations) {
      if (r.technicianName === s.name || r.technicianId === s._id) {
        rawBlocks.push({
          _id: r._id,
          surname: r.customerName,
          phone: r.phone || "",
          gender: r.gender,
          project: r.project,
          room: "已取消",
          date: r.date,
          customerName: r.customerName,
          startTime: r.startTime,
          endTime: r.endTime,
          extraTime: 0,
          isClockIn: r.isClockIn || false,
          isReservation: true,
          isCancelled: true,
          technician: r.technicianName,
          requirementType: r.requirementType,
          requiredMaleCount: r.requiredMaleCount,
          requiredFemaleCount: r.requiredFemaleCount,
          groupKey: r.groupKey || "",
        });
      }
    }

    rawBlocks.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    const blocks: TimeBlockData[] = rawBlocks.map((r) => {
      const totalMinutes = timeLabels.length * 60;
      const left = (toMinutes(r.startTime) / totalMinutes) * 100;
      const dur = toMinutes(r.endTime) - toMinutes(r.startTime);
      const width = (dur / totalMinutes) * 100;
      const isSettled = !r.isReservation && !!r.settlement;
      let req = "";
      if (r.requirementType === "gender") {
        if (r.requiredMaleCount) req += r.requiredMaleCount + "男";
        if (r.requiredFemaleCount) req += r.requiredFemaleCount + "女";
      }
      return {
        _id: r._id,
        startTime: r.startTime,
        endTime: r.endTime,
        left: left.toFixed(4) + "%",
        width: width.toFixed(4) + "%",
        customerName: r.surname + (r.gender === "male" ? "先生" : "女士"),
        phone: r.phone || "",
        gender: r.gender,
        room: r.room,
        project: r.project,
        isReservation: r.isReservation,
        isSettled,
        isInProgress: false,
        isClockIn: r.isClockIn || false,
        isExtraTime: r.isExtraTime || false,
        isCancelled: r.isCancelled || false,
        requirement: req,
        groupKey: r.groupKey || "",
        groupColorIndex: 0,
        groupSize: 1,
      };
    });

    const rotationCount = blocks.filter((b) => !b.isClockIn && !b.isReservation && !b.isCancelled).length;
    const activeBlocks = blocks.filter((b) => !b.isCancelled);

    const rotationItem = rotationMap.get(s._id);
    let availableSlots: Array<{ left: string; width: string; displayText: string }> = [];
    if (rotationItem?.availableSlots) {
      availableSlots = [{ left: "0%", width: "100%", displayText: "可约: " + rotationItem.availableSlots }];
    }

    rows.push({
      _id: s._id,
      name: s.name,
      gender: s.gender || "male",
      shift,
      highlighted: false,
      rotationCount,
      blocks,
      availableSlots,
    });
  }

  rows.sort((a) => (a.gender === "male" ? 1 : -1));

  return rows;
});

const scrollRef = ref<HTMLElement | null>(null);
</script>

<style scoped>
.timeline-wrapper { width: 100%; }
.timeline-scroll { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
.timeline-container { position: relative; min-height: 80px; }

.time-axis { display: flex; border-bottom: 1px solid #e5e7eb; padding: 4px 0; background: #f9fafb; }
.time-axis-spacer { flex-shrink: 0; }
.time-mark { flex-shrink: 0; font-size: 11px; color: #9ca3af; text-align: left; padding-left: 2px; position: relative; }
.time-mark::before { content: ''; position: absolute; left: 0; top: 14px; width: 1px; height: 5px; background: #d1d5db; }

.staff-row { display: flex; border-bottom: 1px dashed #e5e7eb; align-items: stretch; min-height: 62px; transition: background 0.2s; background: #fff; }
.staff-row.highlighted { background: rgba(239, 68, 68, 0.05); }

.staff-name-col { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 13px; font-weight: 500; color: #1f2937; border-right: 1px solid #f3f4f6; background: #fafafa; }
.staff-name-col .staff-name { font-size: 14px; }
.staff-name-col .rotation-count { font-size: 10px; color: #9ca3af; }
.shift-tag { font-size: 10px; padding: 1px 6px; border-radius: 3px; margin-top: 2px; }
.shift-tag.morning { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.shift-tag.evening { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
.shift-tag.overtime { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

.timeline-track { flex: 1; position: relative; display: flex; background: rgba(249, 250, 251, 0.5); overflow: hidden; }
.grid-line { flex: 1; border-left: 1px solid rgba(0, 0, 0, 0.03); }

.time-block { position: absolute; top: 4px; bottom: 4px; border-radius: 4px; overflow: hidden; cursor: pointer; z-index: 1; display: flex; align-items: center; }
.time-block:not(.reservation) { background: #52c41a; }
.time-block.settled { background: #52c41a; }
.time-block.in-progress { background: #f97316; }
.time-block.reservation { opacity: 0.85; }
.time-block.reservation.male { background: #1890ff; }
.time-block.reservation.female { background: #ec4899; }
.time-block.cancelled { background: #9ca3af !important; opacity: 0.3 !important; pointer-events: none; }
.time-block:hover { filter: brightness(0.9); }

.block-content { padding: 1px 4px; overflow: hidden; width: 100%; }
.block-customer { font-size: 10px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.block-phone { font-size: 9px; font-weight: 400; }
.block-time { font-size: 9px; color: rgba(255, 255, 255, 0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.block-info { font-size: 9px; color: rgba(255, 255, 255, 0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.available-slot { position: absolute; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; }
.slot-text { font-size: 10px; color: rgba(0, 0, 0, 0.2); white-space: nowrap; }
</style>
