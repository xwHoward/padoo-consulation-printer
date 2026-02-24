export const SPARE_TIME = 10; // 10分钟准备+休息时间

export function formatTime(date: Date, withDate = true): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return withDate
    ? `${ month }-${ day } ${ hours }:${ minutes }`
    : `${ hours }:${ minutes }`;
}

// 解析项目时长（分钟）
export function parseProjectDuration(projectName: string): number {
  const match = projectName.match(/(\d+)min/);
  return match ? parseInt(match[1]) : 0;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${ year }-${ month }-${ day }`;
}

export function getMinutesDiff(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  return endH * 60 + endM - (startH * 60 + startM);
}

export function isTimeOverlapping(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA < endB && endA > startB;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${ hours }h${ mins }m`;
  } else if (hours > 0) {
    return `${ hours }h`;
  } else {
    return `${ mins }m`;
  }
}

export const SHIFT_START_TIMES: Record<string, string> = {
  morning: "12:00",
  evening: "13:00",
};

export const SHIFT_END_TIMES: Record<string, string> = {
  morning: "22:00",
  evening: "23:00",
};


/**
 * 计算加班单位（每30分钟为一个单位）
 * @param startTime 报钟开始时间 HH:mm
 * @param shiftEndTime 班次结束时间 HH:mm
 * @returns 加班单位数
 */
export function calculateOvertimeUnits(
  startTime: string,
  shiftEndTime: string
): number {
  if (!startTime || !shiftEndTime) return 0;
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = shiftEndTime.split(":").map(Number);

  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;

  if (startTotalMinutes <= endTotalMinutes) {
    return 0;
  }

  const overtimeMinutes = startTotalMinutes - endTotalMinutes;
  return Math.floor(overtimeMinutes / 30);
}

/**
 * 计算项目结束时间（包含准备时间10min）
 * @param startTime 开始时间 Date
 * @param project 项目名称
 * @param extraTimeUnits 加钟单位（每单位30min）
 * @returns 结束时间 Date
 */
export function calculateProjectEndTime(
  startTime: Date,
  project: string,
  extraTimeUnits: number = 0
): Date {
  const projectDuration = parseProjectDuration(project);
  const extraTimeMinutes = extraTimeUnits * 30;
  const totalDuration = projectDuration + extraTimeMinutes + SPARE_TIME; // 项目时长 + 加钟 + 10分钟准备
  return new Date(startTime.getTime() + totalDuration * 60 * 1000);
}

export function laterOrEqualTo(a: string, b: string): boolean {
  const [aHour, aMin] = a.split(":").map(Number);
  const [bHour, bMin] = b.split(":").map(Number);
  return aHour * 60 + aMin >= bHour * 60 + bMin;
}

export function earlierThan(a: string, b: string): boolean {
  const [aHour, aMin] = a.split(":").map(Number);
  const [bHour, bMin] = b.split(":").map(Number);
  return aHour * 60 + aMin < bHour * 60 + bMin;
}

export function getCurrentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPreviousDate(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getNextDate(dateStr: string, maxDate?: string): string | null {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const nextDate = `${year}-${month}-${day}`;
  
  if (maxDate && nextDate > maxDate) {
    return null;
  }
  
  return nextDate;
}
