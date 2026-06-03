export interface Subtitle {
  id: number;
  start: number;
  end: number;
  text: string;
}

export function parseSRT(srt: string): Subtitle[] {
  const blocks = srt.trim().split(/\r?\n\r?\n/);
  const subtitles: Subtitle[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length >= 3) {
      const id = parseInt(lines[0], 10);
      const timeLine = lines[1];
      const textLines = lines.slice(2).join('\n');

      const [startStr, endStr] = timeLine.split(' --> ');
      if (!startStr || !endStr) continue;

      const parseTime = (timeStr: string) => {
        const [hms, msStr] = timeStr.split(',');
        const [h, m, s] = hms.split(':').map(Number);
        const ms = parseInt(msStr || '0', 10);
        return h * 3600 + m * 60 + s + ms / 1000;
      };

      try {
        subtitles.push({
          id,
          start: parseTime(startStr),
          end: parseTime(endStr),
          text: textLines,
        });
      } catch (e) {
        console.warn('Error parsing SRT block:', block, e);
      }
    }
  }

  return subtitles;
}
