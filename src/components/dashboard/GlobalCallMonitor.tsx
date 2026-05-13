import { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useDashboard } from '@/context/DashboardDataContext';
import { useCallNotification } from '@/context/CallNotificationContext';
import { 
  buildIncomingCallSnapshot, 
  CallDetailsSheet 
} from '@/components/dashboard/CallDetailsSheet';
import { Card } from '@/components/ui/card';
import { Phone, ExternalLink, GripVertical } from 'lucide-react';
import { formatPhone } from '@/utils/formatters';
import { Button } from '@/components/ui/button';

export function GlobalCallMonitor() {
  const { incomingCalls, now, agents, queues, tenants, selectedTab } = useDashboard();
  const { selectedCall, setSelectedCall } = useCallNotification();

  // Position state for the draggable card
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    const card = (e.currentTarget as HTMLElement).closest('.draggable-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    // Calculate new position relative to initial fixed position (bottom-6 right-6)
    const newX = e.clientX - (window.innerWidth - 320 - 24) - dragOffset.current.x;
    const newY = e.clientY - (window.innerHeight - 180 - 24) - dragOffset.current.y;
    
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Show the card if there are incoming calls. 
  // We keep the overview check but allow it to be seen if the user is not on the dashboard root.
  const showFloatingCard = incomingCalls.length > 0;

  // Move the card slightly up if the SoftphoneWidget is likely to be present (bottom-24 instead of bottom-6)
  // SoftphoneWidget is at bottom-5.
  const firstCall = incomingCalls[0];
  const callSnapshot = useMemo(() => {
    if (!firstCall) return null;
    return buildIncomingCallSnapshot(firstCall, now);
  }, [firstCall, now]);

  const { pathname } = useLocation();
  const isBookingPage = pathname === '/booking' || pathname.startsWith('/bookings');

  if (isBookingPage) return null;

  return (
    <>
      {showFloatingCard && firstCall && (
        <div 
          className="fixed bottom-24 right-6 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300 draggable-card"
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
            touchAction: 'none'
          }}
        >
          <Card className="w-80 overflow-hidden border-2 border-amber-500/50 bg-white shadow-2xl ring-4 ring-amber-500/10 transition-shadow hover:shadow-amber-500/20">
            <div className="relative p-4">
              <div 
                className="absolute top-2 right-2 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <GripVertical className="h-4 w-4" />
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 animate-pulse">
                  <Phone className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-0.5">
                    Incoming Call
                  </p>
                  <h3 className="truncate font-mono text-lg font-bold text-slate-900">
                    {formatPhone(firstCall.callerNumber)}
                  </h3>
                  {firstCall.callerName && (
                    <p className="truncate text-sm text-slate-500">
                      {firstCall.callerName}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="mt-4 flex gap-2">
                <Button 
                  onClick={() => callSnapshot && setSelectedCall(callSnapshot)}
                  className="flex-1 bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-200"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Details
                </Button>
              </div>

              <div className="absolute bottom-0 left-0 h-1 bg-amber-100 w-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
                  style={{ width: `${Math.min(100, ((now - firstCall.waitingSince) / 30000) * 100)}%` }}
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      <CallDetailsSheet
        detail={selectedCall}
        open={Boolean(selectedCall)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCall(null);
          }
        }}
      />
    </>
  );
}
