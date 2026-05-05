import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLeaveRequestAttachmentSignedUrl } from "@/services/leaveRequestsApi";
import { ImageIcon, Loader2 } from "lucide-react";

interface LeaveRequestPhotoButtonProps {
  storagePath: string | null | undefined;
  label?: string;
}

export function LeaveRequestPhotoButton({ storagePath, label = "View photo" }: LeaveRequestPhotoButtonProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!storagePath) {
    return <span className="text-muted-foreground">—</span>;
  }

  const openPhoto = async () => {
    setOpen(true);
    setError(null);
    setUrl(null);
    setLoading(true);
    try {
      const signed = await getLeaveRequestAttachmentSignedUrl(storagePath);
      setUrl(signed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load image.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => void openPhoto()}>
        <ImageIcon className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl bg-white">
          <DialogHeader>
            <DialogTitle>Leave attachment</DialogTitle>
          </DialogHeader>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
          )}
          {url && !loading && (
            <div className="max-h-[75vh] overflow-auto rounded-lg border border-border/60 bg-slate-50 p-2">
              <img src={url} alt="Leave request attachment" className="mx-auto max-h-[70vh] w-auto object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
