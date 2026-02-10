import UserHydrator from "@/components/UserHydrator";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <UserHydrator />
      <main className="flex-1">{children}</main>
    </div>
  );
}
