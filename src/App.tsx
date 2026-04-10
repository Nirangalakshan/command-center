import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FirebaseAuthProvider } from "@/integrations/firebase/FirebaseAuthProvider";
import Index from "./pages/Index.tsx";
import BookingPage from "./pages/BookingPage.tsx";
import BookingDetailsPage from "./pages/BookingDetailsPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <FirebaseAuthProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/booking" element={<BookingPage />} />
            <Route path="/bookings/dashboard" element={<BookingDetailsPage />} />
            <Route path="/bookings/pending" element={<BookingDetailsPage />} />
            <Route path="/bookings/confirmed" element={<BookingDetailsPage />} />
            <Route path="/bookings/completed" element={<BookingDetailsPage />} />
            <Route path="/bookings/cancelled" element={<BookingDetailsPage />} />
            <Route path="/bookings/:id" element={<BookingDetailsPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </FirebaseAuthProvider>
);

export default App;