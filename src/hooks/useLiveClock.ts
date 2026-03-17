import { useState, useEffect } from 'react';

/** Returns a live Date that ticks every second (Melbourne timezone display-ready). */
export function useLiveClock() {
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatted = clock.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Australia/Melbourne',
  });

  return { clock, formatted };
}
