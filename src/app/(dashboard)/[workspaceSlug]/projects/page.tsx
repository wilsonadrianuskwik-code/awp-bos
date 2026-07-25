import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectListPage } from "@/features/projects/components/project-list-page";
import { getProjects } from "@/features/projects/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import type { ProjectFilters } from "@/features/projects/types";

const SORT_FIELDS = ["created_at", "name"] as const;

function parseFilters(params: { q?: string; sort?: string; page?: string }): ProjectFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as ProjectFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const [{ workspaceSlug }, search] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const filters = parseFilters(search);
  const { projects, count } = await getProjects(workspace.id, filters);

  const hasAnyFilters = !!filters.search;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="The operational spine — every document can optionally link to a project"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/projects/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </Button>
        }
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={HardHat}
          title="No projects yet"
          description="Create your first project to start tracking site work."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/projects/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Link>
            </Button>
          }
        />
      ) : (
        <ProjectListPage projects={projects} count={count} />
      )}
    </div>
  );
}
