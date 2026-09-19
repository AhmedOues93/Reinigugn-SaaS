import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { BackLink, ButtonLink, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { getChecklistTemplate } from '@/lib/data/checklists';

export default async function ChecklistTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getChecklistTemplate(id);
  if (!template) notFound();

  const items = [...template.checklist_template_items].sort((a, b) => a.position - b.position);

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/dashboard/checklisten">Checklisten</BackLink>
      <PageHeader
        title={template.name}
        description={template.description ?? undefined}
        meta={
          <>
            {!template.is_active && <StatusBadge isActive={false} />}
            <span className="text-sm tabular-nums text-muted-foreground">
              {items.length} {items.length === 1 ? 'Punkt' : 'Punkte'}
            </span>
          </>
        }
        actions={
          <ButtonLink href={`/dashboard/checklisten/${template.id}/bearbeiten`} variant="outline">
            <Pencil className="size-4" aria-hidden="true" />
            Bearbeiten
          </ButtonLink>
        }
      />

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">
          Diese Checkliste hat noch keine Punkte.
        </p>
      ) : (
        /* A checklist is worked top to bottom, so the order is real information
           and the position carries it. */
        <ol className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex items-start gap-3.5 border-b border-border/70 px-4 py-3.5 last:border-0"
            >
              <span className="mt-px w-5 shrink-0 text-end text-sm tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="break-anywhere block text-sm font-medium text-foreground">
                  {item.title}
                  {!item.is_required && (
                    <span className="ms-2 text-xs font-normal text-muted-foreground">optional</span>
                  )}
                </span>
                {item.instruction && (
                  <span className="break-anywhere mt-0.5 block text-sm leading-6 text-muted-foreground">
                    {item.instruction}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
