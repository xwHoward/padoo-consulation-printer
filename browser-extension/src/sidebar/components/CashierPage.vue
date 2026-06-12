<template>
  <div class="cp-cashier">
    <!-- 加载中 -->
    <div class="cp-cashier-loading" v-if="loading">
      <div class="cp-spinner"></div>
      <span>{{ loadingText }}</span>
    </div>

    <!-- 排钟 -->
    <div class="cp-section">
      <div class="cp-section-header">
        <span class="cp-section-title">排钟</span>
        <DatePicker
          v-model="selectedDate"
          @change="onDateChange"
        />
        <button v-if="canCreateReservation" class="cp-btn-text" @click="openReserveModal">
          +预约
        </button>
        <button v-if="canPushRotation" class="cp-btn-text" @click="onTimelineResetRotation">
          重置
        </button>
        <button
          v-if="canPushRotation && rotationList.length > 0"
          class="cp-btn-text"
          @click="onTimelinePushRotation"
        >
          推送
        </button>
      </div>
      <Timeline
        :rotationList="rotationList"
        :canAdjustRotation="canPushRotation"
        :selectedDate="selectedDate"
        @adjustRotation="onTimelineAdjustRotation"
        @resetRotation="onTimelineResetRotation"
        @pushRotation="onTimelinePushRotation"
      />
    </div>

    <!-- 快速预约 -->
    <div class="cp-section">
      <div class="cp-section-header">
        <span class="cp-section-title">预约</span>
      </div>
      <div class="cp-quick-counters">
        <div class="cp-qc-item">
          <span class="cp-qc-label">男技师</span>
          <div class="cp-qc-ctrls">
            <button @click="quickGenderChange('male', -1)">-</button>
            <span class="cp-qc-val">{{ qrSlots.maleCount }}</span>
            <button @click="quickGenderChange('male', 1)">+</button>
          </div>
        </div>
        <div class="cp-qc-item">
          <span class="cp-qc-label">女技师</span>
          <div class="cp-qc-ctrls">
            <button @click="quickGenderChange('female', -1)">-</button>
            <span class="cp-qc-val">{{ qrSlots.femaleCount }}</span>
            <button @click="quickGenderChange('female', 1)">+</button>
          </div>
        </div>
      </div>
      <div v-if="qrSlots.earliestTime && !qrLoading" class="cp-qr-earliest">
        最快可约：{{ qrSlots.earliestTime }}
      </div>
      <div v-if="qrLoading" class="cp-qr-loading">查询中...</div>
      <div v-if="!qrLoading && qrSlots.slots.length > 0" class="cp-qr-slots">
        <div v-for="slot in qrSlots.slots" :key="slot.time" class="cp-qr-slot" @click="copySlot(slot)">
          <span>{{ slot.time }}</span>
          <span v-if="slot.maleStaff?.length" class="cp-qr-staff cp-qr-staff--male">男：{{ slot.maleStaff.join(',') }}</span>
          <span v-if="slot.femaleStaff?.length" class="cp-qr-staff cp-qr-staff--female">女：{{ slot.femaleStaff.join(',') }}</span>
        </div>
      </div>
      <div v-if="!qrLoading && qrSlots.slots.length === 0 && (qrSlots.maleCount + qrSlots.femaleCount > 0)" class="cp-qr-empty">
        {{ qrSlots.emptyReason || '暂无可约时段' }}
      </div>
    </div>

    <!-- 房间 -->
    <div class="cp-section">
      <div class="cp-section-header">
        <span class="cp-section-title">房间</span>
      </div>
      <RoomGrid :rooms="rooms" />
    </div>

    <!-- Modal Layers -->
    <ReservationModal
      :show="showReserveModal"
      :form="reserveForm"
      :projects="projects"
      :staffAvailability="staffAvailability"
      :availableMaleCount="availableMaleCount"
      :availableFemaleCount="availableFemaleCount"
      :submitting="reserveSubmitting"
      @close="closeReserveModal"
      @confirm="confirmReserve"
      @fieldChange="onReserveFieldChange"
      @projectChange="onReserveProjectChange"
      @technicianChange="onReserveTechnicianChange"
      @genderCountChange="onReserveGenderCountChange"
      @customerSearch="onCustomerSearch"
      @matchApply="onMatchApply"
      @matchClear="onMatchClear"
    />

    <PushModal
      :show="pushModal.show"
      :message="pushModal.message"
      :loading="pushModal.loading"
      @cancel="onPushCancel"
      @confirm="onPushConfirm"
    />

    <ExtraTimeModal
      :show="extraTimeModal.show"
      :projects="projects"
      :selectedProject="extraTimeModal.selectedProject"
      :selectedProjectName="extraTimeModal.selectedProjectName"
      :quantity="extraTimeModal.quantity"
      @close="closeExtraTimeModal"
      @confirm="confirmExtraTime"
    />

    <ArrivalConfirmModal
      :show="arrivalConfirmModal.show"
      :customerName="arrivalConfirmModal.customerName"
      :project="arrivalConfirmModal.project"
      :technicianName="arrivalConfirmModal.technicianName"
      @close="arrivalConfirmModal.show = false"
      @push="confirmArrivalWithPush"
      @skip="confirmArrivalWithoutPush"
    />
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import DatePicker from './DatePicker.vue'
import Timeline from './Timeline.vue'
import RoomGrid from './RoomGrid.vue'
import ReservationModal from './ReservationModal.vue'
import PushModal from './PushModal.vue'
import ExtraTimeModal from './ExtraTimeModal.vue'
import ArrivalConfirmModal from './ArrivalConfirmModal.vue'
import { useDataLoader } from '../composables/useDataLoader.js'
import { useReservation } from '../composables/useReservation.js'
import { usePush } from '../composables/usePush.js'
import { useCustomerMatch } from '../composables/useCustomerMatch.js'

