"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Palette,
  CreditCard,
  FileText,
  LayoutTemplate,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { CompanyProfileForm } from "@/features/templates/components/company-profile-form";
import { BrandingForm } from "@/features/templates/components/branding-form";
import { PaymentDetailsForm } from "@/features/templates/components/payment-details-form";
import { DefaultTermsForm } from "@/features/templates/components/default-terms-form";
import type { CompanyProfile, PaymentDetails, DefaultTerms, BrandingSettings } from "@/features/templates/types";

type Section = "company-profile" | "branding" | "payment-details" | "default-terms";

const SECTIONS: { id: Section; label: string; icon: typeof Building2; description: string }[] = [
  { id: "company-profile", label: "Company Profile", icon: Building2, description: "Name, address, and contact details" },
  { id: "branding", label: "Branding", icon: Palette, description: "Logo, tagline, and visual identity" },
  { id: "payment-details", label: "Payment Details", icon: CreditCard, description: "Bank accounts and payment instructions" },
  { id: "default-terms", label: "Default Terms", icon: FileText, description: "Terms & conditions defaults" },
];

type DocumentSettingsNavProps = {
  workspaceId: string;
  companyProfile: CompanyProfile;
  paymentDetails: PaymentDetails;
  defaultTerms: DefaultTerms;
  branding: BrandingSettings;
};

export function DocumentSettingsNav({
  workspaceId,
  companyProfile,
  paymentDetails,
  defaultTerms,
  branding,
}: DocumentSettingsNavProps) {
  const [activeSection, setActiveSection] = useState<Section>("company-profile");
  const { workspace } = useWorkspace();

  return (
    <div className="flex gap-6">
      <nav className="w-56 shrink-0 space-y-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              activeSection === id
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}

        <div className="my-3 border-t" />

        <Link
          href={`/${workspace.slug}/settings/templates`}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LayoutTemplate className="h-4 w-4" />
          <span className="flex-1 text-left">Document Designs</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`/${workspace.slug}/settings/themes`}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Palette className="h-4 w-4" />
          <span className="flex-1 text-left">Themes</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </nav>

      <div className="min-w-0 flex-1">
        {activeSection === "company-profile" && (
          <CompanyProfileForm workspaceId={workspaceId} companyProfile={companyProfile} />
        )}
        {activeSection === "branding" && (
          <BrandingForm workspaceId={workspaceId} branding={branding} />
        )}
        {activeSection === "payment-details" && (
          <PaymentDetailsForm workspaceId={workspaceId} paymentDetails={paymentDetails} />
        )}
        {activeSection === "default-terms" && (
          <DefaultTermsForm workspaceId={workspaceId} defaultTerms={defaultTerms} />
        )}
      </div>
    </div>
  );
}
