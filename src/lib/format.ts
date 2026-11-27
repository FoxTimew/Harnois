import { Prisma } from "@/generated/prisma/browser";
const { Decimal } = Prisma;

export function formatMoney(value: InstanceType<typeof Decimal> | string) {
  const fixed = new Decimal(value).toFixed(2);
  const [integer, fraction] = fixed.split(".");
  const negative = fixed.startsWith("-");
  const grouped = new Intl.NumberFormat("fr-FR").format(
    BigInt(integer.replace("-", "")),
  );
  return `${negative ? "−" : ""}${grouped},${fraction}\u00a0€`;
}
export function formatDate(
  value: Date | string | null | undefined,
  time = true,
) {
  if (!value) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "medium",
    ...(time ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}
/** Paris midnight, including the daylight-saving offset at the requested civil date. */
export function parisDayBoundary(date: string, next = false) {
  const utc = new Date(date + "T00:00:00.000Z");
  if (next) utc.setUTCDate(utc.getUTCDate() + 1);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(utc),
  );
  return new Date(+utc - hour * 3_600_000);
}