// --- State ---
const loading = ref(true)
const loadingText = ref('加载中...')
const selectedDate = ref(new Date().toISOString().slice(0, 10))
const rooms = ref([])
const rotationList = ref([])
const projects = ref([])
const activeStaffList = ref([])
const staffAvailability = ref([])
const availableMaleCount = ref(0)
const availableFemaleCount = ref(0)
const canCreateReservation = ref(true)
const canPushRotation = ref(true)

// Quick reservation
const qrSlots = reactive({ maleCount: 0, femaleCount: 2, earliestTime: '', slots: [], emptyReason: '' })
const qrLoading = ref(false)

// Reservation
const showReserveModal = ref(false)
const reserveForm = reactive({
  _id: '', date: '', customerName: '', gender: 'male',
  projects: [], phone: '', requirementType: 'gender',
  selectedTechnicians: [], genderRequirement: { male: 0, female: 0 },
  startTime: '', technicianId: '', technicianName: '', isRenewal: false
})
const reserveSubmitting = ref(false)
const editingGroupIds = ref([])
const originalReservation = ref(null)

// Push
const pushModal = reactive({ show: false, loading: false, type: 'create', message: '', reservationData: null })

// Extra time
const extraTimeModal = reactive({
  show: false, sourceRecordId: '',
  projects: [], selectedProject: '', selectedProjectName: '', quantity: 1
})

// Arrival confirm
const arrivalConfirmModal = reactive({
  show: false, reserveId: '', customerName: '', project: '', technicianName: ''
})

// --- Composables ---
const dataLoaderComposable = useDataLoader()
const reservationComposable = useReservation()
const pushComposable = usePush()

// --- Methods ---
async function loadInitialData() {
  loading.value = true
  try {
    const result = await dataLoaderComposable.loadInitialData(selectedDate.value)
    if (result) {
      Object.assign(qrSlots, result.quickReservationSlots)
      rooms.value = result.rooms
      rotationList.value = result.rotationList
      activeStaffList.value = result.activeStaffList
    }
  } catch (e) {
    console.error('[Cashier] loadInitialData failed:', e)
  } finally {
    loading.value = false
  }
}

