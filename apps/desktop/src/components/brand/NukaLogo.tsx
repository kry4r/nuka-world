export type NukaBrandVariant = "natural" | "geometric";

type NukaLogoProps = {
  size?: number;
  className?: string;
  variant?: NukaBrandVariant;
};

function GeometricMark() {
  return (
    <path
      d="M7 48L23 28L29 35L39 17L53 36L59 48H49L41 36L32 48H7ZM34 48L43 29L57 48H34Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  );
}

function NaturalMark() {
  return (
    <path
      d="M8 48C11 44 14 41 18 36L23 31L29 34L38 20L44 27L48 26L56 40L59 48H47L43 39L37 43L33 38L25 44L19 40L14 43L11 48H8ZM32 27L35 32L40 26L39 35L44 31L43 39L36 37L32 41L29 35L24 38L27 31L23 32L26 27L30 29L32 27Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  );
}

export function NukaLogo({ size = 28, className, variant = "geometric" }: NukaLogoProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-brand-kind="mark"
      data-brand-variant={variant}
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      {variant === "natural" ? <NaturalMark /> : <GeometricMark />}
    </svg>
  );
}
