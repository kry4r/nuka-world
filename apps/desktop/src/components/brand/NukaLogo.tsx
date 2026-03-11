import goodLogo from "@/assets/goodlogo.png";

type NukaLogoProps = {
  size?: number;
  className?: string;
};

export function NukaLogo({ size = 112, className }: NukaLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={["nuka-logo", className].filter(Boolean).join(" ")}
      data-brand-kind="mark"
      data-brand-source="goodlogo-png"
      style={{ width: size }}
    >
      <img alt="" src={goodLogo} />
    </span>
  );
}
