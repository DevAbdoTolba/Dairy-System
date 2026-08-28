export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayInCairo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isIsoDate(value: string) {
  return ISO_DATE.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf());
}

export function formatArabicDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}
