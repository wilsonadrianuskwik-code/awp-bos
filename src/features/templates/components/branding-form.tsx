"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Palette, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateBranding, setWorkspaceLogo } from "@/features/templates/actions";
import { BrandingImageUpload } from "@/features/templates/components/branding-image-upload";
import { brandingSchema } from "@/features/templates/validators";
import type { BrandingSettings } from "@/features/templates/types";

type BrandingFormProps = {
  workspaceId: string;
  branding: BrandingSettings;
  /** workspaces.logo_url — stored on the column, not in settings. */
  logoUrl?: string | null;
};

export function BrandingForm({ workspaceId, branding, logoUrl }: BrandingFormProps) {
  const router = useRouter();
  const { can, workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const canEdit = can("admin");

  const [tagline, setTagline] = useState(branding.tagline ?? "");
  const [logo, setLogo] = useState(logoUrl ?? "");
  const [signatureUrl, setSignatureUrl] = useState(branding.signature_url ?? "");
  const [signatureLabel, setSignatureLabel] = useState(
    branding.signature_label ?? "Approved by,"
  );
  const [signatoryName, setSignatoryName] = useState(branding.signatory_name ?? "");
  const [signatoryTitle, setSignatoryTitle] = useState(branding.signatory_title ?? "");
  const [signatoryCompany, setSignatoryCompany] = useState(
    branding.signatory_company ?? ""
  );

  // The logo is a column and the rest is settings JSONB, so saving is two
  // writes. Done together so the form has one Save button.
  function handleSave() {
    const input = {
      tagline,
      signature_url: signatureUrl,
      signature_label: signatureLabel,
      signatory_name: signatoryName,
      signatory_title: signatoryTitle,
      signatory_company: signatoryCompany,
    };
    const parsed = brandingSchema.safeParse(input);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    startTransition(async () => {
      const result = await updateBranding(workspaceId, parsed.data);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      if (logo !== (logoUrl ?? "")) {
        const logoResult = await setWorkspaceLogo(workspaceId, logo);
        if (logoResult.error) {
          toast(logoResult.error, "error");
          return;
        }
      }
      toast("Branding updated", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
          <CardDescription>
            Your brand identity as it appears on documents — tagline and visual
            style.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tagline</Label>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Design Studio | Creative Agency"
            />
            <p className="text-xs text-muted-foreground">
              Appears below your company name on documents (optional).
            </p>
          </div>

          <BrandingImageUpload
            workspaceId={workspaceId}
            slot="logo"
            value={logo}
            onChange={setLogo}
            disabled={!canEdit}
            label="Company logo"
            hint="Printed at the top of every quotation, invoice, PO and delivery order."
          />

          {canEdit && (
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signature</CardTitle>
          <CardDescription>
            Printed at the bottom of every issued document, so PDFs go out
            already signed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BrandingImageUpload
            workspaceId={workspaceId}
            slot="signature"
            value={signatureUrl}
            onChange={setSignatureUrl}
            disabled={!canEdit}
            label="Signature image"
            hint="A transparent PNG works best — it sits over the company name."
            previewClassName="h-16 w-40"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={signatureLabel}
                onChange={(e) => setSignatureLabel(e.target.value)}
                disabled={!canEdit}
                placeholder="Approved by,"
              />
            </div>
            <div className="space-y-2">
              <Label>Company line</Label>
              <Input
                value={signatoryCompany}
                onChange={(e) => setSignatoryCompany(e.target.value)}
                disabled={!canEdit}
                placeholder="PT. Andalan Warna Prima"
              />
            </div>
            <div className="space-y-2">
              <Label>Signatory name</Label>
              <Input
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                disabled={!canEdit}
                placeholder="Suhardjono"
              />
            </div>
            <div className="space-y-2">
              <Label>Signatory title</Label>
              <Input
                value={signatoryTitle}
                onChange={(e) => setSignatoryTitle(e.target.value)}
                disabled={!canEdit}
                placeholder="Director"
              />
            </div>
          </div>

          {canEdit && (
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Link href={`/${workspace.slug}/settings/themes`}>
        <Card className="transition-colors hover:border-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <Palette className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Colors & Fonts</p>
              <p className="text-xs text-muted-foreground">
                Manage the color palette and typography your documents use
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
