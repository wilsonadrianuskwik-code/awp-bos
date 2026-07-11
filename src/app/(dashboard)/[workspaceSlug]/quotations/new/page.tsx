import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getClients } from "@/features/clients/queries";
import { getQuotationTemplates } from "@/features/quotations/queries";
import { QuotationBuilder } from "@/features/quotations/components/quotation-builder";

export default async function NewQuotationPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [clients, templates] = await Promise.all([
    getClients(workspace.id),
    getQuotationTemplates(workspace.id),
  ]);

  return <QuotationBuilder clients={clients} templates={templates} />;
}