async function onDateChange(date) {
  selectedDate.value = date
  await dataLoaderComposable.loadTimelineData(selectedDate.value, {
    maleCount: qrSlots.maleCount,
    femaleCount: qrSlots.femaleCount
  }).then(result => {
    if (result) {
      rotationList.value = result.rotationList
      Object.assign(qrSlots, result.quickReservationSlots)
    }
  }).catch(() => {})
}

// Quick reservation
async function quickGenderChange(gender, delta) {
  if (gender === 'male') {
    qrSlots.maleCount = Math.max(0, qrSlots.maleCount + delta)
  } else {
    qrSlots.femaleCount = Math.max(0, qrSlots.femaleCount + delta)
  }
  qrLoading.value = true
  try {
    const result = await dataLoaderComposable.loadQuickReservationSlots(
      selectedDate.value, qrSlots.maleCount, qrSlots.femaleCount
    )
    qrSlots.earliestTime = result.earliestTime
    qrSlots.slots = result.slots
    qrSlots.emptyReason = result.emptyReason || ''
  } catch { /* ignore */ }
  qrLoading.value = false
}

async function copySlot(slot) {
  const timeStr = slot.time || ''
  const parts = []
  if (qrSlots.maleCount > 0) parts.push(`${qrSlots.maleCount}位男技师`)
  if (qrSlots.femaleCount > 0) parts.push(`${qrSlots.femaleCount}位女技师`)
  const label = parts.join('+') || ''
  const message = `您好，目前${label}可预约时段为${timeStr}哦，您可以告诉小趴到店时间，小趴给您保留预约哦~`

  const success = await pushComposable.copyToClipboard(message)
  if (success) {
    alert('已复制到剪贴板')
  }
}

