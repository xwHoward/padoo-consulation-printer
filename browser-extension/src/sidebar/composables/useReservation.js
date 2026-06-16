// composables/useReservation.js - 预约处理逻辑
import { ref, reactive } from 'vue'
import { getDatabase, callFunction, collection } from '../services/cloudbase'
import { useCustomerMatch, parseCustomerName } from './useCustomerMatch'

export function useReservation(data, setData, loadTimelineData) {
  const { matchedCustomer, matchedCustomerApplied, searchCustomer, applyMatchedCustomer, clearMatchedCustomer } = useCustomerMatch()

  // 预约表单默认值
  function createDefaultReserveForm(date = '') {
    return {
      _id: '',
      date: date || new Date().toISOString().slice(0, 10),
      customerName: '',
      gender: 'male',
      projects: [],
      phone: '',
      requirementType: 'gender',
      selectedTechnicians: [],
      genderRequirement: { male: 0, female: 0 },
      startTime: '',
      technicianId: '',
      technicianName: '',
      isRenewal: false
    }
  }

  /**
   * 计算总时长
   */
  function calcTotalDuration(projectNames) {
    if (!projectNames || !projectNames.length) return 90
    const durations = projectNames.map(p => {
      const match = String(p).match(/(\d+)/)
      return match ? parseInt(match[1]) : 90
    })
    const sorted = [...durations].sort((a, b) => b - a)
    return sorted.reduce((sum, d) => sum + d, 0) + 20
  }

  /**
   * 检查技师可用性
   */
  async function checkStaffAvailability(reserveForm) {
    const { date, startTime, projects } = reserveForm
    if (!date || !startTime) return { staffAvailability: [], availableMaleCount: 0, availableFemaleCount: 0 }

    try {
      const projectNames = projects?.length > 0 ? projects : []
      const totalDuration = calcTotalDuration(projectNames)

      const result = await callFunction('getAvailableTechnicians', {
        date,
        mode: 'checkAvailability',
        startTime,
        projectDuration: totalDuration,
        editingReservationId: reserveForm._id || ''
      })

      if (result?.code === 0 && result.data) {
        return {
          staffAvailability: result.data.staffAvailability || [],
          availableMaleCount: result.data.availableMaleCount || 0,
          availableFemaleCount: result.data.availableFemaleCount || 0
        }
      }
    } catch (error) {
      console.error('[Reservation] checkStaffAvailability failed:', error)
    }
    return { staffAvailability: [], availableMaleCount: 0, availableFemaleCount: 0 }
  }

  /**
   * 确认预约
   */
  async function confirmReserve(reserveForm, editingGroupIds) {
    const { customerName, gender, phone, date, startTime, projects, requirementType } = reserveForm

    if (!customerName) {
      throw new Error('请输入顾客姓名')
    }
    if (!projects || projects.length === 0) {
      throw new Error('请选择项目')
    }
    if (!startTime) {
      throw new Error('请选择开始时间')
    }

    try {
      const result = await callFunction('saveReservation', {
        reservation: {
          _id: reserveForm._id || undefined,
          customerName,
          gender,
          phone: phone || '',
          date,
          startTime,
          project: (projects || []).join('&'),
          projects: projects || [],
          requirementType,
          selectedTechnicians: reserveForm.selectedTechnicians || [],
          genderRequirement: reserveForm.genderRequirement || { male: 0, female: 0 },
          isRenewal: reserveForm.isRenewal || false,
          editingGroupIds: editingGroupIds || []
        }
      })

      if (result?.code === 0) {
        return { success: true, id: result.data?._id || result._id }
      }
      throw new Error(result?.message || '保存预约失败')
    } catch (error) {
      console.error('[Reservation] confirmReserve failed:', error)
      throw error
    }
  }

  /**
   * 取消预约
   */
  async function cancelReservation(id) {
    try {
      const result = await callFunction('cancelReservation', { reservationId: id })
      if (result?.code === 0) return true
      throw new Error(result?.message || '取消失败')
    } catch (error) {
      console.error('[Reservation] cancelReservation failed:', error)
      throw error
    }
  }

  /**
   * 编辑预约（加载预约数据）
   */
  async function loadReservationForEdit(id, activeStaffList) {
    try {
      const db = getDatabase()
      const res = await db.collection('reservations').doc(id).get()

      if (!res.data || res.data.length === 0) {
        throw new Error('未找到该预约')
      }

      const record = res.data[0] || res.data

      if (record.status === 'cancelled') {
        throw new Error('该预约已取消，无法编辑')
      }

      const requirementType = record.requirementType ||
        (record.genderRequirement && !record.technicianId ? 'gender' : 'specific')

      let selectedTechnicians = []
      let editingGroupIds = [record._id]

      if (record.technicianId && record.technicianName) {
        const staffInfo = activeStaffList.find(s => s._id === record.technicianId)
        selectedTechnicians = [{
          _id: record.technicianId,
          name: record.technicianName,
          phone: staffInfo?.phone || '',
          isClockIn: record.isClockIn || false
        }]
      }

      // 加载分组成员
      if (record.groupKey && requirementType === 'specific') {
        try {
          const groupRes = await db.collection('reservations')
            .where({ groupKey: record.groupKey, status: 'active' })
            .get()
          if (groupRes.data?.length) {
            selectedTechnicians = []
            editingGroupIds = []
            for (const member of groupRes.data) {
              editingGroupIds.push(member._id)
              if (member.technicianId && member.technicianName) {
                const staffInfo = activeStaffList.find(s => s._id === member.technicianId)
                selectedTechnicians.push({
                  _id: member.technicianId,
                  name: member.technicianName,
                  phone: staffInfo?.phone || '',
                  isClockIn: member.isClockIn || false
                })
              }
            }
          }
        } catch { /* ignore group loading errors */ }
      }

      return {
        editingGroupIds,
        originalReservation: record,
        reserveForm: {
          _id: record._id,
          date: record.date,
          customerName: record.customerName,
          gender: record.gender,
          projects: record.project ? record.project.split('&').filter(p => p !== '待定') : [],
          phone: record.phone || '',
          requirementType,
          selectedTechnicians,
          genderRequirement: requirementType === 'gender'
            ? { male: record.requiredMaleCount || 0, female: record.requiredFemaleCount || 0 }
            : { male: 0, female: 0 },
          startTime: record.startTime,
          technicianId: record.technicianId || '',
          technicianName: record.technicianName || '',
          isRenewal: false
        }
      }
    } catch (error) {
      console.error('[Reservation] loadReservationForEdit failed:', error)
      throw error
    }
  }

  return {
    createDefaultReserveForm,
    calcTotalDuration,
    checkStaffAvailability,
    confirmReserve,
    cancelReservation,
    loadReservationForEdit,
    // customer match
    matchedCustomer,
    matchedCustomerApplied,
    searchCustomer,
    applyMatchedCustomer,
    clearMatchedCustomer,
    parseCustomerName
  }
}
