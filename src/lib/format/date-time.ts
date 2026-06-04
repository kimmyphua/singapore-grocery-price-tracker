export function formatSingaporeDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore"
  })
    .format(new Date(value))
    .replace(/\b(am|pm)\b/i, (match) => match.toLowerCase());
}
