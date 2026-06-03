import { useState } from 'react';
import { Segment } from '../utils/segmenter';
import { PreviewArea } from './PreviewArea';
import { Clock, PlayCircle } from 'lucide-react';
import clsx from 'clsx';

export interface TextSettings {
  fontSize: number;
  textColor: string;
  bgColor: string;
}

interface SlicerProps {
  videoFile: File;
  segments: Segment[];
}

export function Slicer({ videoFile, segments }: SlicerProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>(segments[0]?.id || '');
  const [textSettings, setTextSettings] = useState<TextSettings>({
    fontSize: 56,
    textColor: '#ffde00',
    bgColor: 'transparent',
  });

  const selectedSegment = segments.find(s => s.id === selectedSegmentId);

  const handleExport = (blob: Blob) => {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reel-${selectedSegmentId}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row gap-8 pt-8 h-[calc(100vh-80px)]">
      {/* Sidebar with segments */}
      <div className="w-full md:w-80 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Generated Reels ({segments.length})
          </h2>
          <p className="text-sm text-gray-500 mt-1">Select a segment to preview and export.</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {segments.map((seg, i) => (
            <button
              key={seg.id}
              onClick={() => setSelectedSegmentId(seg.id)}
              className={clsx(
                "w-full text-left p-4 rounded-xl border transition-all duration-200 group relative",
                selectedSegmentId === seg.id 
                  ? "border-indigo-500 bg-indigo-50/50 shadow-sm" 
                  : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
              )}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-gray-800">Part {i + 1}</span>
                <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-600 rounded">
                  {seg.duration.toFixed(0)}s
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
              </p>
              
              <div className="text-xs text-gray-400 line-clamp-2 italic border-l-2 border-indigo-200 pl-2">
                "{seg.subtitles[0]?.text.split('\\n').join(' ') || 'No subtitles...'}"
              </div>

              {selectedSegmentId === seg.id && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <PlayCircle className="w-6 h-6 text-indigo-500" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 min-w-0">
        {selectedSegment ? (
          <PreviewArea
            key={selectedSegment.id} // force re-mount on change
            videoFile={videoFile}
            segment={selectedSegment}
            onExport={handleExport}
            textSettings={textSettings}
            onSettingsChange={setTextSettings}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a segment to preview
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
