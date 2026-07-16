import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ConfirmProvider } from "@/providers/confirm-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <SupabaseProvider initialUser={user}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </SupabaseProvider>
  );
}
