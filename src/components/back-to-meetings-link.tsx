import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackToMeetingsLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Meetings
    </Link>
  );
}
