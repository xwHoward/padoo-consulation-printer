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
      <!-- 加载中 -->
      <div class="cp-qr-loading" v-if="quickReservationLoading">查询中...</div>
      <!-- 5种固定组合 -->
      <div class="cp-quick-groups" v-if="!quickReservationLoading && quickReservationGroups.length > 0">
        <div
          v-for="group in quickReservationGroups"
          :key="group.key"
          class="cp-quick-group-item"
          @click="copyGroupSlot(group)"
        >
          <span class="cp-group-label">{{ group.label }}</span>
          <span v-if="group.earliestTime" class="cp-group-time">{{ group.earliestTime }}</span>
          <span v-else class="cp-group-empty">{{ group.emptyReason || '暂无' }}</span>
        </div>
      </div>
      <div v-if="!quickReservationLoading && quickReservationGroups.length === 0" class="cp-qr-empty">
        暂无可约时段
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
      :quantity="extraTimeModal.quantity"
      @close="closeExtraTimeModal"
      @confirm="confirmExtraTime"
      @update:selectedProject="val => extraTimeModal.selectedProject = val"
      @update:selectedProjectName="val => extraTimeModal.selectedProjectName = val"
      @update:quantity="val => extraTimeModal.quantity = val"
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
import { callFunction as callCloudFunction, collection } from '../services/cloudbase.js'

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

// Quick reservation - 5 fixed groups
const quickReservationGroups = ref([])
const quickReservationLoading = ref(false)

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
  show: false, reserveId: '', customerName: '', project: '', technicianName: '',
  reservations: [] // store related reservations for processing
})

// --- Composables ---
const dataLoaderComposable = useDataLoader()
const reservationComposable = useReservation()
const pushComposable = usePush()

// --- Helpers ---
function parseProjectDuration(name) {
  const match = String(name).match(/(\d+)min/)
  return match ? parseInt(match[1]) : 0
}

