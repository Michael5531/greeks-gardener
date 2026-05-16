import { ReactNode } from "react";

/** Standard page title block used by all terminal pages. */
export default function PageHeader({
  tag,
  title,
  subtitle,
  actions,
}: {
  tag?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
      <div className="min-w-0">
        {tag && <div className="section-tag mb-2">{tag}</div>}
        <h1 className="section-title">{title}</h1>
        {subtitle && <p className="section-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}