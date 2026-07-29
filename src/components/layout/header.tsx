"use client";

import { useEffect, useState } from "react";
import { LogOut, User, Menu, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/layout/command-palette";
import { useSupabase } from "@/providers/supabase-provider";
import { useRouter, usePathname } from "next/navigation";

type HeaderProps = {
  workspaceSlug: string;
  onMobileMenuToggle?: () => void;
};

export function Header({ workspaceSlug, onMobileMenuToggle }: HeaderProps) {
  const { supabase, user } = useSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Hidden only on the workspace's own home/dashboard — every other page
  // sits somewhere below that in the hierarchy, so a single global Back
  // (browser history, not a hardcoded parent route) always makes sense
  // there without every page having to wire up its own button.
  const isDashboardHome = pathname === `/${workspaceSlug}`;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const initials = user?.user_metadata?.full_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? user?.email?.[0]?.toUpperCase() ?? "?";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="flex h-16 items-center justify-between gap-3 bg-background px-4 md:px-6">
      <div className="flex flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:hidden"
          onClick={onMobileMenuToggle}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {!isDashboardHome && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.back()}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden h-10 w-full max-w-72 items-center gap-2.5 rounded-full bg-secondary px-4 text-sm text-muted-foreground transition-all duration-150 hover:bg-card hover:text-foreground hover:shadow-card sm:flex"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded-md bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:hidden"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-10 w-10 rounded-full ring-2 ring-transparent transition-shadow duration-150 hover:ring-border data-[state=open]:ring-primary/40"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage
                  src={user?.user_metadata?.avatar_url}
                  alt={user?.user_metadata?.full_name ?? "User"}
                />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none text-foreground">
                  {user?.user_metadata?.full_name ?? "User"}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("settings")}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        workspaceSlug={workspaceSlug}
      />
    </header>
  );
}
