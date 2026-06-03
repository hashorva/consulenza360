import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

type IconProps = {
  icon: IconSvgElement;
  className?: string;
  size?: number;
};

export function Icon({ icon, className, size = 18 }: IconProps) {
  return <HugeiconsIcon icon={icon} size={size} color="currentColor" strokeWidth={1.7} className={className} />;
}

