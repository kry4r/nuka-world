import { NukaLogo, type NukaBrandVariant } from "./NukaLogo";

type NukaLockupProps = {
  width?: number;
  className?: string;
  variant?: NukaBrandVariant;
};

export function NukaLockup({ width = 180, className, variant = "geometric" }: NukaLockupProps) {
  const fontWeight = variant === "natural" ? 500 : 700;
  const letterSpacing = variant === "natural" ? 4 : 1;

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-brand-kind="lockup"
      data-brand-variant={variant}
      height={(width * 64) / 180}
      viewBox="0 0 180 64"
      width={width}
    >
      <g transform="translate(2 6)">
        <NukaLogo size={52} variant={variant} />
      </g>
      <text
        fill="currentColor"
        fontFamily='Inter, "Segoe UI", sans-serif'
        fontSize="30"
        fontWeight={fontWeight}
        letterSpacing={letterSpacing}
        x="66"
        y="43"
      >
        Nuka
      </text>
    </svg>
  );
}
