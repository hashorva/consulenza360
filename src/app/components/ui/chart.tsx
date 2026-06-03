import * as React from "react";
import { ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { cn } from "../../lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
    theme?: {
      light: string;
      dark: string;
    };
  }
>;

type ChartContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  config: ChartConfig;
  children: React.ReactElement;
};

export const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, style, ...props }, ref) => {
    const uniqueId = React.useId();
    const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;
    const colorVars = Object.entries(config).reduce<Record<string, string>>((vars, [key, item]) => {
      if (item.color) vars[`--color-${key}`] = item.color;
      if (item.theme?.light) vars[`--color-${key}`] = item.theme.light;
      return vars;
    }, {});

    return (
      <div
        ref={ref}
        data-chart={chartId}
        className={cn(
          "flex aspect-auto justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-stone-500 [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-stone-200/70 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-stone-300 [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none dark:[&_.recharts-cartesian-axis-tick_text]:fill-stone-400 dark:[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-stone-800/70 dark:[&_.recharts-curve.recharts-tooltip-cursor]:stroke-stone-700",
          className,
        )}
        style={{ ...colorVars, ...style } as React.CSSProperties}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    );
  },
);
ChartContainer.displayName = "ChartContainer";

export const ChartTooltip = RechartsTooltip;

type ChartTooltipContentProps = {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    name?: string | number;
    value?: number | string;
    color?: string;
  }>;
  label?: string | number;
  config?: ChartConfig;
};

export function ChartTooltipContent({ active, payload, label, config }: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-32 rounded-xl border border-stone-200/80 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-stone-800/80 dark:bg-stone-950/95">
      {label ? <div className="mb-1.5 font-medium text-stone-950 dark:text-stone-50">{label}</div> : null}
      <div className="space-y-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const labelText = config?.[key]?.label ?? item.name ?? key;

          return (
            <div key={key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: item.color ?? `var(--color-${key})` }} />
              <span className="flex-1 text-stone-500 dark:text-stone-400">{labelText}</span>
              <span className="font-mono font-medium text-stone-950 dark:text-stone-50">{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
