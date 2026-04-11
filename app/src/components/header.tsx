"use client";

import { Moon, Sun } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { useLanguage, useTheme } from "./providers";
import { LANGUAGE_OPTIONS, type AppLanguage } from "../lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function Header() {
  const { language, setLanguage, copy } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 bg-white/75 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/75">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <BrandMark className="shrink-0" />
          <div className="space-y-0.5">
            <span className="block text-xl font-bold tracking-tight text-teal-700 dark:text-teal-300">
              {copy.header.brandTitle}
            </span>
            <span className="block text-sm text-slate-500 dark:text-slate-400">
              {copy.header.subtitle}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
            <button
              type="button"
              aria-label={copy.header.switchToLight}
              aria-pressed={theme === "light"}
              className={[
                "flex size-10 items-center justify-center rounded-full transition",
                theme === "light"
                  ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
              ].join(" ")}
              onClick={() => setTheme("light")}
            >
              <Sun className="size-4" />
            </button>
            <button
              type="button"
              aria-label={copy.header.switchToDark}
              aria-pressed={theme === "dark"}
              className={[
                "flex size-10 items-center justify-center rounded-full transition",
                theme === "dark"
                  ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
              ].join(" ")}
              onClick={() => setTheme("dark")}
            >
              <Moon className="size-4" />
            </button>
          </div>
          <div className="w-[132px]">
            <Select
              value={language}
              onValueChange={(value: string) => setLanguage(value as AppLanguage)}
            >
              <SelectTrigger aria-label={copy.header.languageLabel}>
                <SelectValue placeholder={copy.header.languageLabel} />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </header>
  );
}
