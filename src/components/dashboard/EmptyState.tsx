export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white/70 px-6 py-12 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
