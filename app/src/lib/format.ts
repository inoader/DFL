import type { AppLanguage } from "./i18n";

const WAD = 1_000_000_000_000_000_000n;

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatTokenAmount(
  raw: bigint,
  decimals: number,
  maxFrac = 4,
): string {
  if (raw === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const integer = raw / divisor;
  const remainder = raw % divisor;
  const fracStr = remainder
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFrac);
  const trimmed = fracStr.replace(/0+$/, "");
  if (trimmed.length === 0) return String(integer);
  return `${String(integer)}.${trimmed}`;
}

export function formatHealthFactor(wad: bigint): string {
  if (wad >= WAD * 100n) return "∞";
  const scaled = Number((wad * 10000n) / WAD);
  return (scaled / 10000).toFixed(2);
}

export function healthFactorNumber(wad: bigint): number {
  if (wad >= WAD * 100n) return 100;
  return Number((wad * 10000n) / WAD) / 10000;
}

export function healthColor(wad: bigint): string {
  const factor = healthFactorNumber(wad);
  if (factor >= 2) return "#16a34a";
  if (factor >= 1.5) return "#d97706";
  return "#dc2626";
}

export function healthBarPercent(wad: bigint): number {
  const factor = healthFactorNumber(wad);
  return Math.min(Math.max((factor / 3) * 100, 0), 100);
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "Active":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60";
    case "ReduceOnly":
      return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60";
    case "Frozen":
      return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/60";
    case "Settlement":
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
  }
}

export function marketStatusLabel(
  status: string,
  language: AppLanguage = "zh-CN",
): string {
  if (language === "en") {
    switch (status) {
      case "Active":
        return "Active";
      case "ReduceOnly":
        return "Reduce Only";
      case "Frozen":
        return "Frozen";
      case "Settlement":
        return "Settlement";
      default:
        return status;
    }
  }

  switch (status) {
    case "Active":
      return "正常";
    case "ReduceOnly":
      return "仅降风险";
    case "Frozen":
      return "冻结";
    case "Settlement":
      return "结算中";
    default:
      return status;
  }
}

export function healthToneClass(wad: bigint): string {
  const factor = healthFactorNumber(wad);
  if (factor >= 2) return "text-emerald-600";
  if (factor >= 1.5) return "text-amber-600";
  return "text-rose-600";
}

export function dollarToWad(dollar: string): bigint {
  const parts = dollar.split(".");
  const integer = BigInt(parts[0] || "0");
  if (!parts[1]) return integer * WAD;
  const fracStr = parts[1].slice(0, 18).padEnd(18, "0");
  return integer * WAD + BigInt(fracStr);
}

export function parseTokenInput(
  value: string,
  decimals: number,
  messages: { required: string; positive: string } = {
    required: "请输入数量",
    positive: "数量必须大于 0",
  },
): bigint {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(messages.required);

  const parts = trimmed.split(".");
  const integer = BigInt(parts[0] || "0");
  const divisor = 10n ** BigInt(decimals);
  let fractional = 0n;

  if (parts[1]) {
    const fracStr = parts[1].slice(0, decimals).padEnd(decimals, "0");
    fractional = BigInt(fracStr);
  }

  const result = integer * divisor + fractional;
  if (result <= 0n) throw new Error(messages.positive);
  return result;
}
