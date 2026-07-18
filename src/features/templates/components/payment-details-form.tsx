"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updatePaymentDetails } from "@/features/templates/actions";
import { paymentDetailsSchema } from "@/features/templates/validators";
import type { BankAccount, PaymentDetails } from "@/features/templates/types";

type PaymentDetailsFormProps = {
  workspaceId: string;
  paymentDetails: PaymentDetails;
};

function newBankAccount(): BankAccount {
  return {
    id: crypto.randomUUID(),
    label: "",
    bank_name: "",
    account_name: "",
    account_number: "",
    swift_code: "",
    is_primary: false,
  };
}

export function PaymentDetailsForm({ workspaceId, paymentDetails }: PaymentDetailsFormProps) {
  const router = useRouter();
  const { can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const canEdit = can("admin");

  const [accounts, setAccounts] = useState<BankAccount[]>(
    paymentDetails.bank_accounts?.length ? paymentDetails.bank_accounts : []
  );
  const [qrisImageUrl, setQrisImageUrl] = useState(paymentDetails.qris_image_url ?? "");
  const [customInstructions, setCustomInstructions] = useState(
    paymentDetails.custom_instructions ?? ""
  );

  function addAccount() {
    const account = newBankAccount();
    if (accounts.length === 0) account.is_primary = true;
    setAccounts((prev) => [...prev, account]);
  }

  function removeAccount(id: string) {
    setAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      if (next.length > 0 && !next.some((a) => a.is_primary)) {
        next[0].is_primary = true;
      }
      return next;
    });
  }

  function setPrimary(id: string) {
    setAccounts((prev) =>
      prev.map((a) => ({ ...a, is_primary: a.id === id }))
    );
  }

  function updateAccount(id: string, field: keyof BankAccount, value: string) {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  }

  function handleSave() {
    const input = {
      bank_accounts: accounts,
      qris_image_url: qrisImageUrl,
      custom_instructions: customInstructions,
    };

    const parsed = paymentDetailsSchema.safeParse(input);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    startTransition(async () => {
      const result = await updatePaymentDetails(workspaceId, parsed.data);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Payment details updated", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank Accounts</CardTitle>
          <CardDescription>
            Bank accounts shown on your invoices. The primary account appears by
            default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="space-y-3 rounded-lg border bg-muted/20 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {account.is_primary ? (
                    <Badge>Primary</Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPrimary(account.id)}
                      disabled={!canEdit}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Star className="mr-1 inline h-3 w-3" />
                      Set as primary
                    </button>
                  )}
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeAccount(account.id)}
                    aria-label="Remove bank account"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={account.label}
                    onChange={(e) => updateAccount(account.id, "label", e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. BCA - Main Account"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bank Name</Label>
                  <Input
                    value={account.bank_name}
                    onChange={(e) => updateAccount(account.id, "bank_name", e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. Bank Central Asia"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Name</Label>
                  <Input
                    value={account.account_name}
                    onChange={(e) => updateAccount(account.id, "account_name", e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. PT Acme Indonesia"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Number</Label>
                  <Input
                    value={account.account_number}
                    onChange={(e) => updateAccount(account.id, "account_number", e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. 123-456-7890"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SWIFT Code (optional)</Label>
                  <Input
                    value={account.swift_code ?? ""}
                    onChange={(e) => updateAccount(account.id, "swift_code", e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. CENAIDJA"
                  />
                </div>
              </div>
            </div>
          ))}

          {canEdit && accounts.length < 10 && (
            <Button variant="outline" size="sm" onClick={addAccount}>
              <Plus className="mr-2 h-4 w-4" />
              Add Bank Account
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">QRIS</CardTitle>
          <CardDescription>
            QR code for Indonesian digital payments. Paste the URL of your QRIS
            image.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>QRIS Image URL</Label>
            <Input
              value={qrisImageUrl}
              onChange={(e) => setQrisImageUrl(e.target.value)}
              disabled={!canEdit}
              placeholder="https://..."
            />
            <p className="text-xs text-muted-foreground">
              The QR code image will appear on your invoices in the payment
              section.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Instructions</CardTitle>
          <CardDescription>
            Additional instructions shown on invoices below the bank details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            disabled={!canEdit}
            placeholder='e.g. "Please include invoice number as payment reference"'
            rows={3}
          />
        </CardContent>
      </Card>

      {canEdit && (
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      )}
    </div>
  );
}
