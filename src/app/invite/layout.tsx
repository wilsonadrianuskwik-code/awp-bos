import { ToastProvider } from "@/providers/toast-provider";

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        {children}
      </div>
    </ToastProvider>
  );
}
