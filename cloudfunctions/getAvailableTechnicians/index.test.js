/**
 * getAvailableTechnicians 云函数单元测试
 * 主要测试10分钟重叠容差的冲突检测逻辑
 */

const { parseTimeToMinutes, mergeTimeRanges } = require('./shared-utils')

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

describe('重排算法测试', () => {
  const mockStaff = [
    { _id: 'techA', name: '技师A', gender: 'male', status: 'active' },
    { _id: 'techB', name: '技师B', gender: 'male', status: 'active' },
    { _id: 'techC', name: '技师C', gender: 'female', status: 'active' },
    { _id: 'techD', name: '技师D', gender: 'female', status: 'active' }
  ]

  const mockSchedule = [
    { staffId: 'techA', date: '2026-05-06', shift: 'evening' },
    { staffId: 'techB', date: '2026-05-06', shift: 'evening' },
    { staffId: 'techC', date: '2026-05-06', shift: 'evening' },
    { staffId: 'techD', date: '2026-05-06', shift: 'evening' }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  const setupMock = (schedule, consultations, reservations, rotationQueue, staff) => {
    mockCloud.database.mockReturnValue({
      collection: jest.fn(col => ({
        where: jest.fn(() => ({
          field: jest.fn(() => ({
            limit: jest.fn(function() { return this }).mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              data: col === 'schedule' ? schedule :
                    col === 'consultation_records' ? consultations :
                    col === 'reservations' ? reservations :
                    col === 'rotation_queue' ? rotationQueue :
                    col === 'staff' ? staff : []
            })
          })),
          limit: jest.fn(function() { return this }).mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            data: col === 'schedule' ? schedule :
                  col === 'consultation_records' ? consultations :
                  col === 'reservations' ? reservations :
                  col === 'rotation_queue' ? rotationQueue :
                  col === 'staff' ? staff : []
          }),
          update: jest.fn().mockResolvedValue({})
        }))
      })),
      command: {}
    })
  }

  test('TC1.1: 单个点钟预约不变', async () => {
    const clockInReservation = {
      _id: 'res1',
      date: '2026-05-06',
      startTime: '14:00',
      endTime: '15:00',
      technicianName: '技师A',
      technicianId: 'techA',
      isClockIn: true,
      status: 'active'
    }

    setupMock(mockSchedule, [], [clockInReservation], [], mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    expect(result.data.unchanged).toHaveLength(1)
    expect(result.data.unchanged[0].newTechnician).toBe('技师A')
    expect(result.data.rearranged).toHaveLength(0)
    expect(result.data.unassigned).toHaveLength(0)
  })

  test('TC2.1: 要求男技师，只分配男技师', async () => {
    const nonClockInReservation = {
      _id: 'res1',
      date: '2026-05-06',
      startTime: '14:00',
      endTime: '15:00',
      gender: 'male',
      isClockIn: false,
      status: 'active'
    }

    setupMock(mockSchedule, [], [nonClockInReservation], [], mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    expect(result.data.rearranged).toHaveLength(1)
    const assignedTech = result.data.rearranged[0].newTechnician
    expect(['技师A', '技师B']).toContain(assignedTech)
    expect(['技师C', '技师D']).not.toContain(assignedTech)
  })

  test('TC3.2: 开始时间与已有预约结束重叠5分钟，可分配', async () => {
    const clockInReservation = {
      _id: 'res-clock',
      date: '2026-05-06',
      startTime: '14:00',
      endTime: '15:00',
      technicianName: '技师A',
      technicianId: 'techA',
      isClockIn: true,
      status: 'active'
    }

    const nonClockInReservation = {
      _id: 'res-rotation',
      date: '2026-05-06',
      startTime: '14:55',
      endTime: '15:55',
      gender: 'male',
      isClockIn: false,
      status: 'active'
    }

    setupMock(mockSchedule, [], [clockInReservation, nonClockInReservation], [], mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    expect(result.data.unchanged).toHaveLength(1)
    expect(result.data.rearranged).toHaveLength(1)
    expect(result.data.unassigned).toHaveLength(0)
  })

  test('TC4.1: 轮钟数量少的优先', async () => {
    const clockInResA = {
      _id: 'res-a1',
      date: '2026-05-06',
      startTime: '15:00',
      endTime: '16:00',
      technicianName: '技师A',
      technicianId: 'techA',
      isClockIn: true,
      status: 'active'
    }

    const clockInResA2 = {
      _id: 'res-a2',
      date: '2026-05-06',
      startTime: '16:00',
      endTime: '17:00',
      technicianName: '技师A',
      technicianId: 'techA',
      isClockIn: true,
      status: 'active'
    }

    const nonClockInReservation = {
      _id: 'res-rotation',
      date: '2026-05-06',
      startTime: '14:00',
      endTime: '15:00',
      gender: 'male',
      isClockIn: false,
      status: 'active'
    }

    setupMock(mockSchedule, [], [clockInResA, clockInResA2, nonClockInReservation], [], mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    expect(result.data.rearranged).toHaveLength(1)
    expect(result.data.rearranged[0].newTechnician).toBe('技师B')
  })

  test('TC6.3: 无法分配的预约', async () => {
    const clockInResA = {
      _id: 'res-a',
      date: '2026-05-06',
      startTime: '14:00',
      endTime: '15:00',
      technicianName: '技师A',
      technicianId: 'techA',
      isClockIn: true,
      status: 'active'
    }

    const clockInResB = {
      _id: 'res-b',
      date: '2026-05-06',
      startTime: '14:00',
      endTime: '15:00',
      technicianName: '技师B',
      technicianId: 'techB',
      isClockIn: true,
      status: 'active'
    }

    const nonClockInReservation = {
      _id: 'res-rotation',
      date: '2026-05-06',
      startTime: '14:00',
      endTime: '15:00',
      gender: 'male',
      isClockIn: false,
      status: 'active'
    }

    setupMock(mockSchedule, [], [clockInResA, clockInResB, nonClockInReservation], [], mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    expect(result.data.unassigned).toHaveLength(1)
    expect(result.data.unassigned[0].newTechnician).toBeNull()
  })
})

describe('前瞻模拟与重叠最小化测试', () => {
  const mockStaff = [
    { _id: 'techA', name: '技师A', gender: 'female', status: 'active' },
    { _id: 'techB', name: '技师B', gender: 'female', status: 'active' },
    { _id: 'techC', name: '技师C', gender: 'male', status: 'active' }
  ]

  const mockSchedule = [
    { staffId: 'techA', date: '2026-05-06', shift: 'evening' },
    { staffId: 'techB', date: '2026-05-06', shift: 'evening' },
    { staffId: 'techC', date: '2026-05-06', shift: 'evening' }
  ]

  const mockRotation = [{
    staffList: [
      { staffId: 'techA', position: 0 },
      { staffId: 'techB', position: 1 },
      { staffId: 'techC', position: 2 }
    ]
  }]

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  const setupMock = (schedule, consultations, reservations, rotationQueue, staff) => {
    mockCloud.database.mockReturnValue({
      collection: jest.fn(col => ({
        where: jest.fn(() => ({
          field: jest.fn(() => ({
            limit: jest.fn(function() { return this }).mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              data: col === 'schedule' ? schedule :
                    col === 'consultation_records' ? consultations :
                    col === 'reservations' ? reservations :
                    col === 'rotation_queue' ? rotationQueue :
                    col === 'staff' ? staff : []
            })
          })),
          limit: jest.fn(function() { return this }).mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            data: col === 'schedule' ? schedule :
                  col === 'consultation_records' ? consultations :
                  col === 'reservations' ? reservations :
                  col === 'rotation_queue' ? rotationQueue :
                  col === 'staff' ? staff : []
          }),
          update: jest.fn().mockResolvedValue({})
        }))
      })),
      command: {}
    })
  }

  test('TC7.1: 前瞻模拟避免前排技师承担重叠 - 两个相邻预约分配给不同技师', async () => {
    // 场景：R1(14:00-15:30) 和 R2(15:25-16:55) 有5分钟重叠
    // 两个女技师A(pos0)和B(pos1)都有0重叠、0轮钟数
    // 如果没有前瞻，A（位置靠前）会拿到R1，然后R2时A有5分钟重叠，B有0重叠→B拿到R2
    // 期望：A拿R1，B拿R2（无重叠分配）
    const reservations = [
      { _id: 'r1', date: '2026-05-06', startTime: '14:00', endTime: '15:30', gender: 'female', isClockIn: false, status: 'active' },
      { _id: 'r2', date: '2026-05-06', startTime: '15:25', endTime: '16:55', gender: 'female', isClockIn: false, status: 'active' }
    ]

    setupMock(mockSchedule, [], reservations, mockRotation, mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    expect(result.data.rearranged).toHaveLength(2)
    // R1分配给A（轮牌靠前），R2分配给B（避免A产生重叠）
    const r1Assignment = result.data.rearranged.find(r => r._id === 'r1')
    const r2Assignment = result.data.rearranged.find(r => r._id === 'r2')
    expect(r1Assignment.newTechnician).not.toBe(r2Assignment.newTechnician)
  })

  test('TC7.2: 前瞻模拟 - 选择对未来影响最小的技师', async () => {
    // 场景：3个预约，R1(14:00-15:30), R2(14:00-15:30), R3(15:25-16:55)
    // A(pos0)和B(pos1)都是女性
    // R1和R2同时间→分给不同人，R3与R1/R2有5分钟重叠
    // 前瞻应该让R3分配时仍有零重叠选择
    const reservations = [
      { _id: 'r1', date: '2026-05-06', startTime: '14:00', endTime: '15:30', gender: 'female', isClockIn: false, status: 'active' },
      { _id: 'r2', date: '2026-05-06', startTime: '14:00', endTime: '15:30', gender: 'female', isClockIn: false, status: 'active' },
      { _id: 'r3', date: '2026-05-06', startTime: '17:00', endTime: '18:30', gender: 'female', isClockIn: false, status: 'active' }
    ]

    setupMock(mockSchedule, [], reservations, mockRotation, mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    expect(result.data.rearranged).toHaveLength(3)
    // R3（17:00-18:30）与R1/R2（14:00-15:30）无重叠，应该分配成功
    const r3Assignment = result.data.rearranged.find(r => r._id === 'r3')
    expect(r3Assignment.newTechnician).toBeTruthy()
    expect(r3Assignment.reason).toContain('零重叠')
  })

  test('TC7.3: 两阶段分配 - 无零重叠时才允许重叠', async () => {
    // 场景：只有2个女技师，3个预约全部在同一时段附近
    // R1(14:00-15:30), R2(14:00-15:30), R3(15:25-16:55)
    // R1→A, R2→B（A被占满）, R3只能选有重叠的（A重叠5min，B重叠5min）
    const reservations = [
      { _id: 'r1', date: '2026-05-06', startTime: '14:00', endTime: '15:30', gender: 'female', isClockIn: false, status: 'active' },
      { _id: 'r2', date: '2026-05-06', startTime: '14:00', endTime: '15:30', gender: 'female', isClockIn: false, status: 'active' },
      { _id: 'r3', date: '2026-05-06', startTime: '15:25', endTime: '16:55', gender: 'female', isClockIn: false, status: 'active' }
    ]

    setupMock(mockSchedule, [], reservations, mockRotation, mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    // R3只能选有重叠的候选人，应该进入第二阶段但仍分配成功
    expect(result.data.rearranged).toHaveLength(3)
    expect(result.data.unassigned).toHaveLength(0)
    const r3 = result.data.rearranged.find(r => r._id === 'r3')
    expect(r3.reason).toContain('重叠')
  })

  test('TC7.4: 轮钟均匀分配 - 轮钟数少的优先', async () => {
    // 场景：A已经有1个轮钟预约（点钟占位），B没有
    // 新来的轮钟预约应该优先分配给B
    const reservations = [
      { _id: 'clock-a', date: '2026-05-06', startTime: '14:00', endTime: '15:00', technicianName: '技师A', technicianId: 'techA', gender: 'female', isClockIn: true, status: 'active' },
      { _id: 'r1', date: '2026-05-06', startTime: '16:00', endTime: '17:30', gender: 'female', isClockIn: false, status: 'active' },
      { _id: 'r2', date: '2026-05-06', startTime: '18:00', endTime: '19:30', gender: 'female', isClockIn: false, status: 'active' }
    ]

    setupMock(mockSchedule, [], reservations, mockRotation, mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    // 两个轮钟预约应该均匀分配：一个给A一个给B（不会全给A）
    const rearranged = result.data.rearranged
    expect(rearranged).toHaveLength(2)
    const assignedToA = rearranged.filter(r => r.newTechnician === '技师A').length
    const assignedToB = rearranged.filter(r => r.newTechnician === '技师B').length
    expect(assignedToA).toBe(1)
    expect(assignedToB).toBe(1)
  })

  test('TC7.5: 超过10分钟重叠的技师被排除', async () => {
    // 场景：A有点钟14:00-15:30，轮钟预约14:00-15:30（完全重叠60分钟>10）
    // 应该分配给B
    const reservations = [
      { _id: 'clock-a', date: '2026-05-06', startTime: '14:00', endTime: '15:30', technicianName: '技师A', technicianId: 'techA', gender: 'female', isClockIn: true, status: 'active' },
      { _id: 'r1', date: '2026-05-06', startTime: '14:00', endTime: '15:30', gender: 'female', isClockIn: false, status: 'active' }
    ]

    setupMock(mockSchedule, [], reservations, mockRotation, mockStaff)

    const { main } = require('./index')
    const result = await main({ date: '2026-05-06', mode: 'rearrange' })

    expect(result.code).toBe(0)
    expect(result.data.rearranged).toHaveLength(1)
    expect(result.data.rearranged[0].newTechnician).toBe('技师B')
  })
})
