"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { updateCompanyProfile } from "@/features/templates/actions";
import { companyProfileSchema } from "@/features/templates/validators";
import type { CompanyProfile } from "@/features/templates/types";

type CompanyProfileFormProps = {
  workspaceId: string;
  companyProfile: CompanyProfile;
};

export function CompanyProfileForm({ workspaceId, companyProfile }: CompanyProfileFormProps) {
  const router = useRouter();
  const { can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const canEdit = can("admin");

  const [displayName, setDisplayName] = useState(companyProfile.display_name ?? "");
  const [email, setEmail] = useState(companyProfile.email ?? "");
  const [phone, setPhone] = useState(companyProfile.phone ?? "");
  const [website, setWebsite] = useState(companyProfile.website ?? "");
  const [taxId, setTaxId] = useState(companyProfile.tax_id ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(companyProfile.registration_number ?? "");
  const [line1, setLine1] = useState(companyProfile.address?.line1 ?? "");
  const [line2, setLine2] = useState(companyProfile.address?.line2 ?? "");
  const [city, setCity] = useState(companyProfile.address?.city ?? "");
  const [state, setState] = useState(companyProfile.address?.state ?? "");
  const [postalCode, setPostalCode] = useState(companyProfile.address?.postal_code ?? "");
  const [country, setCountry] = useState(companyProfile.address?.country ?? "");

  function handleSave() {
    const input = {
      display_name: displayName,
      email,
      phone,
      website,
      tax_id: taxId,
      registration_number: registrationNumber,
      address: { line1, line2, city, state, postal_code: postalCode, country },
    };

    const parsed = companyProfileSchema.safeParse(input);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    startTransition(async () => {
      const result = await updateCompanyProfile(workspaceId, parsed.data);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Company profile updated", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Company Profile</CardTitle>
        <CardDescription>
          This information appears on your invoices, quotations, and other
          documents — company name, address, and contact details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Company name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!canEdit} placeholder="Acme Design Studio" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} placeholder="hello@acme.com" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} disabled={!canEdit} placeholder="www.acme.com" />
          </div>
          <div className="space-y-2">
            <Label>Tax ID</Label>
            <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Registration number</Label>
            <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} disabled={!canEdit} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Address</Label>
          <div className="grid gap-2">
            <Input value={line1} onChange={(e) => setLine1(e.target.value)} disabled={!canEdit} placeholder="Address line 1" />
            <Input value={line2} onChange={(e) => setLine2(e.target.value)} disabled={!canEdit} placeholder="Address line 2 (optional)" />
            <div className="grid gap-2 sm:grid-cols-3">
              <Input value={city} onChange={(e) => setCity(e.target.value)} disabled={!canEdit} placeholder="City" />
              <Input value={state} onChange={(e) => setState(e.target.value)} disabled={!canEdit} placeholder="State / Province" />
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} disabled={!canEdit} placeholder="Postal code" />
            </div>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} disabled={!canEdit} placeholder="Country" />
          </div>
        </div>

        {canEdit && (
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
