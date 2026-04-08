import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Ban, CalendarCheck, ChevronDown, ChevronRight, CheckCircle, Clock, Flag, LayoutDashboard } from 'lucide-react';

export default function BookingSidebar() {
  const location = useLocation();
  const pathname = location.pathname;
  const locationState = location.state;
  const commonState = { state: locationState };

  const isBookings = pathname.startsWith('/bookings');
  const isBookingsDashboard = pathname === '/bookings/dashboard';
  const isBookingsPending = pathname === '/bookings/pending';
  const isBookingsConfirmed = pathname === '/bookings/confirmed';
  const isBookingsCompleted = pathname === '/bookings/completed';
  const isBookingsCancelled = pathname === '/bookings/cancelled';

  const [openBookings, setOpenBookings] = useState(true);

  return (
    <nav className="hidden md:flex md:w-64 md:h-full bg-neutral-900 flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-700 flex items-center justify-center text-white font-bold text-sm">B</div>
          <div>
            <h1 className="font-bold text-base text-white">BMS PRO</h1>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-neutral-500 uppercase">Black</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 p-4 space-y-1 overflow-y-auto">

        {/* Dashboard */}
     
<Link
  to="/"
  className="flex items-center space-x-3 px-4 py-3 rounded-xl text-sm transition text-neutral-400 hover:bg-neutral-800 hover:text-white"
>
  <LayoutDashboard className="h-5 w-5" />
  <span>Dashboard</span>
</Link>

        {/* Bookings toggle */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenBookings((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter') setOpenBookings((v) => !v); }}
          className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm transition cursor-pointer select-none ${
            isBookings ? 'bg-white/10 text-white font-semibold' : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          <CalendarCheck className="h-5 w-5" />
          <span>Bookings</span>
          <span className="ml-auto opacity-70">
            {openBookings ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </div>

        {openBookings && (
          <>
            <Link
              to="/bookings/dashboard"
              {...commonState}
              className={`ml-3 flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                isBookingsDashboard ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Today's Bookings</span>
            </Link>
            <Link
              to="/bookings/pending"
              {...commonState}
              className={`ml-3 flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                isBookingsPending ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>Booking Requests</span>
            </Link>
            <Link
              to="/bookings/confirmed"
              {...commonState}
              className={`ml-3 flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                isBookingsConfirmed ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <CheckCircle className="h-4 w-4" />
              <span>Confirmed Bookings</span>
            </Link>
            <Link
              to="/bookings/completed"
              {...commonState}
              className={`ml-3 flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                isBookingsCompleted ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <Flag className="h-4 w-4" />
              <span>Completed Bookings</span>
            </Link>
            <Link
              to="/bookings/cancelled"
              {...commonState}
              className={`ml-3 flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                isBookingsCancelled ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <Ban className="h-4 w-4" />
              <span>Cancelled Bookings</span>
            </Link>
          </>
        )}
      </div>

      {/* User footer */}
      <div className="p-4 border-t border-neutral-800">
      </div>
    </nav>
  );
}
