import { Card, CardContent } from '@/components/ui/card';

interface MetricCardProps {
  label: string;
  value: string | number;
  accent: string;
  sub?: string;
}

export function MetricCard({ label, value, accent, sub }: MetricCardProps) {
  return (
    <Card className="overflow-hidden border-border/80 bg-white shadow-sm">
      <div className="h-1 w-full" style={{ backgroundColor: accent }} />
      <CardContent className="space-y-2 p-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </div>
        <div className="text-3xl font-semibold tracking-tight" style={{ color: accent }}>
          {value}
        </div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
