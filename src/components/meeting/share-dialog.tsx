"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createMeetingShare } from "@/app/meetings/[id]/actions";

export function ShareDialog({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the link — copy it from the address bar instead.");
    }
  };

  const handleShareSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    const result = await createMeetingShare({ meetingId, recipientName: name, recipientEmail: email });
    if (result.ok) {
      setStatus("success");
    } else {
      setStatus("error");
      setError(result.error);
    }
  };

  const resetInviteForm = () => {
    setStatus("idle");
    setError(null);
    setName("");
    setEmail("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetInviteForm();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Share2 className="size-3.5" />
            Share
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this meeting</DialogTitle>
          <DialogDescription>
            No login is required to view — anyone with the link can open it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Public link
            </p>
            <div className="mt-2 flex gap-2">
              <Input readOnly value={typeof window !== "undefined" ? window.location.href : ""} />
              <Button variant="secondary" onClick={handleCopyLink} className="shrink-0">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Share with someone
            </p>

            {status === "success" ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2.5 text-sm text-brand-soft-foreground">
                <Check className="size-4 shrink-0" />
                <span>
                  Added {name || "recipient"} — they&apos;ll get emailed once delivery is wired
                  up.
                </span>
              </div>
            ) : (
              <form onSubmit={handleShareSubmit} className="mt-2 flex flex-col gap-2.5">
                <Input
                  placeholder="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                {status === "error" && error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
                <Button type="submit" disabled={status === "submitting"} className="self-start">
                  {status === "submitting" ? "Sharing…" : "Share"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
