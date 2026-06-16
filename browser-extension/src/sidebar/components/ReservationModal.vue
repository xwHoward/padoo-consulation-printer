<template>
  <Modal
    :show="show"
    :title="form._id ? '编辑预约' : '新增预约'"
    size="large"
    :loading="submitting"
    loading-text="保存中..."
    @cancel="$emit('close')"
    @confirm="handleConfirm"
  >
    <div class="cp-reserve">
      <!-- 日期和开始时间 -->
      <div class="cp-reserve-row">
        <div class="cp-reserve-field">
          <span class="cp-reserve-label">日期</span>
          <input type="date" class="cp-input" v-model="form.date" />
        </div>
        <div class="cp-reserve-field">
          <span class="cp-reserve-label">开始时间</span>
          <input type="time" class="cp-input" v-model="form.startTime" />
        </div>
      </div>

      <!-- 姓名和性别 -->
      <div class="cp-reserve-row">
        <div class="cp-reserve-field cp-reserve-field--wide">
          <span class="cp-reserve-label">姓名</span>
          <input
            class="cp-input"
            placeholder="输入顾客姓名"
            v-model="form.customerName"
            @input="onCustomerInput"
          />
        </div>
        <div class="cp-reserve-field">
          <GenderSelector v-model="form.gender" />
        </div>
      </div>

      <!-- 手机号 -->
      <div class="cp-reserve-row">
        <div class="cp-reserve-field cp-reserve-field--wide">
          <span class="cp-reserve-label">手机号</span>
          <input
            class="cp-input"
            type="tel"
            maxlength="11"
            placeholder="选填"
            v-model="form.phone"
            @input="onCustomerInput"
          />
        </div>
      </div>

      <!-- 顾客匹配结果 -->
      <div v-if="matchedCustomer" class="cp-match">
        <div class="cp-match-header">
          <span class="cp-match-name">
            {{ matchedCustomer.name }}{{ matchedCustomer.gender === 'male' ? '先生' : '女士' }}
          </span>
          <span class="cp-match-phone" v-if="matchedCustomer.phone">{{ matchedCustomer.phone }}</span>
        </div>
        <div class="cp-match-tech" v-if="matchedCustomer.responsibleTechnician">
          责任技师：{{ matchedCustomer.responsibleTechnician }}
        </div>
        <div class="cp-match-remark" v-if="matchedCustomer.remark">{{ matchedCustomer.remark }}</div>
        <div class="cp-match-actions">
          <button v-if="!matchedCustomerApplied" class="cp-btn-xs cp-btn-xs--apply" @click="onApplyMatch">
            应用
          </button>
          <button class="cp-btn-xs cp-btn-xs--clear" @click="onClearMatch">清除</button>
        </div>
      </div>

      <!-- 项目 -->
      <div class="cp-reserve-row">
        <div class="cp-reserve-field cp-reserve-field--wide">
          <span class="cp-reserve-label">项目</span>
          <ProjectSelector
            :projects="projects"
            :selectedProjects="form.projects"
            :multi="true"
            @change="onProjectChange"
          />
        </div>
      </div>

      <!-- 技师需求类型 -->
      <div class="cp-reserve-row">
        <div class="cp-reserve-field cp-reserve-field--wide">
          <span class="cp-reserve-label">技师需求</span>
          <div class="cp-req-type">
            <label class="cp-req-opt">
              <input type="radio" value="specific" v-model="form.requirementType" />
              <span>点钟</span>
            </label>
            <label class="cp-req-opt">
              <input type="radio" value="gender" v-model="form.requirementType" />
              <span>轮钟</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 指定技师（点钟） -->
      <div class="cp-reserve-row" v-if="form.requirementType === 'specific'">
        <div class="cp-reserve-field cp-reserve-field--wide">
          <span class="cp-reserve-label">
            技师<span v-if="form.selectedTechnicians.length">({{ form.selectedTechnicians.length }})</span>
          </span>
          <TechnicianSelector
            :technicianList="staffAvailability"
            :selectedTechnicians="form.selectedTechnicians"
            :multi="true"
            @change="onTechnicianChange"
          />
        </div>
      </div>

      <!-- 性别需求（轮钟） -->
      <div class="cp-reserve-row" v-if="form.requirementType === 'gender'">
        <div class="cp-reserve-field cp-reserve-field--wide">
          <div class="cp-gender-counters">
            <div class="cp-gc-item">
              <span class="cp-gc-label">男技师</span>
              <div class="cp-gc-ctrls">
                <button class="cp-gc-btn" @click="changeGenderCount('male', -1)">-</button>
                <span class="cp-gc-val">{{ form.genderRequirement.male }}</span>
                <button class="cp-gc-btn" @click="changeGenderCount('male', 1)">+</button>
              </div>
            </div>
            <div class="cp-gc-item">
              <span class="cp-gc-label">女技师</span>
              <div class="cp-gc-ctrls">
                <button class="cp-gc-btn" @click="changeGenderCount('female', -1)">-</button>
                <span class="cp-gc-val">{{ form.genderRequirement.female }}</span>
                <button class="cp-gc-btn" @click="changeGenderCount('female', 1)">+</button>
              </div>
            </div>
          </div>
          <div class="cp-avail-hint" v-if="staffAvailability.length">
            <span>可用男：{{ availableMaleCount }}位</span>
            <span>可用女：{{ availableFemaleCount }}位</span>
          </div>
        </div>
      </div>

      <!-- 续约 -->
      <div class="cp-reserve-row">
        <label class="cp-renewal">
          <input type="checkbox" v-model="form.isRenewal" />
          <span>是否续约</span>
        </label>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import { ref } from 'vue'
