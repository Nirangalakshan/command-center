interface LiveDotProps {
  color?: string;
}

export function LiveDot({ color = 'var(--cc-color-red)' }: LiveDotProps) {
  return (
    <span className="relative mr-2 inline-flex h-2.5 w-2.5 items-center justify-center align-middle">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}
