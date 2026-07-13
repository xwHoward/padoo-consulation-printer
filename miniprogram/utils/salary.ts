/**
 * 薪资与佣金计算共享逻辑
 * 供 profile.ts 和 store-expense.ts 复用
 */

/** 加班费率（元/半小时） */
export const OVERTIME_RATE = 7.5;

/** 加钟费率（元/个） */
export const EXTRA_TIME_RATE = 25;

/** 点钟提成（元/次） */
export const CLOCK_IN_BONUS = 5;

/** 刮痧提成（元/次） */
export const GUASHA_BONUS = 10;

/** 单笔咨询单佣金计算结果 */
export interface ConsultationCommission {
  projectCommission: number;
  clockInBonus: number;
  overtimeHours: number;
  extraTimeCount: number;
  guashaBonus: number;
  total: number;
}

/**
 * 构建项目名 → 佣金的映射表
 */
export function buildProjectCommissionMap(projects: Project[]): Record<string, number> {
  const map: Record<string, number> = {};
  projects.forEach(p => {
    map[p.name] = p.commission || 0;
  });
  return map;
}

/**
 * 计算单笔咨询单的佣金明细
 */
export function computeConsultationCommission(
  record: ConsultationRecord,
  commissionMap: Record<string, number>
): ConsultationCommission {
  const projectCommission = commissionMap[record.project] || 0;
  const clockInBonus = record.isClockIn ? CLOCK_IN_BONUS : 0;
  const overtimeHours = record.overtime || 0;
  const extraTimeCount = record.extraTime || 0;
  const guashaBonus = record.guasha ? GUASHA_BONUS : 0;

  const total =
    projectCommission +
    clockInBonus +
    overtimeHours * OVERTIME_RATE +
    extraTimeCount * EXTRA_TIME_RATE +
    guashaBonus;

  return {
    projectCommission,
    clockInBonus,
    overtimeHours,
    extraTimeCount,
    guashaBonus,
    total,
  };
}

/**
 * 对加班时长按日期去重：同一天多笔取最大单笔，不同天累加
 */
export function deduplicateOvertimeByDate(records: ConsultationRecord[]): number {
  const overtimeByDate = new Map<string, number>();
  records.forEach(c => {
    if (c.overtime && c.overtime > 0) {
      const current = overtimeByDate.get(c.date) || 0;
      overtimeByDate.set(c.date, Math.max(current, c.overtime));
    }
  });
  return Array.from(overtimeByDate.values()).reduce((sum, v) => sum + v, 0);
}

/**
 * 格式化年月为月份字符串 "YYYY-MM"
 */
export function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
