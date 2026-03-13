import type { ReactNode, SelectHTMLAttributes } from "react";

type FlatSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  shellClassName?: string;
};

export function FlatSelect({
  children,
  className,
  shellClassName,
  ...selectProps
}: FlatSelectProps) {
  return (
    <div
      className={`flat-select${shellClassName ? ` ${shellClassName}` : ""}`}
      data-flat-select="true"
    >
      <select className={className} {...selectProps}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="flat-select__icon"
        viewBox="0 0 16 16"
      >
        <path d="M4.5 6.5 8 10l3.5-3.5" />
      </svg>
    </div>
  );
}
