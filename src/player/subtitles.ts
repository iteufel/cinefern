export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}
function timestamp(value: string): number {
  const parts = value.replace(',', '.').split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}
/** Handles WebVTT and SubRip. Cue markup is rendered as plain text. */
export function parseSubtitles(source: string): SubtitleCue[] {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues: SubtitleCue[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const index = lines.findIndex((line) => line.includes(' --> '));
    if (index < 0) continue;
    const [start, end] = lines[index]!.split(' --> ');
    const from = timestamp(start!.trim());
    const to = timestamp(end!.trim().split(/\s+/)[0]!);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
    const content = lines
      .slice(index + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
    cues.push({ start: from, end: to, text: content });
  }
  return cues.sort((a, b) => a.start - b.start);
}
export function subtitleAt(cues: SubtitleCue[], position: number): string {
  return cues
    .filter((cue) => position >= cue.start && position < cue.end)
    .map((cue) => cue.text)
    .join('\n');
}
