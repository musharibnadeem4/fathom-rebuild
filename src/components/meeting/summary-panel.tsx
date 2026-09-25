"use client";

import { useState } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";

type GeneralSummary = {
  purpose?: string;
  takeaways?: string[];
  topics?: string[];
};

type SalesSummary = {
  prospect?: string;
  dealStage?: string;
  painPoints?: string[];
  nextSteps?: string[];
  risks?: string[];
};

type OneOnOneSummary = {
  checkIns?: string[];
  updates?: string[];
  blockers?: string[];
  growthNotes?: string[];
};

export type SummaryData = {
  general?: GeneralSummary;
  sales?: SalesSummary;
  one_on_one?: OneOnOneSummary;
};

const TEMPLATES = [
  { key: "general", label: "General" },
  { key: "sales", label: "Sales" },
  { key: "one_on_one", label: "One-on-One" },
] as const;

type TemplateKey = (typeof TEMPLATES)[number]["key"];

export function SummaryPanel({ summaries }: { summaries: SummaryData }) {
  const available = TEMPLATES.filter((t) => summaries[t.key]);
  const [template, setTemplate] = useState<TemplateKey | null>(available[0]?.key ?? null);

  if (available.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
        No summary available for this meeting yet.
      </div>
    );
  }

  const active = template ?? available[0].key;

  return (
    <div className="flex flex-col gap-5">
      <div className="inline-flex w-fit gap-0.5 rounded-lg bg-muted p-1">
        {available.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTemplate(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/*
        All available templates render at once, stacked in the same grid
        cell (col-start-1 row-start-1), so the row sizes to the TALLEST of
        them. Only the active one is visible. This keeps the panel's height
        constant across tabs instead of resizing to whichever template
        happens to be shorter or longer — switching tabs should swap
        content in place, not reflow the whole page.
      */}
      <div className="grid">
        {summaries.general && (
          <TemplatePane active={active === "general"}>
            <GeneralView data={summaries.general} />
          </TemplatePane>
        )}
        {summaries.sales && (
          <TemplatePane active={active === "sales"}>
            <SalesView data={summaries.sales} />
          </TemplatePane>
        )}
        {summaries.one_on_one && (
          <TemplatePane active={active === "one_on_one"}>
            <OneOnOneView data={summaries.one_on_one} />
          </TemplatePane>
        )}
      </div>
    </div>
  );
}

function TemplatePane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      className={cn(
        "col-start-1 row-start-1",
        active ? "visible" : "invisible pointer-events-none",
      )}
    >
      {children}
    </div>
  );
}

function GeneralView({ data }: { data: GeneralSummary }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Purpose</SectionLabel>
        <p className="mt-1.5 text-[17px] leading-relaxed text-foreground">
          {data.purpose || "Not noted."}
        </p>
      </div>
      <BulletSection title="Key takeaways" items={data.takeaways} />
      <div>
        <SectionLabel>Topics covered</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.topics && data.topics.length > 0 ? (
            data.topics.map((topic) => (
              <Badge key={topic} variant="secondary">
                {topic}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">None noted.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SalesView({ data }: { data: SalesSummary }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <InfoTile label="Prospect" value={data.prospect} />
        <InfoTile label="Deal stage" value={data.dealStage} />
      </div>
      <BulletSection title="Pain points" items={data.painPoints} />
      <BulletSection title="Next steps" items={data.nextSteps} />
      <BulletSection title="Risks" items={data.risks} tone="caution" />
    </div>
  );
}

function OneOnOneView({ data }: { data: OneOnOneSummary }) {
  return (
    <div className="flex flex-col gap-5">
      <BulletSection title="Check-ins" items={data.checkIns} />
      <BulletSection title="Updates" items={data.updates} />
      <BulletSection title="Blockers" items={data.blockers} tone="caution" />
      <BulletSection title="Growth notes" items={data.growthNotes} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function InfoTile({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">{value || "Not noted."}</p>
    </div>
  );
}

function BulletSection({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items?: string[];
  tone?: "default" | "caution";
}) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {items && items.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm leading-relaxed text-foreground">
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  tone === "caution" ? "bg-amber-500/70" : "bg-brand/60",
                )}
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">None noted.</p>
      )}
    </div>
  );
}
