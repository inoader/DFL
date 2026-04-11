"use client";

import {
  formatHealthFactor,
  healthColor,
  healthBarPercent,
  healthToneClass,
} from "../lib/format";
import { useLanguage } from "./providers";

type Props = {
  healthFactorWad: bigint;
};

export function HealthIndicator({ healthFactorWad }: Props) {
  const { copy } = useLanguage();
  const color = healthColor(healthFactorWad);
  const percent = healthBarPercent(healthFactorWad);
  const label = formatHealthFactor(healthFactorWad);
  const toneClass = healthToneClass(healthFactorWad);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">{copy.position.healthFactor}</span>
        <span className={`text-lg font-semibold ${toneClass}`} style={{ color }}>
          {label}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percent}%`, background: color }}
        />
      </div>
    </div>
  );
}
