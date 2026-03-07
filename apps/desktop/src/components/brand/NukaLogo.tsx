type NukaLogoProps = {
  size?: number;
  className?: string;
};

export function NukaLogo({ size = 28, className }: NukaLogoProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      <rect fill="currentColor" height="64" rx="18" width="64" />
      <path d="M14 42 28 22l7 10 7-8 8 18H14Z" fill="#f8f3ec" />
      <path d="M18 42h28" stroke="#d8ccbd" strokeLinecap="round" strokeWidth="4" />
      <circle cx="45" cy="18" fill="#f8f3ec" opacity="0.88" r="4" />
    </svg>
  );
}
