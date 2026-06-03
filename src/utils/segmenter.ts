import { Subtitle } from './srtParser';

export interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  subtitles: Subtitle[];
}

export function createSegments(videoDuration: number, subtitles: Subtitle[]): Segment[] {
  const segments: Segment[] = [];
  let currentTime = 0;
  let index = 1;

  while (currentTime < videoDuration) {
    let targetEnd = currentTime + 60;
    const maxEnd = currentTime + 90;

    let end = targetEnd;
    
    // Find the best cut point in subtitles between 60s and 90s
    for (let i = 0; i < subtitles.length - 1; i++) {
      const currentSub = subtitles[i];
      // We look for a gap after currentSub
      if (currentSub.end >= targetEnd && currentSub.end <= maxEnd) {
        end = currentSub.end;
        break;
      }
    }

    if (end > videoDuration) end = videoDuration;

    // Filter subtitles for this segment
    const segmentSubs = subtitles.filter(
      (sub) => sub.start < end && sub.end > currentTime
    );

    // Don't create an empty segment if there's less than 1 second left
    if (end - currentTime > 1) {
      segments.push({
        id: `seg-${index}`,
        startTime: currentTime,
        endTime: end,
        duration: end - currentTime,
        subtitles: segmentSubs,
      });
      index++;
    }

    currentTime = end;
  }

  return segments;
}
