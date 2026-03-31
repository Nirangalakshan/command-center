import { useEffect, useState } from 'react';
import type { VehicleRecord } from '@/services/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface BookingFormValues {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  selectedVehicleId: string;
  vehicleRego: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  serviceType: string;
  bookingDate: string;
  dropOffTime: string;
  pickupTime: string;
  notes: string;
}

interface BookingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  availableVehicles: VehicleRecord[];
}

export function BookingFormDialog({
  open,
  onOpenChange,
  customerName,
  customerPhone,
  customerEmail,
  availableVehicles,
}: BookingFormDialogProps) {
  const { toast } = useToast();
  const [bookingForm, setBookingForm] = useState<BookingFormValues>({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    selectedVehicleId: 'new',
    vehicleRego: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    serviceType: '',
    bookingDate: '',
    dropOffTime: '',
    pickupTime: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setBookingForm((prev) => {
      const firstVehicle = availableVehicles[0];
      if (firstVehicle) {
        return {
          ...prev,
          customerName,
          customerPhone,
          customerEmail,
          selectedVehicleId: firstVehicle.id,
          vehicleRego: firstVehicle.rego || '',
          vehicleMake: firstVehicle.make || '',
          vehicleModel: firstVehicle.model || '',
          vehicleYear: firstVehicle.year ? String(firstVehicle.year) : '',
        };
      }

      return {
        ...prev,
        customerName,
        customerPhone,
        customerEmail,
        selectedVehicleId: 'new',
      };
    });
  }, [availableVehicles, customerEmail, customerName, customerPhone, open]);

  const handleVehicleSelect = (vehicleId: string) => {
    if (vehicleId === 'new') {
      setBookingForm((prev) => ({
        ...prev,
        selectedVehicleId: 'new',
        vehicleRego: '',
        vehicleMake: '',
        vehicleModel: '',
        vehicleYear: '',
      }));
      return;
    }

    const selectedVehicle = availableVehicles.find((vehicle) => vehicle.id === vehicleId);
    if (!selectedVehicle) return;
    setBookingForm((prev) => ({
      ...prev,
      selectedVehicleId: vehicleId,
      vehicleRego: selectedVehicle.rego || '',
      vehicleMake: selectedVehicle.make || '',
      vehicleModel: selectedVehicle.model || '',
      vehicleYear: selectedVehicle.year ? String(selectedVehicle.year) : '',
    }));
  };

  const handleBookingSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bookingForm.customerName || !bookingForm.customerPhone || !bookingForm.serviceType || !bookingForm.bookingDate || !bookingForm.dropOffTime) {
      toast({
        title: 'Missing required fields',
        description: 'Please complete customer details, service, date, and drop-off time.',
      });
      return;
    }

    toast({
      title: 'Booking drafted',
      description: `${bookingForm.serviceType} for ${bookingForm.customerName} on ${bookingForm.bookingDate} at ${bookingForm.dropOffTime}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Book fdsafasdf Service</DialogTitle>
          <DialogDescription>
            Create a customer booking from the live call details panel.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleBookingSubmit}>
          <div className="space-y-3">
            <div className="font-medium text-slate-900">Customer Details</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="booking-customer-name">Full name</Label>
                <Input
                  id="booking-customer-name"
                  value={bookingForm.customerName}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, customerName: event.target.value }))}
                  placeholder="Customer name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-customer-phone">Phone</Label>
                <Input
                  id="booking-customer-phone"
                  value={bookingForm.customerPhone}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, customerPhone: event.target.value }))}
                  placeholder="Phone number"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="booking-customer-email">Email</Label>
                <Input
                  id="booking-customer-email"
                  type="email"
                  value={bookingForm.customerEmail}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, customerEmail: event.target.value }))}
                  placeholder="name@example.com"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="font-medium text-slate-900">Vehicle Details</div>
            <div className="space-y-1.5">
              <Label>Saved vehicle</Label>
              <Select value={bookingForm.selectedVehicleId} onValueChange={handleVehicleSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New vehicle</SelectItem>
                  {availableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.rego} - {formatVehicleLabel(vehicle)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="booking-vehicle-rego">Registration</Label>
                <Input
                  id="booking-vehicle-rego"
                  value={bookingForm.vehicleRego}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, vehicleRego: event.target.value }))}
                  placeholder="ABC-1234"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-vehicle-year">Year</Label>
                <Input
                  id="booking-vehicle-year"
                  value={bookingForm.vehicleYear}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, vehicleYear: event.target.value }))}
                  placeholder="2020"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-vehicle-make">Make</Label>
                <Input
                  id="booking-vehicle-make"
                  value={bookingForm.vehicleMake}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, vehicleMake: event.target.value }))}
                  placeholder="Toyota"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-vehicle-model">Model</Label>
                <Input
                  id="booking-vehicle-model"
                  value={bookingForm.vehicleModel}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, vehicleModel: event.target.value }))}
                  placeholder="Corolla"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="font-medium text-slate-900">Booking Details</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Service type</Label>
                <Select
                  value={bookingForm.serviceType}
                  onValueChange={(value) => setBookingForm((prev) => ({ ...prev, serviceType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General Service">General Service</SelectItem>
                    <SelectItem value="Oil Change">Oil Change</SelectItem>
                    <SelectItem value="Brake Inspection">Brake Inspection</SelectItem>
                    <SelectItem value="Engine Diagnostics">Engine Diagnostics</SelectItem>
                    <SelectItem value="AC Service">AC Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-date">Booking date</Label>
                <Input
                  id="booking-date"
                  type="date"
                  value={bookingForm.bookingDate}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, bookingDate: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-dropoff-time">Drop-off time</Label>
                <Input
                  id="booking-dropoff-time"
                  type="time"
                  value={bookingForm.dropOffTime}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, dropOffTime: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-pickup-time">Pickup time</Label>
                <Input
                  id="booking-pickup-time"
                  type="time"
                  value={bookingForm.pickupTime}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, pickupTime: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="booking-notes">Notes</Label>
                <Textarea
                  id="booking-notes"
                  value={bookingForm.notes}
                  onChange={(event) => setBookingForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Symptoms, preferred drop-off instructions, or additional customer requests."
                  rows={4}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Booking</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatVehicleLabel(vehicle: VehicleRecord): string {
  const parts = [
    vehicle.year ? String(vehicle.year) : null,
    vehicle.make,
    vehicle.model,
  ].filter(Boolean);
  return parts.join(' ') || 'Vehicle';
}
