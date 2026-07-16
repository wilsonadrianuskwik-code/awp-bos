"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils/cn";

type MobileSidebarProps = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  workspaceName: string;
};

export function MobileSidebar({
  open,
  onClose,
  workspaceSlug,
  workspaceName,
}: MobileSidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="absolute right-2 top-2 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Sidebar workspaceSlug={workspaceSlug} workspaceName={workspaceName} />
      </div>
    </>
  );
}
