/**
 * getAvailableTechnicians 云函数单元测试
 * 主要测试10分钟重叠容差的冲突检测逻辑
 */

const { parseTimeToMinutes, mergeTimeRanges } = require('./shared-utils')

// 模拟云函数上下文
const mockCloud = {
  database: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn()
      }))
    })),
    command: {}
  })),
  init: jest.fn()
}

jest.mock('wx-server-sdk', () => mockCloud)

// 冲突检测函数（从index.js中提取的核心逻辑）
function checkConflict(currentMinutes, proposedEndTimeMinutes, mergedRanges, overlapTolerance = 10) {
  if (!mergedRanges || mergedRanges.length === 0) {
    return { hasConflict: false, conflictRange: null }
  }

  const effectiveStart = currentMinutes + overlapTolerance
  const effectiveEnd = proposedEndTimeMinutes - overlapTolerance

  const conflictRange = mergedRanges.find(range => {
    return effectiveStart < range.end && effectiveEnd > range.start
  })

  return {
    hasConflict: !!conflictRange,
    conflictRange: conflictRange || null
  }
}

describe('冲突检测逻辑测试', () => {
  // 基础设置：技师已有预约 14:00-15:00
  const existingAppointment = { start: 840, end: 900 } // 14:00-15:00

  describe('用例1: 新预约与已有预约完全不重叠', () => {
    test('16:10-17:10 应该允许（无冲突）', () => {
      const newStart = parseTimeToMinutes('16:10') // 970
      const newEnd = parseTimeToMinutes('17:10')   // 1030

      const result = checkConflict(newStart, newEnd, [existingAppointment])

      expect(result.hasConflict).toBe(false)
      expect(result.conflictRange).toBeNull()
    })
  })

  describe('用例2: 结束时间与已有预约开始时间重叠10分钟', () => {
    test('13:10-14:10 应该允许（无冲突）', () => {
      const newStart = parseTimeToMinutes('13:10') // 790
      const newEnd = parseTimeToMinutes('14:10')   // 850

      const result = checkConflict(newStart, newEnd, [existingAppointment])

      expect(result.hasConflict).toBe(false)
      expect(result.conflictRange).toBeNull()
    })
  })

  describe('用例3: 开始时间与已有预约结束时间重叠10分钟', () => {
    test('14:50-15:50 应该允许（无冲突）', () => {
      const newStart = parseTimeToMinutes('14:50') // 890
      const newEnd = parseTimeToMinutes('15:50')   // 950

      const result = checkConflict(newStart, newEnd, [existingAppointment])

      expect(result.hasConflict).toBe(false)
      expect(result.conflictRange).toBeNull()
    })
  })

  describe('用例4: 开始时间与已有预约开始重叠20分钟', () => {
    test('14:40-15:40 应该冲突', () => {
      const newStart = parseTimeToMinutes('14:40') // 880
      const newEnd = parseTimeToMinutes('15:40')   // 940

      const result = checkConflict(newStart, newEnd, [existingAppointment])

      expect(result.hasConflict).toBe(true)
      expect(result.conflictRange).toEqual(existingAppointment)
    })
  })

  describe('用例5: 新预约与已有预约重叠50分钟', () => {
    test('14:10-15:10 应该冲突', () => {
      const newStart = parseTimeToMinutes('14:10') // 850
      const newEnd = parseTimeToMinutes('15:10')   // 910

      const result = checkConflict(newStart, newEnd, [existingAppointment])

      expect(result.hasConflict).toBe(true)
      expect(result.conflictRange).toEqual(existingAppointment)
    })
  })

  describe('边界情况测试', () => {
    test('完全重叠应该冲突', () => {
      const result = checkConflict(840, 900, [existingAppointment])
      expect(result.hasConflict).toBe(true)
    })

    test('无已有预约应该允许', () => {
      const newStart = parseTimeToMinutes('14:00')
      const newEnd = parseTimeToMinutes('15:00')

      const result = checkConflict(newStart, newEnd, [])

      expect(result.hasConflict).toBe(false)
    })

    test('多个已有预约时正确检测冲突', () => {
      const appointments = [
        { start: 840, end: 900 },   // 14:00-15:00
        { start: 960, end: 1020 }   // 16:00-17:00
      ]

      // 15:10-16:10 应该允许（在两个预约之间，有10分钟缓冲）
      const result1 = checkConflict(910, 970, appointments)
      expect(result1.hasConflict).toBe(false)

      // 15:50-16:50 应该冲突（与16:00-17:00重叠）
      const result2 = checkConflict(950, 1010, appointments)
      expect(result2.hasConflict).toBe(true)
    })
  })
})

describe('mergeTimeRanges 测试', () => {
  test('合并重叠时段', () => {
    const appointments = [
      { startTime: '14:00', endTime: '15:00' },
      { startTime: '14:30', endTime: '15:30' }  // 与上一个重叠
    ]

    const result = mergeTimeRanges(appointments)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ start: 840, end: 930 })
  })

  test('不合并不重叠时段', () => {
    const appointments = [
      { startTime: '14:00', endTime: '15:00' },
      { startTime: '16:00', endTime: '17:00' }
    ]

    const result = mergeTimeRanges(appointments)

    expect(result).toHaveLength(2)
  })

  test('空数组返回空数组', () => {
    const result = mergeTimeRanges([])
    expect(result).toEqual([])
  })
})

describe('parseTimeToMinutes 测试', () => {
  test('正确解析时间字符串', () => {
    expect(parseTimeToMinutes('14:00')).toBe(840)
    expect(parseTimeToMinutes('09:30')).toBe(570)
    expect(parseTimeToMinutes('23:59')).toBe(1439)
    expect(parseTimeToMinutes('00:00')).toBe(0)
  })
})
