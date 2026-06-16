// composables/useCustomerMatch.js - 顾客匹配逻辑
import { ref } from 'vue'
import { collection as getCollection } from '../services/cloudbase'

/**
 * 从姓名解析姓和性别
 * 约定：名称为 "张先生" 或 "李女士" 格式
 */
export function parseCustomerName(name) {
  if (!name) return { surname: '', gender: 'male' }
  if (name.endsWith('女士')) {
    return { surname: name.replace('女士', ''), gender: 'female' }
  }
  if (name.endsWith('先生')) {
    return { surname: name.replace('先生', ''), gender: 'male' }
  }
  return { surname: name, gender: 'male' }
}

export function useCustomerMatch() {
  const matchedCustomer = ref(null)
  const matchedCustomerApplied = ref(false)

  /**
   * 搜索匹配顾客
   */
  async function searchCustomer(surname, gender, phone) {
    if (!surname && !phone) {
      matchedCustomer.value = null
      matchedCustomerApplied.value = false
      return
    }

    try {
      const customersCol = getCollection('customers')
      const conditions = []

      if (surname) conditions.push({ name: new RegExp(surname) })
      if (phone) conditions.push({ phone })

      if (conditions.length === 0) {
        matchedCustomer.value = null
        matchedCustomerApplied.value = false
        return
      }

      let query = customersCol
      if (conditions.length === 1) {
        query = query.where(conditions[0])
      } else {
        query = query.where({
          $or: conditions
        })
      }

      const res = await query.limit(5).get()
      const customers = res.data || []

      if (customers.length === 1) {
        matchedCustomer.value = customers[0]
        matchedCustomerApplied.value = false
      } else if (customers.length > 1) {
        // 多个匹配，按最后活跃时间排序
        customers.sort((a, b) =>
          (b.lastVisitDate || '').localeCompare(a.lastVisitDate || '')
        )
        matchedCustomer.value = customers[0]
        matchedCustomerApplied.value = false
      } else {
        matchedCustomer.value = null
        matchedCustomerApplied.value = false
      }
    } catch (error) {
      console.error('[CustomerMatch] search failed:', error)
      matchedCustomer.value = null
      matchedCustomerApplied.value = false
    }
  }

  /**
   * 应用匹配顾客信息到表单
   */
  function applyMatchedCustomer(reserveForm, staffAvailability) {
    if (!matchedCustomer.value) return { reserveForm, staffAvailability }

    const { surname, gender } = parseCustomerName(matchedCustomer.value.name)
    const updates = { ...reserveForm }
    updates.customerName = surname
    updates.gender = gender

    if (matchedCustomer.value.phone) {
      updates.phone = matchedCustomer.value.phone
    }

    if (matchedCustomer.value.responsibleTechnician && staffAvailability?.length) {
      const techName = matchedCustomer.value.responsibleTechnician
      const matchedStaff = staffAvailability.find(s => s.name === techName)
      if (matchedStaff) {
        updates.selectedTechnicians = [{
          _id: matchedStaff._id,
          name: matchedStaff.name,
          phone: matchedStaff.phone || '',
          isClockIn: false
        }]
        staffAvailability = staffAvailability.map(s => ({
          ...s,
          isSelected: s._id === matchedStaff._id
        }))
      }
    }

    matchedCustomerApplied.value = true
    return { reserveForm: updates, staffAvailability }
  }

  function clearMatchedCustomer() {
    matchedCustomer.value = null
    matchedCustomerApplied.value = false
  }

  return {
    matchedCustomer,
    matchedCustomerApplied,
    searchCustomer,
    applyMatchedCustomer,
    clearMatchedCustomer,
    parseCustomerName
  }
}
