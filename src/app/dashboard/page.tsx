import { DashboardShell } from "@/components/dashboard-shell";

export default function DashboardPage() {
  return (
    <main className="page-shell flex flex-1 flex-col gap-6 py-6 sm:py-10">
      <DashboardShell />
    </main>
  );
}
