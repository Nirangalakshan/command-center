import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { SalesLeadRow, LeadCallOutcome } from "@/services/salesWorkspaceApi";
import { applySalesLeadOutcome, OUTCOME_OPTIONS } from "@/services/salesWorkspaceApi";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeadOutcomeDrawerProps {
  lead: SalesLeadRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

export function LeadOutcomeDrawer({
  lead,
  open,
  onOpenChange,
  onSaved,
}: LeadOutcomeDrawerProps) {
  const [outcome, setOutcome] = useState<LeadCallOutcome>("no_answer");
  const [notes, setNotes] = useState("");
  const [customerResponse, setCustomerResponse] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);

  const needsFollowUp = outcome === "call_back_later";

  const outcomeValid = useMemo(() => {
    if (!needsFollowUp) return true;
    return !!(followUp.trim() && notes.trim());
  }, [needsFollowUp, followUp, notes]);

  async function submit() {
    if (!lead) return;
    if (!outcomeValid) {
      toast.error("Follow-up date and notes are required for “Call back later”.");
      return;
    }
    setBusy(true);
    try {
      await applySalesLeadOutcome({
        leadId: lead.id,
        outcome,
        notes,
        customerResponse,
        followUpAt: needsFollowUp ? new Date(followUp).toISOString() : null,
      });
      toast.success("Outcome saved");
      onOpenChange(false);
      setNotes("");
      setCustomerResponse("");
      setFollowUp("");
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save outcome";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Log call outcome</DrawerTitle>
          <DrawerDescription>
            {lead
              ? `${lead.display_name || "Lead"} · ${lead.phone || "—"}`
              : "Select a lead first."}
            {lead ? (
              <span className="mt-1 block text-muted-foreground text-xs">
                Submitted memo becomes the CRM notes preview shown to admins; every save also posts to Call logs with your agent id.
              </span>
            ) : null}
          </DrawerDescription>
        </DrawerHeader>
        <div className="grid gap-4 overflow-y-auto px-4 pb-2">
          <div className="grid gap-2">
            <Label>Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as LeadCallOutcome)}
              disabled={!lead}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose outcome" />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes for the team"
              rows={3}
              disabled={!lead}
            />
          </div>
          <div className="grid gap-2">
            <Label>Customer response (optional)</Label>
            <Textarea
              value={customerResponse}
              onChange={(e) => setCustomerResponse(e.target.value)}
              placeholder="What the customer said"
              rows={2}
              disabled={!lead}
            />
          </div>
          {needsFollowUp && (
            <div className="grid gap-2">
              <Label>Follow-up date &amp; time</Label>
              <Input
                type="datetime-local"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                disabled={!lead}
              />
            </div>
          )}
        </div>
        <DrawerFooter>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!lead || busy || !outcomeValid}
          >
            Save outcome
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              Cancel
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
