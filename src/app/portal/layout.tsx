import { ToastProvider } from "@/providers/toast-provider";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
