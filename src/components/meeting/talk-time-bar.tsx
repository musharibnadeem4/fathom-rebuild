import { cn } from "cn";
import { speakerColor } from "@/components/meeting/speaker-colors";

export type SpeakerSummary = {
  name: string;
  initial: string;
  colorIndex: number;
  talkTimeSeconds: number;
};

export function TalkTimeBar({ speakers }: { speakers: SpeakerSummary[] }) {
  const total = speakers.reduce((sum, s) => sum + s.talkTimeSeconds, 0);
  if (speakers.length === 0 || total <= 0) return null;

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {speakers.map((speaker) => (
          <div
            key={speaker.name}
            className={cn("h-full", speakerColor(speaker.colorIndex).solid)}
            style={{ width: `${(speaker.talkTimeSeconds / total) * 100}%` }}
            title={speaker.name}
          />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {speakers.map((speaker) => (
          <li key={speaker.name} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className={cn("size-2 rounded-full", speakerColor(speaker.colorIndex).solid)}
            />
            <span className="font-medium text-foreground">{speaker.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round((speaker.talkTimeSeconds / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
