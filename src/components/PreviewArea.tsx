import { useEffect, useRef, useState, useMemo } from 'react';
import { Play, Pause, Download, Settings2 } from 'lucide-react';
import { Segment } from '../utils/segmenter';
import { exportVideo } from '../utils/exportVideo';
import { TextSettings } from './Slicer';
import { InstagramPublisher } from './InstagramPublisher';
import '../instagram.css';

interface PreviewAreaProps {
  videoFile: File;
  segment: Segment;
  onExport: (blob: Blob) => void;
  textSettings: TextSettings;
  onSettingsChange: (settings: TextSettings) => void;
}

export function PreviewArea({ videoFile, segment, onExport, textSettings, onSettingsChange }: PreviewAreaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(segment.startTime);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'preview' | 'instagram'>('preview');

  const videoUrl = useMemo(() => URL.createObjectURL(videoFile), [videoFile]);

  useEffect(() => {
    // Reset when segment changes
    if (videoRef.current) {
      videoRef.current.currentTime = segment.startTime;
      setCurrentTime(segment.startTime);
      setIsPlaying(false);
      videoRef.current.pause();
    }
  }, [segment]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    
    // Auto-loop segment
    if (time >= segment.endTime) {
      videoRef.current.currentTime = segment.startTime;
      if (!isPlaying) {
        videoRef.current.pause();
      }
    } else {
      setCurrentTime(time);
    }
  };

  const currentSubtitle = (segment.subtitles || []).find(s => currentTime >= s.start && currentTime <= s.end);

  const startExport = async () => {
    if (isExporting || !videoRef.current) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const blob = await exportVideo(
        videoUrl,
        segment,
        (progress) => setExportProgress(progress),
        textSettings
      );
      onExport(blob);
    } catch (err) {
      console.error('Export failed', err);
      alert('Export failed. Check console for details.');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 bg-white rounded-2xl shadow-sm border border-gray-100 h-full w-full">
      {/* Tab Switcher */}
      <div className="w-full flex border-b border-gray-200 mb-2">
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'preview'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Preview & Local Export
        </button>
        <button
          onClick={() => setActiveTab('instagram')}
          className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'instagram'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Instagram Auto-Publish
        </button>
      </div>

      {activeTab === 'preview' ? (
        <>
          <div className="w-full flex justify-between items-center mb-2">
            <h3 className="font-semibold text-gray-800">Preview Segment</h3>
            <span className="text-sm font-medium px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md">
              {segment.duration.toFixed(1)}s
            </span>
          </div>

          <div className="relative aspect-[9/16] w-full max-w-[320px] bg-black rounded-lg overflow-hidden group">
            <video
              ref={videoRef}
              src={videoUrl}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
            />
            
            {/* Subtitle Overlay */}
            {currentSubtitle && (
              <div className="absolute inset-x-0 bottom-24 flex items-center justify-center p-4 z-10 pointer-events-none">
                <div className="max-w-[90%] flex flex-col items-center justify-center">
                  {currentSubtitle.text.replace(/\r?\n/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).map((line, i) => (
                    <div key={i} className="mb-1" style={{ backgroundColor: textSettings.bgColor !== 'transparent' ? textSettings.bgColor : 'transparent', padding: textSettings.bgColor !== 'transparent' ? '4px 12px' : '0' }}>
                      <p 
                        className="text-center font-bold leading-[1.1] uppercase inline-block"
                        style={{ 
                          fontSize: `${textSettings.fontSize}px`,
                          color: textSettings.textColor,
                          fontFamily: 'Impact, sans-serif',
                          WebkitTextStroke: '2px black',
                          filter: 'drop-shadow(3px 3px 4px rgba(0,0,0,0.8))'
                        }}
                      >
                        {line}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Controls Overlay */}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <button 
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center pointer-events-auto hover:bg-white transition-colors hover:scale-105"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-indigo-600 ml-0.5" />
                ) : (
                  <Play className="w-8 h-8 text-indigo-600 ml-1.5" />
                )}
              </button>
            </div>

            {/* Progress bar overlay */}
            <div className="absolute bottom-0 inset-x-0 h-1 bg-gray-600">
              <div 
                className="h-full bg-indigo-500 transition-all duration-100" 
                style={{ width: `${((currentTime - segment.startTime) / segment.duration) * 100}%` }}
              />
            </div>
          </div>

          <div className="w-full flex flex-col gap-4 mt-2">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100 w-full">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Subtitle Settings:</span>
              </div>
              
              <div className="flex items-center gap-4 flex-wrap justify-end">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Size</label>
                  <input 
                    type="range" min="24" max="80" step="2"
                    value={textSettings.fontSize}
                    onChange={(e) => onSettingsChange({ ...textSettings, fontSize: Number(e.target.value) })}
                    className="w-24 accent-indigo-600"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Color</label>
                  <input 
                    type="color" 
                    value={textSettings.textColor}
                    onChange={(e) => onSettingsChange({ ...textSettings, textColor: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Bg</label>
                  <select 
                    value={textSettings.bgColor}
                    onChange={(e) => onSettingsChange({ ...textSettings, bgColor: e.target.value })}
                    className="text-xs border-gray-200 rounded px-2 py-1"
                  >
                    <option value="transparent">None</option>
                    <option value="rgba(0,0,0,0.8)">Black</option>
                    <option value="rgba(255,255,255,0.9)">White</option>
                    <option value="rgba(255,0,0,0.8)">Red</option>
                    <option value="rgba(0,0,255,0.8)">Blue</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="w-full flex items-center justify-between mt-2">
              <div className="text-sm font-medium text-gray-500 tabular-nums">
                {currentTime.toFixed(1)}s / {segment.endTime.toFixed(1)}s
              </div>
              <button
                onClick={startExport}
                disabled={isExporting}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Exporting {Math.round(exportProgress)}%</span>
                  </div>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>Export Reel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      ) : (
        <InstagramPublisher
          videoFile={videoFile}
          videoUrl={videoUrl}
          segment={segment}
          textSettings={textSettings}
        />
      )}
    </div>
  );
}
