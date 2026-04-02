import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import BookingPage from "./pages/BookingPage.tsx";
import BookingDetailsPage from "./pages/BookingDetailsPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/booking" element={<BookingPage />} />

          {/* Redirect old route */}
          <Route path="/bookingsdetails" element={<Navigate to="/bookings/dashboard" replace />} />

          {/* Booking list views */}
          <Route path="/bookings/dashboard" element={<BookingDetailsPage />} />
          <Route path="/bookings/pending" element={<BookingDetailsPage />} />
          <Route path="/bookings/confirmed" element={<BookingDetailsPage />} />
          <Route path="/bookings/completed" element={<BookingDetailsPage />} />
          <Route path="/bookings/cancelled" element={<BookingDetailsPage />} />

          {/* Booking detail view */}
          <Route path="/bookings/:id" element={<BookingDetailsPage />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;