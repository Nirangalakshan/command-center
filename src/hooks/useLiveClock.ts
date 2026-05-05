import { useState, useEffect } from 'react';
import { formatAustralianNavDate, formatAustralianNavTime } from '@/utils/australianTime';

/** Live clock for the dashboard header (Australia/Melbourne; shows AEST/AEDT in the time string). */
export function useLiveClock() {
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    clock,
    formattedDate: formatAustralianNavDate(clock),
    formattedTime: formatAustralianNavTime(clock),
  };
}
