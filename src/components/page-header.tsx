export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="mb-2 text-[11px] font-medium tracking-[0.16em] text-terra uppercase">{eyebrow}</div>}
        <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
