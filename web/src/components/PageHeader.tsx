"use client";

import { useI18n } from "@/lib/i18n";

export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex flex-col gap-1">
        <h1 className="font-[var(--font-oswald)] text-2xl font-bold text-white tracking-wide m-0">
          {title}
        </h1>
        {subtitle && (
          <span className="text-xs text-nuka-muted">{subtitle}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          className="text-xs text-nuka-muted hover:text-white transition-colors"
        >
          {locale === "en" ? "中文" : "EN"}
        </button>
        <div className="w-8 h-8 rounded-full bg-nuka-placeholder" />
      </div>
    </div>
  );
}
