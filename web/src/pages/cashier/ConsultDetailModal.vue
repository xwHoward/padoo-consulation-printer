<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    @click.self="$emit('close')"
  >
    <div class="w-full max-w-md rounded-lg bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h3 class="text-lg font-semibold text-gray-900">咨询单详情</h3>
        <button
          class="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          @click="$emit('close')"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="px-6 py-4" v-if="record">
        <div class="mb-3 flex items-center gap-2">
          <span
            class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
            :class="record.isVoided ? 'bg-red-100 text-red-700' : (record.settlement ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')"
          >
            {{ record.isVoided ? '已作废' : (record.settlement ? '已结算' : '进行中') }}
          </span>
          <span v-if="record.isClockIn" class="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            点钟
          </span>
          <span v-if="record.isExtraTime" class="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
            加钟
          </span>
        </div>

        <dl class="space-y-3">
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">客户</dt>
            <dd class="text-sm text-gray-900">{{ record.surname }}{{ record.gender === 'male' ? '先生' : '女士' }}</dd>
          </div>
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">电话</dt>
            <dd class="text-sm text-gray-900">{{ record.phone || '-' }}</dd>
          </div>
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">项目</dt>
            <dd class="text-sm text-gray-900">{{ record.project }}</dd>
          </div>
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">技师</dt>
            <dd class="text-sm text-gray-900">{{ record.technician || '-' }}</dd>
          </div>
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">房间</dt>
            <dd class="text-sm text-gray-900">{{ record.room || '-' }}</dd>
          </div>
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">时间</dt>
            <dd class="text-sm text-gray-900">{{ record.date }} {{ record.startTime }}-{{ record.endTime }}</dd>
          </div>
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">力度</dt>
            <dd class="text-sm text-gray-900">{{ massageStrengthMap[record.massageStrength] || record.massageStrength || '-' }}</dd>
          </div>
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">精油</dt>
            <dd class="text-sm text-gray-900">{{ record.essentialOil || '无' }}</dd>
          </div>
          <div class="flex">
            <dt class="w-20 shrink-0 text-sm text-gray-500">备注</dt>
            <dd class="text-sm text-gray-900">{{ record.remarks || '无' }}</dd>
          </div>

          <template v-if="record.settlement">
            <div class="border-t border-gray-200 pt-3">
              <dt class="mb-2 text-sm font-medium text-gray-700">结算信息</dt>
            </div>
            <div class="flex">
              <dt class="w-20 shrink-0 text-sm text-gray-500">实收</dt>
              <dd class="text-sm font-semibold text-gray-900">¥{{ record.settlement.totalAmount }}</dd>
            </div>
            <div class="flex" v-for="(pay, idx) in record.settlement.payments" :key="idx">
              <dt class="w-20 shrink-0 text-sm text-gray-500">{{ paymentLabels[pay.method] || pay.method }}</dt>
              <dd class="text-sm text-gray-900">
                {{ pay.method === 'membership' ? pay.amount + '次' : '¥' + pay.amount }}
                <span v-if="pay.couponCode" class="text-gray-400">({{ pay.couponCode }})</span>
              </dd>
            </div>
            <div class="flex">
              <dt class="w-20 shrink-0 text-sm text-gray-500">结算时间</dt>
              <dd class="text-sm text-gray-900">{{ formatTime(record.settlement.settledAt) }}</dd>
            </div>
          </template>
        </dl>
      </div>

      <div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
        <button
          v-if="!record?.isVoided && !record?.settlement"
          class="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          @click="$emit('void')"
        >
          作废
        </button>
        <button
          v-if="!record?.isVoided && !record?.settlement"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          @click="$emit('settle')"
        >
          结算
        </button>
        <button
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          @click="$emit('close')"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConsultationRecord } from "./cashier.types";
import { COUPON_PLATFORM_NAMES, formatSettlementTime } from "./cashier.types";

defineProps<{
  visible: boolean;
  record: ConsultationRecord | null;
}>();

defineEmits<{
  close: [];
  settle: [];
  void: [];
}>();

const massageStrengthMap: Record<string, string> = {
  standard: "标准",
  soft: "轻柔",
  gravity: "重力",
};

const paymentLabels: Record<string, string> = COUPON_PLATFORM_NAMES;

function formatTime(isoStr: string): string {
  return formatSettlementTime(isoStr);
}
</script>