import Modal from './Modal.vue'
import GenderSelector from './GenderSelector.vue'
import ProjectSelector from './ProjectSelector.vue'
import TechnicianSelector from './TechnicianSelector.vue'
import { useCustomerMatch } from '../composables/useCustomerMatch.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  form: { type: Object, default: () => ({}) },
  projects: { type: Array, default: () => [] },
  staffAvailability: { type: Array, default: () => [] },
  availableMaleCount: { type: Number, default: 0 },
  availableFemaleCount: { type: Number, default: 0 },
  submitting: { type: Boolean, default: false }
})

const emit = defineEmits([
  'close', 'confirm',
  'update:form', 'fieldChange',
  'projectChange', 'technicianChange', 'requirementTypeChange',
  'genderCountChange',
  'matchApply', 'matchClear', 'customerSearch'
])

const { matchedCustomer, matchedCustomerApplied, searchCustomer, clearMatchedCustomer } = useCustomerMatch()

function handleConfirm() {
  emit('confirm')
}

function onProjectChange(projects) {
  emit('projectChange', projects)
}

function onTechnicianChange(technicians) {
  emit('technicianChange', technicians)
}

function changeGenderCount(gender, delta) {
  emit('genderCountChange', { gender, delta })
}

function onCustomerInput() {
  emit('customerSearch')
}

function onApplyMatch() {
  emit('matchApply')
}

function onClearMatch() {
  // emit('matchClear')
}

// Expose matchedCustomer for parent
defineExpose({ matchedCustomer, matchedCustomerApplied })
</script>

<style lang="less" scoped>
.cp-reserve {
  .cp-reserve-row {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid #f0f2f5;
    align-items: flex-start;

    &:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  }

  .cp-reserve-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;

    &--wide { flex: 2; }
  }

  .cp-reserve-label {
    font-size: 12px;
    color: #888;
    font-weight: 500;
  }

  .cp-input {
    padding: 7px 10px;
    border: 1px solid #d0d5dd;
    border-radius: 4px;
    font-size: 13px;
    color: #333;
    outline: none;
    background: #fff;
    transition: border-color 0.2s;

    &::placeholder { color: #b0b8c1; }

    &:focus {
      border-color: #4a6cf7;
      box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.1);
    }
  }

  .cp-req-type {
    display: flex;
    gap: 16px;

    .cp-req-opt {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: #555;
      cursor: pointer;

      input[type="radio"] { accent-color: #4a6cf7; }
    }
  }

  .cp-gender-counters {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;

    .cp-gc-item {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: #f8f9fb;
      border-radius: 6px;
      border: 1px solid #ebeef5;

      .cp-gc-label { font-size: 12px; color: #666; font-weight: 500; }

      .cp-gc-ctrls {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .cp-gc-btn {
        width: 26px;
        height: 26px;
        border: 1px solid #d0d5dd;
        background: #fff;
        border-radius: 4px;
        font-size: 15px;
        color: #666;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;

        &:hover {
          background: #4a6cf7;
          color: #fff;
          border-color: #4a6cf7;
        }
      }

      .cp-gc-val {
        min-width: 20px;
        text-align: center;
        font-size: 16px;
        font-weight: 600;
        color: #4a6cf7;
      }
    }
  }

  .cp-avail-hint {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: #888;
  }

  .cp-renewal {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #555;
    cursor: pointer;

    input[type="checkbox"] { accent-color: #4a6cf7; }
  }
}

// Customer match
.cp-match {
  margin-bottom: 12px;
  padding: 10px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  font-size: 12px;

  .cp-match-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .cp-match-name { font-weight: 600; color: #166534; }
  .cp-match-phone { color: #666; }
  .cp-match-tech { color: #555; margin-bottom: 2px; }
  .cp-match-remark { color: #888; font-size: 11px; white-space: pre-line; }

  .cp-match-actions {
    margin-top: 6px;
    display: flex;
    gap: 6px;
  }
}

.cp-btn-xs {
  padding: 3px 10px;
  border: none;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s;

  &--apply { background: #16a34a; color: #fff; &:hover { background: #15803d; } }
  &--clear { background: #e8ecf1; color: #666; &:hover { background: #d0d5dd; } }
}
</style>
