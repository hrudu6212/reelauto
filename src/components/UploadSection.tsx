import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Video } from 'lucide-react';
import clsx from 'clsx';

interface UploadSectionProps {
  onVideoUploaded: (file: File) => void;
  onTranscriptUploaded: (content: string) => void;
}

export function UploadSection({ onVideoUploaded, onTranscriptUploaded }: UploadSectionProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [transcriptContent, setTranscriptContent] = useState<string | null>(null);

  const onDropVideo = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setVideoFile(acceptedFiles[0]);
      onVideoUploaded(acceptedFiles[0]);
    }
  }, [onVideoUploaded]);

  const onDropTranscript = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setTranscriptContent(text);
        onTranscriptUploaded(text);
      };
      reader.readAsText(file);
    }
  }, [onTranscriptUploaded]);

  const { getRootProps: getVideoProps, getInputProps: getVideoInputProps, isDragActive: isVideoDrag } = useDropzone({
    onDrop: onDropVideo,
    accept: { 'video/*': ['.mp4', '.mov', '.webm'] },
    maxFiles: 1
  });

  const { getRootProps: getSrtProps, getInputProps: getSrtInputProps, isDragActive: isSrtDrag } = useDropzone({
    onDrop: onDropTranscript,
    accept: { 'text/plain': ['.srt', '.vtt', '.txt'] },
    maxFiles: 1
  });

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pt-12">
      <h2 className="text-3xl font-bold text-center text-gray-800">Create Reels from Long Videos</h2>
      <p className="text-center text-gray-500 mb-8">Upload your video and an optional SRT transcript to generate perfect 60-90s snippets with animated captions.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Video Upload */}
        <div
          {...getVideoProps()}
          className={clsx(
            "flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ease-in-out",
            isVideoDrag ? "border-indigo-500 bg-indigo-50" : videoFile ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
          )}
        >
          <input {...getVideoInputProps()} />
          <Video className={clsx("w-12 h-12 mb-4", videoFile ? "text-green-500" : "text-indigo-500")} />
          <h3 className="text-lg font-semibold text-gray-700">
            {videoFile ? videoFile.name : "Upload Video"}
          </h3>
          <p className="text-sm text-gray-500 mt-2 text-center">
            {videoFile ? "Video loaded successfully" : "Drag and drop or click to browse (MP4, MOV)"}
          </p>
        </div>

        {/* Transcript Input */}
        <div className={clsx(
            "flex flex-col p-6 border-2 border-dashed rounded-2xl transition-all duration-200 ease-in-out relative",
            transcriptContent ? "border-green-500 bg-green-50" : "border-gray-300 bg-white"
          )}
        >
          <div className="flex items-center gap-2 mb-4 justify-center">
            <FileText className={clsx("w-8 h-8", transcriptContent ? "text-green-500" : "text-purple-500")} />
            <h3 className="text-lg font-semibold text-gray-700">
              {transcriptContent ? "Transcript Loaded" : "Add Transcript (Optional)"}
            </h3>
          </div>
          
          <div className="flex-1 flex flex-col gap-4">
            <textarea 
              className="w-full flex-1 min-h-[120px] p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Paste your SRT transcript text here..."
              value={transcriptContent || ''}
              onChange={(e) => {
                const text = e.target.value;
                setTranscriptContent(text);
                onTranscriptUploaded(text);
              }}
            />
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2 text-sm text-gray-500">OR</span>
              </div>
            </div>

            <div
              {...getSrtProps()}
              className={clsx(
                "flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200",
                isSrtDrag ? "border-purple-500 bg-purple-50" : "border-gray-300 hover:border-purple-400 hover:bg-gray-50 bg-white"
              )}
            >
              <input {...getSrtInputProps()} />
              <p className="text-sm text-gray-500 text-center">
                Drag and drop your .srt file, or click to browse
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
