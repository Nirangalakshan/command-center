import { useState, useRef, useEffect } from "react";
import { Download, Loader2, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getRecordingDownloadUrl,
  getRecordingPlaybackObjectUrl,
} from "@/services/yeastarService";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface CallRecordingPlayerProps {
  recordingPath: string;
}

function mediaErrorMessage(el: HTMLAudioElement): string {
  const err = el.error;
  if (!err) return "Unknown playback error";
  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Playback aborted";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Network error while loading audio";
    case MediaError.MEDIA_ERR_DECODE:
      return "File is not playable audio (corrupt or wrong format)";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Format not supported by this browser";
    default:
      return `Playback error (code ${err.code})`;
  }
}

export function CallRecordingPlayer({ recordingPath }: CallRecordingPlayerProps) {
  const { permissions } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** `blob:` URL from edge relay — must revoke to avoid leaking memory */
  const objectUrlRef = useRef<string | null>(null);

  const canAccess = permissions.canViewCallRecordings;

  const revokeBlob = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setBlobUrl(null);
  };

  useEffect(() => {
    revokeBlob();
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [recordingPath]);

  const loadRecording = async () => {
    if (!canAccess) return;
    if (blobUrl && audioRef.current) {
      void audioRef.current.play();
      return;
    }

    setLoading(true);
    try {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      const url = await getRecordingPlaybackObjectUrl(recordingPath);
      objectUrlRef.current = url;
      setBlobUrl(url);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to load recording: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!canAccess) return;
    try {
      const url = await getRecordingDownloadUrl(recordingPath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to generate download link: ${msg}`);
    }
  };

  if (!canAccess) {
    return (
      <span
        className="text-muted-foreground text-[10px]"
        title="Recordings are restricted to super admins"
      >
        —
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5">
      <div className="flex flex-wrap items-center gap-2">
        {!blobUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 rounded-full bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={loadRecording}
            disabled={loading}
            title="Load and play recording"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Headphones className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            )}
            {loading ? "Loading…" : "Play"}
          </Button>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <audio
              ref={audioRef}
              src={blobUrl}
              controls
              preload="auto"
              playsInline
              className="h-9 w-full max-w-[min(100%,280px)] rounded-md"
              onLoadedMetadata={(e) => {
                void e.currentTarget.play().catch(() => {
                  /* autoplay blocked — user uses controls */
                });
              }}
              onError={(e) => {
                toast.error(mediaErrorMessage(e.currentTarget));
              }}
            >
              Your browser does not support audio playback.
            </audio>
            <button
              type="button"
              className="w-fit text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={revokeBlob}
            >
              Close player
            </button>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100"
          onClick={handleDownload}
          disabled={loading}
          title="Open download in new tab"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
