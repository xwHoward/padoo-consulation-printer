// composables/useDataLoader.js - 数据加载服务
import { callFunction, getDatabase } from '../services/cloudbase'

/**
 * 工具函数
 */
function getCurrentDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getPreviousDate(dateStr) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getNextDate(dateStr) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(date, withSeconds = false) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  if (withSeconds) {
    const s = String(date.getSeconds()).padStart(2, '0')
    return `${h}:${m}:${s}`
  }
  return `${h}:${m}`
}

function earlierThan(timeA, timeB) {
  return timeA < timeB
}

function laterOrEqualTo(timeA, timeB) {
  return timeA >= timeB
}

export function useDataLoader(data, setData) {

  /**
   * 加载项目列表
   */
  async function loadProjects() {
    try {
      const res = await getDatabase().collection('projects').where({ status: 'active' }).get()
      return res.data || []
    } catch (error) {
      console.error('[DataLoader] loadProjects failed:', error)
      return []
    }
  }

  /**
   * 加载房间（简化版）
   */
  async function loadRooms() {
    try {
      const res = await getDatabase().collection('rooms').get()
      return res.data || []
    } catch (error) {
      console.error('[DataLoader] loadRooms failed:', error)
      return []
    }
  }

  /**
   * 加载员工
   */
  async function loadStaffs() {
    try {
      const res = await getDatabase().collection('staffs').where({ status: 'active' }).get()
      return res.data || []
    } catch (error) {
      console.error('[DataLoader] loadStaffs failed:', error)
      return []
    }
  }

  /**
   * 加载某日咨询单
   */
  async function loadConsultationsByDate(date) {
    try {
      const res = await getDatabase()
        .collection('consultation')
        .where({ date, isVoided: false })
        .get()
      return res.data || []
    } catch (error) {
      console.error('[DataLoader] loadConsultationsByDate failed:', error)
      return []
    }
  }

  /** 5种快速预约组合的静态配置 */
  const QUICK_GROUPS_CONFIG = [
    { key: 'oneFemale',        label: '1位女技师', maleCount: 0, femaleCount: 1 },
    { key: 'oneMale',          label: '1位男技师', maleCount: 1, femaleCount: 0 },
    { key: 'twoFemale',        label: '2位女技师', maleCount: 0, femaleCount: 2 },
    { key: 'oneMaleOneFemale', label: '1男1女',    maleCount: 1, femaleCount: 1 },
    { key: 'twoMale',          label: '2位男技师', maleCount: 2, femaleCount: 0 },
  ]
  
  /** 将云函数返回的原始时段转换为前端 QuickSlot */
  function convertRawSlots(rawList) {
    return (rawList || []).map(s => ({
      ...s,
      maleStaff: [],
      femaleStaff: [...(s.staffNames || [])]
    }))
  }
  
  /**
   * 加载轮牌列表和5种快速预约组合
   */
  async function prepareRotationList(date) {
    const emptyGroups = QUICK_GROUPS_CONFIG.map(cfg => ({
      key: cfg.key,
      label: cfg.label,
      maleCount: cfg.maleCount,
      femaleCount: cfg.femaleCount,
      earliestTime: '',
      slots: [],
      emptyReason: '暂无数据'
    }))
    const empty = {
      rotationList: [],
      quickReservationGroups: emptyGroups
    }
    try {
      const result = await callFunction('getAvailableTechnicians', {
        mode: 'rotationQuickSlots',
        date
      })
  
      if (result?.code === 0 && result.data) {
        const raw = result.data.quickReservationSlots || {}
        const groups = QUICK_GROUPS_CONFIG.map(cfg => {
          const rawList = (raw[cfg.key] || [])
          const slots = convertRawSlots(rawList)
          return {
            key: cfg.key,
            label: cfg.label,
            maleCount: cfg.maleCount,
            femaleCount: cfg.femaleCount,
            earliestTime: slots[0]?.time || '',
            slots,
            emptyReason: slots.length === 0 ? '暂无可约时段' : undefined
          }
        })
  
        return {
          rotationList: result.data.rotationItems || [],
          quickReservationGroups: groups
        }
      }
    } catch (error) {
      console.error('[DataLoader] prepareRotationList failed:', error)
    }
    return empty
  }

  /**
   * 加载快速预约时段
   */
  async function loadQuickReservationSlots(date, maleCount, femaleCount) {
    const empty = { earliestTime: '', slots: [] }
    try {
      const result = await callFunction('getAvailableTechnicians', {
        mode: 'quickSlots',
        date,
        maleCount,
        femaleCount
      })

      if (result?.code === 0 && result.data) {
        return {
          earliestTime: result.data.earliestTime || '',
          slots: result.data.slots || [],
          emptyReason: result.data.emptyReason || ''
        }
      }
    } catch (error) {
      console.error('[DataLoader] loadQuickReservationSlots failed:', error)
    }
    return empty
  }

  /**
   * 加载初始数据（主入口）
   */
  async function loadInitialData(selectedDate) {
    const today = selectedDate || getCurrentDate()
    const currentTimeStr = formatTime(new Date())
    const todayStr = getCurrentDate()
    const isToday = today === todayStr

    try {
      const [allRooms, todayRecords, allStaff, rotationResult] = await Promise.all([
        loadRooms(),
        loadConsultationsByDate(today),
        loadStaffs(),
        prepareRotationList(today)
      ])

      // 计算房间占用状态
      const filteredRooms = (allRooms || []).filter(r => r.status === 'normal')
      const rooms = filteredRooms.map(room => {
        let occupiedRecords = (todayRecords || [])
          .filter(r => r.room === room.name)
          .map(r => ({
            customerName: (r.surname || '') + (r.gender === 'male' ? '先生' : '女士'),
            technician: r.technician || '',
            startTime: r.startTime,
            endTime: r.endTime || ''
          }))

        if (isToday && currentTimeStr) {
          occupiedRecords = occupiedRecords.filter(r =>
            laterOrEqualTo(currentTimeStr, r.startTime) &&
            earlierThan(currentTimeStr, r.endTime)
          )
        }

        occupiedRecords.sort((a, b) => b.endTime.localeCompare(a.endTime))

        return {
          ...room,
          isOccupied: occupiedRecords.length > 0,
          occupiedRecords
        }
      })

      const dateSelector = {
        selectedDate: today,
        previousDate: getPreviousDate(today),
        nextDate: getNextDate(today),
        isToday
      }

      const activeStaffList = (allStaff || []).filter(
        s => s.status === 'active' && s.role === 'technician'
      )

      const { rotationList, quickReservationGroups } = rotationResult

      return {
        rooms,
        activeStaffList,
        dateSelector,
        rotationList,
        rotationOrder: rotationList.map(item => item._id),
        quickReservationGroups,
        selectedDate: today
      }
    } catch (error) {
      console.error('[DataLoader] loadInitialData failed:', error)
      throw error
    }
  }

  /**
   * 刷新时间轴数据
   */
  async function loadTimelineData(selectedDate) {
    const today = selectedDate || getCurrentDate()

    try {
      const dateSelector = {
        selectedDate: today,
        previousDate: getPreviousDate(today),
        nextDate: getNextDate(today),
        isToday: today === getCurrentDate()
      }

      const rotationResult = await prepareRotationList(today)

      return {
        dateSelector,
        rotationList: rotationResult.rotationList,
        rotationOrder: rotationResult.rotationList.map(item => item._id),
        quickReservationGroups: rotationResult.quickReservationGroups
      }
    } catch (error) {
      console.error('[DataLoader] loadTimelineData failed:', error)
      throw error
    }
  }

  /**
   * 筛选活跃技师
   */
  async function loadActiveStaff() {
    try {
      return await loadStaffs()
    } catch {
      return []
    }
  }

  return {
    loadProjects,
    loadRooms,
    loadStaffs,
    loadConsultationsByDate,
    prepareRotationList,
    loadQuickReservationSlots,
    loadInitialData,
    loadTimelineData,
    loadActiveStaff,
    getCurrentDate,
    formatTime,
    getPreviousDate,
    getNextDate
  }
}
