import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header data-site-header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground">
            F
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Fathom
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Demo workspace
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
