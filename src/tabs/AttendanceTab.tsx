import type { Agent, Permissions, Tenant, UserSession } from "@/services/types";
import { AgentAttendanceCard } from "@/components/dashboard/AgentAttendanceCard";
import { SuperAdminAttendanceBoard } from "@/components/dashboard/SuperAdminAttendanceBoard";

interface AttendanceTabProps {
  session: UserSession;
  permissions: Permissions;
  agents: Agent[];
  tenants: Tenant[];
  now: number;
}

export function AttendanceTab({
  session,
  permissions,
  agents,
  tenants,
  now,
}: AttendanceTabProps) {
  if (!permissions.canViewAttendanceTab) {
    return null;
  }

  if (session.role === "super-admin") {
    return (
      <div className="cc-fade-in mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Command center agents only. Pick any day (up to today) to review attendance.
          </p>
        </div>
        <SuperAdminAttendanceBoard agents={agents} tenants={tenants} now={now} />
      </div>
    );
  }

  if (session.role === "agent" && permissions.canViewShiftPanel) {
    return (
      <div className="cc-fade-in mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clock in, take breaks, and clock out. Your time is saved to the Command Centre.
          </p>
        </div>
        <AgentAttendanceCard session={session} now={now} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-white p-8 text-center text-sm text-muted-foreground shadow-sm">
      Attendance is not available for your role.
    </div>
  );
}
