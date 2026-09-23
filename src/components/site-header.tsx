export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border/80 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
          F
        </div>
        <span className="text-lg font-semibold tracking-tight text-foreground">
          Fathom
        </span>
      </div>
    </header>
  );
}
