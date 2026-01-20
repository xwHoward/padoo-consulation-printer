export function formatTime(date: Date, withDate = true): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return withDate
    ? `${month}-${day} ${minutes}:${hours}`
    : `${hours}:${minutes}`;
}
