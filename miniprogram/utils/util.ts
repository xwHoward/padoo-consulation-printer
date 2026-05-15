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

export function getDaysFromNow(targetDateStr: string): number {
  const now = new Date();
  const targetDate = new Date(targetDateStr);
  
  now.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  
  const diffTime = targetDate.getTime() - now.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

export function formatDaysFromNow(targetDateStr: string): string {
  const days = getDaysFromNow(targetDateStr);
  
  if (days === 1) {
    return '（明天）';
  }  else if (days > 1) {
    return `（${days}天后）`;
  } 
  
  return '';
}
