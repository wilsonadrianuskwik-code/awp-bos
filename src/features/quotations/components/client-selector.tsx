"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import type { QuotationClientSummary } from "@/features/quotations/types";

type ClientSelectorProps = {
  clients: QuotationClientSummary[];
  value: string;
  onChange: (clientId: string, client: QuotationClientSummary) => void;
};

export function ClientSelector({ clients, value, onChange }: ClientSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = clients.find((c) => c.id === value);
  const term = query.toLowerCase();
  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      (c.company ?? "").toLowerCase().includes(term) ||
      (c.email ?? "").toLowerCase().includes(term)
  );

  return (
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
          {filtered.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No clients found.
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id, c);
                  setOpen(false);
                  setQuery("");
                }}
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
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
