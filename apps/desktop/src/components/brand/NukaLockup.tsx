import nukaMark from "@/assets/nuka.svg";

type NukaLockupProps = {
  width?: number;
  className?: string;
};

export function NukaLockup({ width = 180, className }: NukaLockupProps) {
  return (
    <span
      aria-hidden="true"
      className={["nuka-lockup", className].filter(Boolean).join(" ")}
      data-brand-source="nuka-svg"
      data-brand-kind="lockup"
      style={{ width }}
    >
      <img alt="" src={nukaMark} />
    </span>
  );
}
