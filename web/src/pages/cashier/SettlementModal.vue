<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    @click.self="$emit('close')"
  >
    <div class="w-full max-w-lg rounded-lg bg-white shadow-xl">
      <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h3 class="text-lg font-semibold text-gray-900">结算</h3>
        <button
          class="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          @click="$emit('close')"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="px-6 py-4">
        <div class="mb-4 rounded-lg bg-gray-50 p-3">
          <div class="text-sm text-gray-500">
            {{ record.surname }}{{ record.gender === 'male' ? '先生' : '女士' }}
            · {{ record.project }}
            · {{ record.technician || '未指定' }}
          </div>
          <div class="mt-1 text-sm text-gray-400">
            {{ record.date }} {{ record.startTime }}-{{ record.endTime }}
          </div>
        </div>

        <div class="mb-3 text-sm font-medium text-gray-700">支付方式</div>

        <div class="space-y-2">
          <div
            v-for="(method, index) in paymentMethods"
            :key="method.key"
            class="flex items-center gap-3 rounded-lg border p-3"
            :class="method.selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'"
          >
            <label class="flex flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                :checked="method.selected"
                class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                @change="toggleMethod(index)"
              />
              <span class="text-sm font-medium text-gray-700">{{ method.label }}</span>
            </label>

            <div v-if="method.selected && method.key !== 'free'" class="flex items-center gap-2">
              <input
                v-model="method.amount"
                type="text"
                inputmode="decimal"
                class="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                :placeholder="method.key === 'membership' ? '次数' : '金额'"
                @input="recalculate"
              />
              <span class="text-xs text-gray-400">{{ method.key === 'membership' ? '次' : '元' }}</span>
            </div>

            <input
              v-if="method.selected && method.key !== 'free' && method.key !== 'membership'"
              v-model="method.couponCode"
              type="text"
              class="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="券码"
            />
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between border-t border-gray-200 pt-3">
          <div class="text-sm text-gray-500">
            实收合计：<span class="text-lg font-bold text-gray-900">¥{{ totalAmount }}</span>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
        <button
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          @click="$emit('close')"
        >
          取消
        </button>
        <button
          :disabled="submitting"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          @click="handleConfirm"
        >
          {{ submitting ? '结算中...' : '确认结算' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { ConsultationRecord, PaymentMethodItem } from "./cashier.types";
import { COUPON_PLATFORM_NAMES, COUPON_PLATFORM_KEYS } from "./cashier.types";

const props = defineProps<{
  visible: boolean;
  record: ConsultationRecord;
  projectPrice: number;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payments: Array<{ method: string; amount: number; couponCode?: string }>, totalAmount: number];
}>();

const submitting = ref(false);

const paymentMethods = ref<PaymentMethodItem[]>(
  COUPON_PLATFORM_KEYS.map((key) => ({
    key,
    label: COUPON_PLATFORM_NAMES[key] || key,
    selected: false,
    amount: "",
    couponCode: "",
  }))
);

initFromRecord();

watch(() => props.record._id, () => {
  initFromRecord();
});

function initFromRecord() {
  paymentMethods.value = COUPON_PLATFORM_KEYS.map((key) => ({
    key,
    label: COUPON_PLATFORM_NAMES[key] || key,
    selected: false,
    amount: "",
    couponCode: "",
  }));

  const settlement = props.record.settlement;
  if (settlement) {
    for (const payment of settlement.payments) {
      const method = paymentMethods.value.find((m) => m.key === payment.method);
      if (method) {
        method.selected = true;
        method.amount = String(payment.amount);
        method.couponCode = payment.couponCode || "";
      }
    }
  }
}

const totalAmount = computed(() => {
  let total = 0;
  for (const method of paymentMethods.value) {
    if (method.selected && method.key !== "membership" && method.key !== "free") {
      const amount = parseFloat(method.amount);
      if (!isNaN(amount) && amount > 0) {
        total += amount;
      }
    }
  }
  return total;
});

function toggleMethod(index: number) {
  const methods = paymentMethods.value;
  const method = methods[index];

  if (!method.selected) {
    if (method.key === "free") {
      for (let i = 0; i < methods.length; i++) {
        if (i !== index) {
          methods[i].selected = false;
          methods[i].amount = "";
        }
      }
    } else {
      const freeIdx = methods.findIndex((m) => m.key === "free");
      if (freeIdx !== -1 && methods[freeIdx].selected) {
        methods[freeIdx].selected = false;
        methods[freeIdx].amount = "";
      }
    }
    methods[index].selected = true;
  } else {
    methods[index].selected = false;
    methods[index].amount = "";
  }
}

function recalculate() {}

async function handleConfirm() {
  const selected = paymentMethods.value.filter((m) => m.selected);

  if (selected.length === 0) {
    alert("请选择支付方式");
    return;
  }

  for (const method of selected) {
    if (method.key === "free") continue;
    const amount = parseFloat(method.amount);
    if (!method.amount || isNaN(amount) || amount <= 0) {
      const suffix = method.key === "membership" ? "次数" : "金额";
      alert(`请输入${method.label}的有效${suffix}`);
      return;
    }
  }

  submitting.value = true;

  const payments = selected.map((m) => ({
    method: m.key,
    amount: m.key === "free" ? 0 : parseFloat(m.amount) || 0,
    couponCode: m.couponCode || undefined,
  }));

  emit("confirm", payments, totalAmount.value);
}
</script>