// Reservation
async function openReserveModal() {
  const now = new Date()
  const minutes = now.getMinutes()
  const roundedMinutes = Math.ceil(minutes / 5) * 5
  const startTime = new Date(now)
  if (roundedMinutes >= 60) {
    startTime.setHours(now.getHours() + 1)
    startTime.setMinutes(0)
  } else {
    startTime.setMinutes(roundedMinutes)
  }
  const timeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`

  Object.assign(reserveForm, reservationComposable.createDefaultReserveForm(selectedDate.value))
  reserveForm.startTime = timeStr
  editingGroupIds.value = []
  originalReservation.value = null
  showReserveModal.value = true

  await checkStaffAvail()
}

async function closeReserveModal() {
  showReserveModal.value = false
  await loadInitialData()
}

async function checkStaffAvail() {
  const result = await reservationComposable.checkStaffAvailability({ ...reserveForm })
  staffAvailability.value = result.staffAvailability
  availableMaleCount.value = result.availableMaleCount
  availableFemaleCount.value = result.availableFemaleCount
}

async function confirmReserve() {
  reserveSubmitting.value = true
  try {
    const result = await reservationComposable.confirmReserve(
      { ...reserveForm }, editingGroupIds.value
    )
    if (result?.success) {
      showReserveModal.value = false
      await loadInitialData()
      alert('预约成功')
    }
  } catch (e) {
    alert(e.message || '保存失败')
  } finally {
    reserveSubmitting.value = false
  }
}

function onReserveFieldChange(field, value) {
  reserveForm[field] = value
}

function onReserveProjectChange(projects) {
  reserveForm.projects = projects
  checkStaffAvail()
}

function onReserveTechnicianChange(technicians) {
  reserveForm.selectedTechnicians = technicians
}

function onReserveGenderCountChange({ gender, delta }) {
  if (gender === 'male') {
    reserveForm.genderRequirement.male = Math.max(0, reserveForm.genderRequirement.male + delta)
  } else {
    reserveForm.genderRequirement.female = Math.max(0, reserveForm.genderRequirement.female + delta)
  }
}

function onCustomerSearch() {
  reservationComposable.searchCustomer(
    reserveForm.customerName,
    reserveForm.gender,
    reserveForm.phone
  )
}

function onMatchApply() {
  const result = reservationComposable.applyMatchedCustomer(
    { ...reserveForm },
    [...staffAvailability.value]
  )
  Object.assign(reserveForm, result.reserveForm)
  staffAvailability.value = result.staffAvailability
}

function onMatchClear() {
  reservationComposable.clearMatchedCustomer()
}

// Timeline actions
function onTimelineAdjustRotation({ index, direction }) {
  const list = [...rotationList.value]
  let toIdx = index
  if (direction === 'up' && index > 0) toIdx = index - 1
  else if (direction === 'down' && index < list.length - 1) toIdx = index + 1
  else return

  ;[list[index], list[toIdx]] = [list[toIdx], list[index]]
  rotationList.value = list
  alert('轮牌已调整（开发模式下本地生效）')
}

function onTimelineResetRotation() {
  alert('重置轮牌（需云函数支持）')
}

function onTimelinePushRotation() {
  const message = pushComposable.buildRotationMessage(rotationList.value, selectedDate.value)
  pushModal.show = true
  pushModal.message = message
  pushModal.type = 'create'
  pushModal.loading = false
}

function onPushCancel() {
  pushModal.show = false
}

async function onPushConfirm() {
  pushModal.loading = true
  try {
    const result = await pushComposable.sendWechatMessage(pushModal.message)
    if (result?.code === 0) {
      alert('推送成功')
      pushModal.show = false
    } else {
      throw new Error(result?.message || '推送失败')
    }
  } catch (e) {
    alert(e.message || '推送失败')
  } finally {
    pushModal.loading = false
  }
}

// Extra time
function closeExtraTimeModal() { extraTimeModal.show = false }
function confirmExtraTime() { alert('加钟功能开发中'); extraTimeModal.show = false }

// Arrival
function confirmArrivalWithPush() { arrivalConfirmModal.show = false; alert('到店通知已推送') }
function confirmArrivalWithoutPush() { arrivalConfirmModal.show = false }

// --- Init ---
loadInitialData()
</script>

<style lang="less" scoped>
.cp-cashier {
  padding: 4px 0;
}

.cp-cashier-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 12px;
  color: #888;
  font-size: 13px;

  .cp-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid #e8ecf1;
    border-top-color: #4a6cf7;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
}

.cp-section {
  margin-bottom: 12px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  padding: 12px;
  background: #fff;

  .cp-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .cp-section-title {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    padding-left: 8px;
    border-left: 3px solid #4a6cf7;
    margin-right: auto;
  }
}

.cp-btn-text {
  font-size: 12px;
  color: #4a6cf7;
  border: 1px solid #4a6cf7;
  background: transparent;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;

  &:hover { background: #eef1ff; }
}

// Quick reservation
.cp-quick-counters {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;

  .cp-qc-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #f8f9fb;
    border-radius: 6px;
    border: 1px solid #ebeef5;

    .cp-qc-label {
      font-size: 12px;
      color: #666;
      font-weight: 500;
    }

    .cp-qc-ctrls {
      display: flex;
      align-items: center;
      gap: 4px;

      button {
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

      .cp-qc-val {
        min-width: 20px;
        text-align: center;
        font-size: 16px;
        font-weight: 600;
        color: #4a6cf7;
      }
    }
  }
}

.cp-qr-earliest {
  padding: 8px 12px;
  background: rgba(0, 168, 107, 0.08);
  border: 1px solid rgba(0, 168, 107, 0.2);
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #00A86B;
}

.cp-qr-loading {
  text-align: center;
  padding: 12px;
  color: #999;
  font-size: 12px;
}

.cp-qr-slots {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;

  .cp-qr-slot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: #4a6cf7;
    padding: 6px 10px;
    background: rgba(74, 108, 247, 0.05);
    border-radius: 4px;
    border: 1px solid rgba(74, 108, 247, 0.12);
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: rgba(74, 108, 247, 0.1);
    }

    .cp-qr-staff {
      font-size: 10px;
      &--male { color: #1890ff; }
      &--female { color: #eb2f96; }
    }
  }
}

.cp-qr-empty {
  text-align: center;
  padding: 12px;
  color: #999;
  font-size: 12px;
}
</style>
