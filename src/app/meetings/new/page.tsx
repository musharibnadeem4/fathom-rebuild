import { SiteHeader } from "@/components/site-header";
import { UploadForm } from "@/components/meeting/upload-form";

export default function NewMeetingPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-xl px-6 py-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">
            New meeting
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Add a recording
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Upload audio or video and we&apos;ll transcribe, diarize, and summarize it
            automatically. You&apos;ll be redirected as soon as processing starts.
          </p>
          <div className="mt-8">
            <UploadForm />
          </div>
        </div>
      </main>
    </div>
  );
}
