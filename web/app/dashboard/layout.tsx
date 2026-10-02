import { AppLayout } from "@/components/layout";
import { AuthProvider } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "CampusFlow dashboard and management interface",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <AppLayout>{children}</AppLayout>
    </AuthProvider>
  );
}
