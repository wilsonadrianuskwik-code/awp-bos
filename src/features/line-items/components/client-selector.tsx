"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createClientAction } from "@/features/clients/actions";
import type { ClientSummary } from "@/features/line-items/types";
import { mergeById } from "@/lib/utils/merge-by-id";

type ClientSelectorProps = {
  clients: ClientSummary[];
  value: string;
  onChange: (clientId: string, client: ClientSummary) => void;
};

export function ClientSelector({ clients, value, onChange }: ClientSelectorProps) {
  const { can } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Clients created inline via the "Create new client" flow below aren't in
  // the server-fetched `clients` prop, so they're tracked here and merged in
  // — this keeps the trigger's selected-label lookup and the search list
  // working for a just-created client without the parent having to re-fetch.
  const [createdClients, setCreatedClients] = useState<ClientSummary[]>([]);
  const allClients = mergeById(createdClients, clients);

  const [dialogOpen, setDialogOpen] = useState(false);

  const selected = allClients.find((c) => c.id === value);
  const term = query.trim().toLowerCase();
  const filtered = allClients.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      (c.company ?? "").toLowerCase().includes(term) ||
      (c.email ?? "").toLowerCase().includes(term)
  );

  // Creating a client requires staff+, same gate as createClientAction
  // enforces server-side — hiding the affordance for viewers avoids
  // offering an action that would only fail.
  const canCreate = can("staff");
  const hasExactMatch = allClients.some(
    (c) => c.name.trim().toLowerCase() === term
  );
  const showCreate = canCreate && term.length > 0 && !hasExactMatch;

  function handleSelect(client: ClientSummary) {
    onChange(client.id, client);
    setOpen(false);
    setQuery("");
  }

  function handleCreated(client: ClientSummary) {
    setCreatedClients((prev) => [client, ...prev]);
    handleSelect(client);
    setDialogOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="truncate">
                {selected.name}
                {selected.company ? ` · ${selected.company}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">Select a client...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <div className="p-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients..."
              className="h-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto border-t">
            {filtered.length === 0 && !showCreate ? (
              <p className="p-3 text-sm text-muted-foreground">
                No clients found.
              </p>
            ) : (
              <>
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    )}
                  >
                    <span className="truncate">
                      <span className="font-medium">{c.name}</span>
                      {c.company && (
                        <span className="text-muted-foreground"> · {c.company}</span>
                      )}
                    </span>
                    {c.id === value && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                ))}
                {showCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setDialogOpen(true);
                    }}
                    className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      Create new client &ldquo;{query.trim()}&rdquo;
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <CreateClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialName={query.trim()}
        onCreated={handleCreated}
      />
    </>
  );
}

type CreateClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onCreated: (client: ClientSummary) => void;
};

function CreateClientDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: CreateClientDialogProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const name = (formData.get("name") as string)?.trim() ?? "";
    if (!name) {
      toast("Client name is required", "error");
      return;
    }

    startTransition(async () => {
      // Reuses the existing createClientAction — all validation, activity
      // logging, and the staff-role check live there; this dialog only
      // collects the minimum fields and lets that action do the work.
      const result = await createClientAction(workspace.id, formData);
      if (result.error || !result.data) {
        toast(result.error ?? "Failed to create client", "error");
        return;
      }

      onCreated({
        id: result.data.id,
        name,
        company: (formData.get("company") as string)?.trim() || null,
        email: (formData.get("email") as string)?.trim() || null,
      });
      toast("Client created", "success");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Client</DialogTitle>
            <DialogDescription>
              Add a new client without leaving this document. You can fill in
              the rest of their details later from the Clients page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-client-name">Name *</Label>
              <Input
                id="new-client-name"
                name="name"
                defaultValue={initialName}
                required
                maxLength={255}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-client-company">Company</Label>
              <Input
                id="new-client-company"
                name="company"
                maxLength={255}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-client-email">Email</Label>
                <Input id="new-client-email" name="email" type="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-client-phone">Phone</Label>
                <Input id="new-client-phone" name="phone" maxLength={50} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create & Select"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
