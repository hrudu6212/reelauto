import { useState } from 'react';
import { UploadSection } from './components/UploadSection';
import { Slicer } from './components/Slicer';
import { parseSRT, Subtitle } from './utils/srtParser';
import { createSegments, Segment } from './utils/segmenter';
import { Scissors, Bot } from 'lucide-react';
import { AutoPilotPanel } from './components/AutoPilotPanel';

function App() {
  const [mainTab, setMainTab] = useState<'manual' | 'autopilot'>('manual');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[] | null>(null);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVideoUploaded = (file: File) => {
    setVideoFile(file);
    setError(null);
  };

  const handleTranscriptUploaded = (content: string) => {
    if (!content.trim()) {
      setSubtitles(null);
      setError(null);
      return;
    }

    try {
      const parsed = parseSRT(content);
      // We don't throw an error for empty array if they are just typing,
      // but let's keep the user informed if it's completely invalid.
      if (parsed.length === 0 && content.length > 20) {
        throw new Error('Could not parse any valid SRT blocks from the text.');
      }
      setSubtitles(parsed);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to parse SRT format. Make sure it contains valid timestamps.');
      setSubtitles(null);
    }
  };

  const processVideo = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setError(null);

    try {
      // Create a temporary video element to get the duration
      const videoURL = URL.createObjectURL(videoFile);
      const tempVideo = document.createElement('video');
      tempVideo.src = videoURL;
      
      await new Promise<void>((resolve, reject) => {
        tempVideo.onloadedmetadata = () => resolve();
        tempVideo.onerror = () => reject(new Error('Failed to load video metadata'));
      });
      
      const duration = tempVideo.duration;
      URL.revokeObjectURL(videoURL);

      const generatedSegments = createSegments(duration, subtitles || []);
      if (generatedSegments.length === 0) {
        throw new Error('Could not generate any segments. Video might be too short.');
      }
      
      setSegments(generatedSegments);
    } catch (err: any) {
      setError(err.message || 'An error occurred during processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 py-4 px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center">
          <Scissors className="w-6 h-6 text-indigo-600 mr-2 animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight text-gray-800">ReelSlicer</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMainTab('manual')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              mainTab === 'manual'
                ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100/50'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Scissors className="w-4 h-4" />
            <span>Manual Editor</span>
          </button>
          <button
            onClick={() => setMainTab('autopilot')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              mainTab === 'autopilot'
                ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100/50'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Auto-Pilot Bot</span>
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 pb-12">
        {mainTab === 'autopilot' ? (
          <AutoPilotPanel />
        ) : !segments ? (
          <div className="flex flex-col items-center gap-8 pt-8">
            <UploadSection 
              onVideoUploaded={handleVideoUploaded} 
              onTranscriptUploaded={handleTranscriptUploaded} 
            />
            
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-lg w-full max-w-lg text-center border border-red-100">
                {error}
              </div>
            )}

            <button
              onClick={processVideo}
              disabled={!videoFile || isProcessing}
              className="mt-4 px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 disabled:hover:shadow-none"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                'Generate Reels'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 w-full pt-2">
            <div className="w-full flex justify-between items-center mt-6">
              <h2 className="text-2xl font-bold text-gray-800">Your Reels</h2>
              <button
                onClick={() => setSegments(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Start Over
              </button>
            </div>
            {videoFile && (
              <Slicer videoFile={videoFile} segments={segments} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
