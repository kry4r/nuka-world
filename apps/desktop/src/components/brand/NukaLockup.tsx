import goodLogo from "@/assets/goodlogo.png";
import type { NukaBrandVariant } from "./NukaLogo";

type NukaLockupProps = {
  width?: number;
  className?: string;
  variant?: NukaBrandVariant;
};

export function NukaLockup({ width = 180, className, variant = "geometric" }: NukaLockupProps) {
  return (
    <span
      aria-hidden="true"
      className={["nuka-lockup", className].filter(Boolean).join(" ")}
      data-brand-kind="lockup"
      data-brand-variant={variant}
      style={{ width }}
    >
      <img alt="" src={goodLogo} />
    </span>
  );
}