function formatTimeStr(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// --- Methods ---
async function loadInitialData(retryCount = 0) {
  loading.value = true
  try {
    const result = await dataLoaderComposable.loadInitialData(selectedDate.value)
    if (result) {
      quickReservationGroups.value = result.quickReservationGroups || []
      rooms.value = result.rooms
      rotationList.value = result.rotationList
      activeStaffList.value = result.activeStaffList
    }
  } catch (e) {
    console.error('[Cashier] loadInitialData failed:', e)
    // 首次失败可能是 CloudBase SDK 尚未就绪，等待 3 秒后重试一次
    if (retryCount === 0 && e.message?.includes('timeout')) {
      console.log('[Cashier] Retrying in 3s...')
      await new Promise(r => setTimeout(r, 3000))
      return loadInitialData(1)
    }
  } finally {
    loading.value = false
  }
}

async function onDateChange(date) {
  selectedDate.value = date
  await dataLoaderComposable.loadTimelineData(selectedDate.value).then(result => {
    if (result) {
      rotationList.value = result.rotationList
      quickReservationGroups.value = result.quickReservationGroups || []
    }
  }).catch(() => {})
}

// Quick reservation - copy group slot
async function copyGroupSlot(group) {
  if (!group.earliestTime) return

  const timeRange = group.earliestTime.match(/^(\d{2}:\d{2}-\d{2}:\d{2})/)?.[1] || group.earliestTime
  const parts = []
  if (group.maleCount > 0) parts.push(`${group.maleCount}位男技师`)
  if (group.femaleCount > 0) parts.push(`${group.femaleCount}位女技师`)
  const staffLabel = parts.join('+') || group.label

  const message = `您好，目前${staffLabel}可预约时段为${timeRange}哦，您可以告诉小趴到店时间，小趴给您保留预约哦~`

  const success = await pushComposable.copyToClipboard(message)
  if (success) alert('已复制到剪贴板')
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

// ========== Extra Time ==========
function openExtraTimeModal(recordId) {
  extraTimeModal.show = true
  extraTimeModal.sourceRecordId = recordId
  extraTimeModal.selectedProject = ''
  extraTimeModal.selectedProjectName = ''
  extraTimeModal.quantity = 1
  extraTimeModal.projects = projects.value || []
}

function closeExtraTimeModal() {
  extraTimeModal.show = false
}

async function confirmExtraTime() {
  const { sourceRecordId, selectedProject, selectedProjectName, quantity } = extraTimeModal
  if (!selectedProject) {
    alert('请选择一个加钟项目')
    return
  }

  loading.value = true
  loadingText.value = '加钟中...'
  try {
    // 查询原始咨询单
    const col = collection('consultation')
    const res = await col.doc(sourceRecordId).get()
    const record = res.data?.[0]
    if (!record) {
      alert('未找到原始单据')
      return
    }

    const [endH, endM] = record.endTime.split(':').map(Number)
    const [year, month, day] = record.date.split('-').map(Number)
    const startTimeDate = new Date(year, month - 1, day, endH, endM, 0, 0)
    const startTime = formatTimeStr(startTimeDate)

    const duration = parseProjectDuration(selectedProjectName) || 90
    const totalDuration = duration * quantity
    const endTimeDate = new Date(startTimeDate.getTime() + totalDuration * 60 * 1000)
    const endTime = formatTimeStr(endTimeDate)

    // 创建加钟咨询单
    const extraRecord = {
      surname: record.surname,
      gender: record.gender,
      project: selectedProjectName,
      technician: record.technician,
      room: record.room,
      massageStrength: record.massageStrength || '',
      essentialOil: record.essentialOil || '',
      selectedParts: record.selectedParts || {},
      isClockIn: false,
      remarks: record.remarks || '',
      phone: record.phone || '',
      couponCode: '',
      couponPlatform: record.couponPlatform || 'meituan',
      extraTime: 0,
      date: record.date,
      startTime,
      endTime,
      isVoided: false,
      overtime: 0,
      guasha: false,
      isExtraTime: true
    }

    await col.add(extraRecord)

    closeExtraTimeModal()
    await loadInitialData()
    alert('加钟成功')
  } catch (e) {
    alert(e.message || '加钟失败')
  } finally {
    loading.value = false
  }
}

// ========== Arrival ==========
async function handleArrival(reserveId) {
  loading.value = true
  loadingText.value = '加载中...'
  try {
    const col = collection('reservations')
    const res = await col.doc(reserveId).get()
    const record = res.data?.[0]
    if (!record) {
      alert('预约不存在')
      return
    }
    if (record.status === 'cancelled') {
      alert('该预约已取消')
      return
    }

    // 查找关联预约（同组或同客户同时段）
    let reservations = []
    if (record.groupKey) {
      const groupRes = await col.where({ groupKey: record.groupKey, status: 'active' }).get()
      reservations = groupRes.data || []
    } else {
      const sameRes = await col.where({
        date: record.date,
        customerName: record.customerName,
        startTime: record.startTime,
        project: record.project,
        status: 'active'
      }).get()
      reservations = sameRes.data || []
    }
    if (reservations.length === 0) reservations = [record]

    arrivalConfirmModal.show = true
    arrivalConfirmModal.reserveId = reserveId
    arrivalConfirmModal.customerName = record.customerName + (record.gender === 'male' ? '先生' : '女士')
    arrivalConfirmModal.project = record.project
    arrivalConfirmModal.technicianName = record.technicianName || '未指定'
    arrivalConfirmModal.reservations = reservations
  } catch (e) {
    alert('加载失败')
  } finally {
    loading.value = false
  }
}

async function confirmArrivalWithPush() {
  const reservations = arrivalConfirmModal.reservations || []
  arrivalConfirmModal.show = false
  loading.value = true
  loadingText.value = '处理中...'
  try {
    // 推送通知
    await pushComposable.sendArrivalNotification(reservations)

    // 标记到店
    const col = collection('reservations')
    for (const r of reservations) {
      await col.doc(r._id).update({ data: { isFulfilled: true } })
    }

    alert('到店通知已推送')
    await loadInitialData()
  } catch (e) {
    alert('处理失败: ' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

async function confirmArrivalWithoutPush() {
  const reservations = arrivalConfirmModal.reservations || []
  arrivalConfirmModal.show = false
  loading.value = true
  loadingText.value = '处理中...'
  try {
    const col = collection('reservations')
    for (const r of reservations) {
      await col.doc(r._id).update({ data: { isFulfilled: true } })
    }
    alert('已标记到店')
    await loadInitialData()
  } catch (e) {
    alert('处理失败')
  } finally {
    loading.value = false
  }
}

// ========== Cancel Reservation ==========
async function cancelReservation(id) {
  if (!confirm('确定要取消此预约吗？')) return

  loading.value = true
  loadingText.value = '取消中...'
  try {
    await reservationComposable.cancelReservation(id)
    await loadInitialData()
    alert('已取消预约')
  } catch (e) {
    alert(e.message || '取消失败')
  } finally {
    loading.value = false
  }
}

// ========== Timeline / Rotation ==========
async function onTimelineAdjustRotation({ index, direction }) {
  const list = [...rotationList.value]
  let toIdx = index
  if (direction === 'up' && index > 0) toIdx = index - 1
  else if (direction === 'down' && index < list.length - 1) toIdx = index + 1
  else return

  try {
    const result = await callCloudFunction('manageRotation', {
      action: 'adjustPosition',
      date: selectedDate.value,
      fromIndex: index,
      toIndex: toIdx
    })

    if (result?.code === 0) {
      [list[index], list[toIdx]] = [list[toIdx], list[index]]
      rotationList.value = list
      alert('调整成功')
    } else {
      alert(result?.message || '调整失败')
    }
  } catch (e) {
    alert('调整失败: ' + (e.message || ''))
  }
}

async function onTimelineResetRotation() {
  if (!confirm('确定要重置轮牌吗？')) return

  loading.value = true
  loadingText.value = '重置中...'
  try {
    const result = await callCloudFunction('manageRotation', {
      action: 'init',
      date: selectedDate.value
    })

    if (result?.code === 0) {
      await loadInitialData()
      alert('重置成功')
    } else {
      alert(result?.message || '重置失败')
    }
  } catch (e) {
    alert('重置失败: ' + (e.message || ''))
  } finally {
    loading.value = false
  }
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

// Quick reservation groups
.cp-quick-groups {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .cp-quick-group-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #f8f9fb;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      border-color: #4a6cf7;
      background: #eef1ff;
    }

    .cp-group-label {
      font-size: 13px;
      font-weight: 500;
      color: #333;
    }

    .cp-group-time {
      font-size: 12px;
      font-weight: 600;
      color: #00A86B;
    }

    .cp-group-empty {
      font-size: 12px;
      color: #999;
    }
  }
}

.cp-qr-loading {
  text-align: center;
  padding: 12px;
  color: #999;
  font-size: 12px;
}

.cp-qr-empty {
  text-align: center;
  padding: 12px;
  color: #999;
  font-size: 12px;
}
</style>
