import Link from 'next/link';
import { ClipboardList, Plus } from 'lucide-react';
import { ButtonLink, EmptyState, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { listChecklistTemplates } from '@/lib/data/checklists';

export default async function ChecklistsPage() {
  const templates = await listChecklistTemplates();
  const active = templates.filter((template) => template.is_active).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Checklisten"
        description="Wiederverwendbare Aufgabenlisten, die an einem Auftrag hängen und vor Ort abgehakt werden."
        meta={
          templates.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {active} aktiv
              {templates.length > active && ` · ${templates.length - active} archiviert`}
            </span>
          ) : undefined
        }
        actions={
          <ButtonLink href="/dashboard/checklisten/neu">
            <Plus className="size-4" aria-hidden="true" />
            Checkliste erstellen
          </ButtonLink>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="Noch keine Checkliste angelegt"
          body="Eine Checkliste beschreibt einmal, was in einem Objekt zu tun ist – danach hängt sie an jedem Auftrag."
          action={
            <ButtonLink href="/dashboard/checklisten/neu">
              <Plus className="size-4" aria-hidden="true" />
              Checkliste erstellen
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {templates.map((template) => {
            const required = template.checklist_template_items.filter(
              (item) => item.is_required,
            ).length;
            return (
              <li key={template.id}>
                <Link
                  href={`/dashboard/checklisten/${template.id}`}
                  className="group flex h-full items-start gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <ClipboardList className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="break-anywhere font-medium text-foreground group-hover:text-primary">
                        {template.name}
                      </span>
                      {!template.is_active && <StatusBadge isActive={false} />}
                    </span>
                    {template.description && (
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {template.description}
                      </span>
                    )}
                    <span className="mt-2 block text-xs tabular-nums text-muted-foreground">
                      {template.checklist_template_items.length}{' '}
                      {template.checklist_template_items.length === 1 ? 'Punkt' : 'Punkte'}
                      {required > 0 && ` · ${required} verpflichtend`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
