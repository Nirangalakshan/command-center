import { useState, useRef, useEffect } from "react";
import { Play, Pause, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRecordingDownloadUrl } from "@/services/yeastarService";
import { toast } from "sonner";

interface CallRecordingPlayerProps {
  recordingPath: string;
}

export function CallRecordingPlayer({ recordingPath }: CallRecordingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioUrl) {
      setIsLoading(true);
      try {
        const url = await getRecordingDownloadUrl(recordingPath);
        setAudioUrl(url);
        // Play will be triggered in the useEffect once audioUrl is set
      } catch (error) {
        // console.error("Failed to get recording URL:", error);
        toast.error("Failed to load recording. PBX might be unreachable.");
        setIsLoading(false);
      }
    } else if (audioRef.current) {
      audioRef.current.play().catch((err) => {
        // console.error("Playback failed:", err);
        toast.error("Playback failed. Browser might be blocking audio.");
      });
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    if (audioUrl && isLoading) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.oncanplaythrough = () => {
        setIsLoading(false);
        audio.play().catch(() => {});
        setIsPlaying(true);
      };

      audio.onended = () => {
        setIsPlaying(false);
      };

      audio.onerror = () => {
        setIsLoading(false);
        toast.error("Failed to play recording file.");
      };

      return () => {
        audio.pause();
        audio.src = "";
        audioRef.current = null;
      };
    }
  }, [audioUrl, isLoading]);

  const handleDownload = async () => {
    try {
      const url = audioUrl || (await getRecordingDownloadUrl(recordingPath));
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to generate download link.");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600"
        onClick={togglePlay}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current ml-0.5" />
        )}
      </Button>
      
      {(audioUrl || !isLoading) && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600"
          onClick={handleDownload}
          title="Download Recording"
        >
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
