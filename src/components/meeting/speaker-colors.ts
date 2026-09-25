// Indexed by a participant's position in the meeting, so the same speaker gets
// the same color in the talk-time bar, transcript, and list previews.
const SPEAKER_COLORS = [
  { avatar: "bg-brand-soft text-brand-soft-foreground", solid: "bg-brand" },
  {
    avatar: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    solid: "bg-amber-500",
  },
  {
    avatar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    solid: "bg-emerald-500",
  },
  {
    avatar: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    solid: "bg-rose-500",
  },
];

export function speakerColor(index: number) {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}
