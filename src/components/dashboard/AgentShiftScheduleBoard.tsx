import { useState, useEffect } from "react";
import { Agent, AgentShiftSchedule } from "@/services/types";
import { fetchAgentShiftSchedules, upsertAgentShiftSchedule } from "@/services/attendanceApi";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Search, Clock, Moon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface AgentShiftScheduleBoardProps {
  agents: Agent[];
}

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function parseShift(val: string | null) {
  if (!val || val.toUpperCase() === "OFF")
    return { isOff: true, start: "09:00", end: "17:00" };
  const parts = val.split(" - ");
  if (parts.length === 2) {
    return { isOff: false, start: parts[0], end: parts[1] };
  }
  return { isOff: true, start: "09:00", end: "17:00" };
}

function formatShift(isOff: boolean, start: string, end: string) {
  return isOff ? "OFF" : `${start} - ${end}`;
}

function ShiftCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (newVal: string) => void;
}) {
  const { isOff, start, end } = parseShift(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 w-full justify-start font-normal px-2 ${
            isOff ? "text-muted-foreground bg-slate-50" : "text-slate-950 font-medium border-emerald-100 bg-emerald-50/30"
          }`}
        >
          {isOff ? (
            <span className="flex items-center gap-1.5 opacity-60">
              <Moon className="h-3 w-3" />
              OFF
            </span>
          ) : (
            <span className="flex items-center gap-1.5 truncate">
              <Clock className="h-3 w-3 text-emerald-600" />
              {start}–{end}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 shadow-xl border-slate-200" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-slate-100">
            <Label htmlFor="off-toggle" className="font-semibold text-slate-900">Mark as Day Off</Label>
            <Switch
              id="off-toggle"
              checked={isOff}
              onCheckedChange={(checked) => onChange(formatShift(checked, start, end))}
            />
          </div>

          {!isOff && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Start Time</Label>
                <Input
                  type="time"
                  value={start}
                  onChange={(e) => onChange(formatShift(false, e.target.value, end))}
                  className="h-9 focus-visible:ring-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">End Time</Label>
                <Input
                  type="time"
                  value={end}
                  onChange={(e) => onChange(formatShift(false, start, e.target.value))}
                  className="h-9 focus-visible:ring-emerald-500"
                />
              </div>
            </div>
          )}
          
          <div className="pt-2">
            <p className="text-[10px] text-muted-foreground italic">
              Changes are saved locally. Click the save icon in the row to sync to database.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AgentShiftScheduleBoard({ agents }: AgentShiftScheduleBoardProps) {
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<Record<string, AgentShiftSchedule>>({});
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchAgentShiftSchedules();
        const map: Record<string, AgentShiftSchedule> = {};
        data.forEach((s) => {
          map[s.agentId] = s;
        });
        setSchedules(map);
      } catch (err) {
        console.error(err);
        toast({
          title: "Error",
          description: "Failed to load shift schedules",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUpdate = (agentId: string, day: (typeof DAYS)[number], value: string) => {
    setSchedules((prev) => ({
      ...prev,
      [agentId]: {
        ...(prev[agentId] || { agentId, id: "" }),
        [day]: value,
      } as AgentShiftSchedule,
    }));
  };

  const handleSave = async (agentId: string) => {
    setSavingId(agentId);
    try {
      await upsertAgentShiftSchedule(schedules[agentId]);
      toast({
        title: "Success",
        description: "Shift schedule saved",
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to save shift schedule",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const filteredAgents = agents
    .filter((a) => !String(a.bmsOwnerUid ?? "").trim())
    .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="w-[180px] text-slate-600 font-semibold">Agent</TableHead>
              {DAYS.map((day) => (
                <TableHead key={day} className="capitalize min-w-[130px] text-slate-600 font-semibold">
                  {day}
                </TableHead>
              ))}
              <TableHead className="w-[80px] text-right text-slate-600 font-semibold">Sync</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAgents.map((agent) => (
              <TableRow key={agent.id} className="hover:bg-slate-50/50">
                <TableCell className="font-semibold text-slate-900">{agent.name}</TableCell>
                {DAYS.map((day) => (
                  <TableCell key={day}>
                    <ShiftCell
                      value={schedules[agent.id]?.[day] || "OFF"}
                      onChange={(newVal) => handleUpdate(agent.id, day, newVal)}
                    />
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSave(agent.id)}
                    disabled={savingId === agent.id}
                    className="h-8 w-8 p-0 hover:bg-emerald-50 hover:text-emerald-600 rounded-full"
                  >
                    {savingId === agent.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
