// Indexed by a participant's position in the meeting, so the same speaker gets
// the same color in the talk-time bar, transcript, and list previews. Values
// come from the --speaker-N theme tokens (light + dark defined in globals.css).
const SPEAKER_COLORS = [
  { avatar: "bg-speaker-1-soft text-speaker-1-soft-foreground", solid: "bg-speaker-1" },
  { avatar: "bg-speaker-2-soft text-speaker-2-soft-foreground", solid: "bg-speaker-2" },
  { avatar: "bg-speaker-3-soft text-speaker-3-soft-foreground", solid: "bg-speaker-3" },
  { avatar: "bg-speaker-4-soft text-speaker-4-soft-foreground", solid: "bg-speaker-4" },
];

export function speakerColor(index: number) {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}
