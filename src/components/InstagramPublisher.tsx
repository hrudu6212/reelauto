import React, { useState, useEffect, useRef } from 'react';
import { Instagram, Send, CheckCircle2, AlertTriangle, Link, Info, ShieldCheck, Eye, Heart, MessageCircle, Share2, Calendar, Plus, Trash2, Clock, Play, Loader, Sparkles, Mic, MicOff } from 'lucide-react';
import { generateReelCaptions, analyzeReelAndGenerateCaption, ReelCaptionData } from '../utils/openrouter';
import { exportVideo } from '../utils/exportVideo';
import { Segment } from '../utils/segmenter';
import { TextSettings } from './Slicer';

interface InstagramPublisherProps {
  videoFile: File;
  videoUrl: string;
  segment: Segment;
  textSettings: TextSettings;
}

interface PublishLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

interface ScheduledReel {
  id: string;
  videoUrl: string;
  hook: string;
  body: string;
  hashtags: string[];
  scheduledTime: string;
  status: 'queued' | 'publishing' | 'published' | 'failed';
  log: string;
}

export function InstagramPublisher({
  videoFile,
  videoUrl,
  segment,
  textSettings
}: InstagramPublisherProps) {
  // Wizard state: 'caption-setup' | 'publish-dashboard'
  const [wizardStep, setWizardStep] = useState<'caption-setup' | 'publish-dashboard'>('caption-setup');
  const [activeTab, setActiveTab] = useState<'queue' | 'mockup'>('queue');

  // OpenRouter caption generation parameters
  const [topic, setTopic] = useState(`Highlights from ${videoFile.name.replace(/\.[^/.]+$/, "")}`);
  const [tone, setTone] = useState('viral');
  const [keyPoints, setKeyPoints] = useState('');
  const [transcription, setTranscription] = useState(() => {
    // Pre-populate dialogue transcript with the segment subtitles!
    return (segment.subtitles || []).map(s => s.text.replace(/\r?\n/g, ' ')).join(' ');
  });

  // AI caption creation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [captionData, setCaptionData] = useState<ReelCaptionData | null>(null);

  // Dictation states
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Video compilation and hosting states
  const [compiledBlob, setCompiledBlob] = useState<Blob | null>(null);
  const [compiledUrl, setCompiledUrl] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState(0);
  const [uploadingToCloud, setUploadingToCloud] = useState(false);
  const [publicVideoUrl, setPublicVideoUrl] = useState('');

  // Scheduled queue state
  const [queue, setQueue] = useState<ScheduledReel[]>(() => {
    const saved = localStorage.getItem('sm_scheduled_reels');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse scheduled reels", e);
      }
    }
    return [];
  });

  // Publishing progress states
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [igPostUrl, setIgPostUrl] = useState<string | null>(null);
  
  // Real-time developer logs
  const [logs, setLogs] = useState<PublishLog[]>([]);

  // Instagram Mockup Frame States
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);

  // Credentials and API endpoints
  const igAccountId = '17841469941844600';
  const accessToken = 'IGAAZBlrjgzhq1BZAGE4dmhUS2dLbjBoTVo2ajZACdHYweEZAVUllEZAmQxcHllc1EzQ3FKNWE3UVM2ZAFhEYTc3YWd3RmZA4dDA5UGN1bk1UdDQ2b3p3ek1kM19RZAzFKNnZAYS3Q0QmR2aVh4ZAjZAaOXBzYUM1WDN5R3gzdUZAYQkNURDNZAYwZDZD';
  const isIgToken = accessToken.startsWith('IGAA');
  const proxyPrefix = isIgToken ? '/api-proxy/instagram' : '/api-proxy/facebook';

  // Save queue to localStorage
  useEffect(() => {
    localStorage.setItem('sm_scheduled_reels', JSON.stringify(queue));
  }, [queue]);

  // Speech recognition API setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      
      rec.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            currentTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (currentTranscript) {
          setTranscription(prev => (prev + ' ' + currentTranscript).trim());
        }
      };

      rec.onerror = (err: any) => {
        console.error("Speech recognition error:", err);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Background Clock Checker: Checks every 10 seconds if any queued item has hit its release slot
  useEffect(() => {
    const checker = setInterval(() => {
      const now = new Date();
      const pendingItems = queue.filter(item => item.status === 'queued');

      pendingItems.forEach(async (item) => {
        const itemTime = new Date(item.scheduledTime);
        if (now >= itemTime) {
          await autoPublishReel(item);
        }
      });
    }, 10000);

    return () => clearInterval(checker);
  }, [queue]);

  // Auto-trigger dialogue-based caption generation on mount
  useEffect(() => {
    let active = true;

    const runAutoAnalysis = async () => {
      setIsGenerating(true);
      setGenerationError(null);

      // Join subtitles to get dialogue transcript
      const textTranscript = (segment.subtitles || []).map(s => s.text.replace(/\r?\n/g, ' ')).join(' ');

      try {
        const data = await analyzeReelAndGenerateCaption(textTranscript, videoFile.name);
        if (active) {
          setCaptionData(data);
          setWizardStep('publish-dashboard');
          setLogs([
            {
              timestamp: new Date().toLocaleTimeString(),
              message: `Production node active. Pre-authenticated to Instagram Professional Account ${igAccountId}.`,
              type: 'success'
            },
            {
              timestamp: new Date().toLocaleTimeString(),
              message: `AI analyzed dialogue transcript (${segment.subtitles.length} lines) and auto-generated captions.`,
              type: 'success'
            }
          ]);
        }
      } catch (err: any) {
        if (active) {
          setGenerationError(err.message || "Failed to automatically write captions. Setup parameters manually below.");
        }
      } finally {
        if (active) {
          setIsGenerating(false);
        }
      }
    };

    runAutoAnalysis();

    return () => {
      active = false;
    };
  }, []);

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { timestamp: time, message, type }]);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleGenerateCaption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const data = await generateReelCaptions(topic, tone, transcription, keyPoints);
      setCaptionData(data);
      setWizardStep('publish-dashboard');
      // Initialize welcome log
      setLogs([
        {
          timestamp: new Date().toLocaleTimeString(),
          message: `Production node active. Pre-authenticated to Instagram Professional Account ${igAccountId}.`,
          type: 'success'
        }
      ]);
    } catch (err: any) {
      setGenerationError(err.message || "Failed to generate captions. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSkipCaption = () => {
    const fallbackData: ReelCaptionData = {
      hook: `Highlights from ${videoFile.name.replace(/\.[^/.]+$/, "")}`,
      body: `Check out this segment from our video!\n\nLike and follow for more similar content.`,
      hashtags: ['reels', 'shorts', 'video', 'sliced'],
      suggestedAudioType: 'Trending aesthetic background track',
      visualSuggestions: ['Subtitles centered', 'Fast pacing']
    };
    setCaptionData(fallbackData);
    setWizardStep('publish-dashboard');
    setLogs([
      {
        timestamp: new Date().toLocaleTimeString(),
        message: `Production node active. Pre-authenticated to Instagram Professional Account ${igAccountId}.`,
        type: 'success'
      }
    ]);
  };

  // Compile video locally using exportVideo canvas/encoder pipeline
  const compileVideoSegment = async (): Promise<Blob> => {
    if (compiledBlob) return compiledBlob;

    setIsCompiling(true);
    setCompileProgress(0);
    addLog("Compiling trimmed and cropped 9:16 vertical Reel...", "info");

    try {
      const blob = await exportVideo(
        videoUrl,
        segment,
        (prog) => setCompileProgress(prog),
        textSettings
      );
      const url = URL.createObjectURL(blob);
      setCompiledBlob(blob);
      setCompiledUrl(url);
      addLog("Video segment compiled successfully!", "success");
      return blob;
    } catch (err: any) {
      addLog(`Compilation failed: ${err.message || err}`, "error");
      throw err;
    } finally {
      setIsCompiling(false);
    }
  };

  // One-Click Temporary Cloud File Upload helper (tmpfiles.org API)
  const uploadToCloud = async (blob: Blob): Promise<string> => {
    setUploadingToCloud(true);
    addLog("Staging compiled Reel onto public tmpfiles.org CDN node (expires in 60 mins)...", "info");

    try {
      const formData = new FormData();
      formData.append('file', blob, 'reel_output.mp4');

      const response = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload server responded with code ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'success') {
        const viewerUrl = result.data.url;
        // Convert to raw direct download url (replace domain path with dl path)
        const directUrl = viewerUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        setPublicVideoUrl(directUrl);
        addLog(`Video staged successfully! Direct CDN URL: ${directUrl}`, "success");
        return directUrl;
      } else {
        throw new Error(result.data || "Upload rejected by CDN server.");
      }
    } catch (err: any) {
      const msg = err.message || "Failed to establish cloud staging link.";
      addLog(`Staging upload failed: ${msg}`, "error");
      throw err;
    } finally {
      setUploadingToCloud(false);
    }
  };

  // Mock slot schedule calculations
  function getMockSlotTime(offsetIndex: number): string {
    const now = new Date();
    const slots = [];
    
    for (let i = 0; i < 5; i++) {
      const date1 = new Date();
      date1.setDate(now.getDate() + i);
      date1.setHours(11, 0, 0, 0);

      const date2 = new Date();
      date2.setDate(now.getDate() + i);
      date2.setHours(21, 0, 0, 0);

      slots.push(date1, date2);
    }

    const futureSlots = slots.filter(s => s.getTime() > now.getTime());
    const target = futureSlots[offsetIndex] || futureSlots[0];
    return target.toISOString();
  }

  // Calculate the next open slot dynamically
  const getNextAvailableSlot = (): Date => {
    const now = new Date();
    const candidateSlots: Date[] = [];

    for (let i = 0; i < 7; i++) {
      const d1 = new Date();
      d1.setDate(now.getDate() + i);
      d1.setHours(11, 0, 0, 0);

      const d2 = new Date();
      d2.setDate(now.getDate() + i);
      d2.setHours(21, 0, 0, 0);

      candidateSlots.push(d1, d2);
    }

    const futureSlots = candidateSlots.filter(slot => slot.getTime() > now.getTime());

    for (const slot of futureSlots) {
      const isTaken = queue.some(item => 
        item.status === 'queued' && 
        new Date(item.scheduledTime).getTime() === slot.getTime()
      );
      if (!isTaken) return slot;
    }

    return futureSlots[0];
  };

  // Get calendar slots for the next 7 days (morning at 11 AM, evening at 9 PM)
  const getCalendarSlots = () => {
    const slots: { date: Date; label: string; morningTime: string; eveningTime: string; morningItem?: ScheduledReel; eveningItem?: ScheduledReel }[] = [];
    const now = new Date();
    
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      
      const mTime = new Date(d);
      mTime.setHours(11, 0, 0, 0);
      
      const eTime = new Date(d);
      eTime.setHours(21, 0, 0, 0);
      
      const dayLabel = i === 0 
        ? "Today" 
        : i === 1 
          ? "Tomorrow" 
          : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
      
      const morningItem = queue.find(item => {
        const itemDate = new Date(item.scheduledTime);
        return itemDate.getDate() === d.getDate() && 
               itemDate.getMonth() === d.getMonth() && 
               itemDate.getFullYear() === d.getFullYear() &&
               itemDate.getHours() === 11;
      });

      const eveningItem = queue.find(item => {
        const itemDate = new Date(item.scheduledTime);
        return itemDate.getDate() === d.getDate() && 
               itemDate.getMonth() === d.getMonth() && 
               itemDate.getFullYear() === d.getFullYear() &&
               itemDate.getHours() === 21;
      });
      
      slots.push({
        date: d,
        label: dayLabel,
        morningTime: mTime.toISOString(),
        eveningTime: eTime.toISOString(),
        morningItem,
        eveningItem
      });
    }
    return slots;
  };

  // Add compiled segment to a specific slot time
  const handleAddToSpecificSlot = async (slotTimeISO: string) => {
    setIsPublishing(true);
    setPublishError(null);

    try {
      const blob = await compileVideoSegment();
      const directUrl = await uploadToCloud(blob);

      const newReel: ScheduledReel = {
        id: `reel-${Date.now()}`,
        videoUrl: directUrl,
        hook: captionData?.hook || '',
        body: captionData?.body || '',
        hashtags: captionData?.hashtags || [],
        scheduledTime: slotTimeISO,
        status: 'queued',
        log: 'Staged in scheduling queue.'
      };

      // Remove any existing queued item at this exact slot (override)
      setQueue(prev => {
        const filtered = prev.filter(item => {
          const itemTime = new Date(item.scheduledTime).getTime();
          const targetTime = new Date(slotTimeISO).getTime();
          return itemTime !== targetTime || item.status !== 'queued';
        });
        return [...filtered, newReel];
      });

      addLog(`Staged Reel in calendar slot for ${new Date(slotTimeISO).toLocaleString()}.`, 'success');
    } catch (e: any) {
      setPublishError(`Could not schedule to slot: ${e.message || e}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Add currently compiled video & AI caption to the schedule queue
  const handleAddToQueue = async () => {
    setIsPublishing(true);
    setPublishError(null);

    try {
      const blob = await compileVideoSegment();
      const directUrl = await uploadToCloud(blob);

      const nextSlot = getNextAvailableSlot();
      const newReel: ScheduledReel = {
        id: `reel-${Date.now()}`,
        videoUrl: directUrl,
        hook: captionData?.hook || '',
        body: captionData?.body || '',
        hashtags: captionData?.hashtags || [],
        scheduledTime: nextSlot.toISOString(),
        status: 'queued',
        log: 'Staged in scheduling queue.'
      };

      setQueue(prev => [...prev, newReel]);
      addLog(`Staged new Reel in scheduling queue for ${nextSlot.toLocaleString()}.`, 'success');
    } catch (e: any) {
      setPublishError(`Could not queue: ${e.message || e}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Remove item from queue
  const handleRemoveFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
    addLog("Reel removed from scheduling queue.", "warn");
  };

  // Auto-Publish triggering when clock matches slot
  const autoPublishReel = async (reel: ScheduledReel) => {
    setQueue(prev => prev.map(item => item.id === reel.id ? { ...item, status: 'publishing' } : item));
    addLog(`Auto-Publish triggered for Reel "${reel.hook.slice(0, 20)}..."`, "info");

    try {
      const fullCaption = `${reel.hook}\n\n${reel.body}\n\n${(reel.hashtags || []).map(t => `#${String(t || '').trim()}`).join(' ')}`;
      
      // 1. Create Media Container
      const containerUrl = `${proxyPrefix}/v19.0/${igAccountId}/media`;
      const response = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: reel.videoUrl,
          caption: fullCaption,
          share_to_feed: true,
          access_token: accessToken
        })
      });

      const containerResult = await response.json();
      if (!response.ok || !containerResult.id) {
        const metaErr = containerResult.error || {};
        throw new Error(`${metaErr.message || "Container failed."} (Code: ${metaErr.code || "unknown"})`);
      }

      const containerId = containerResult.id;
      
      // 2. Polling status checks
      let status = 'IN_PROGRESS';
      let attempts = 0;
      while (status !== 'FINISHED' && attempts < 20) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 8000));
        const statusRes = await fetch(`${proxyPrefix}/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`);
        const statusObj = await statusRes.json();
        if (!statusRes.ok) {
          const metaErr = statusObj.error || {};
          throw new Error(`Polling failed: ${metaErr.message || "unknown"}`);
        }
        status = statusObj.status_code || 'IN_PROGRESS';
      }

      if (status !== 'FINISHED') throw new Error("Video processing timed out on Meta API.");

      // 3. Publish
      const publishRes = await fetch(`${proxyPrefix}/v19.0/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerId, access_token: accessToken })
      });
      const publishObj = await publishRes.json();
      if (!publishRes.ok || !publishObj.id) {
        const metaErr = publishObj.error || {};
        throw new Error(`${metaErr.message || "Publish confirmation failed."}`);
      }

      setQueue(prev => prev.map(item => item.id === reel.id ? { ...item, status: 'published', log: `Published. ID: ${publishObj.id}` } : item));
      addLog(`Live Reel "${reel.hook.slice(0, 15)}..." published successfully.`, "success");
    } catch (err: any) {
      const errMsg = err.message || "Unknown API error.";
      setQueue(prev => prev.map(item => item.id === reel.id ? { ...item, status: 'failed', log: errMsg } : item));
      addLog(`Failed to publish scheduled Reel: ${errMsg}`, "error");
    }
  };

  // Instant direct publish
  const handlePublishInstant = async () => {
    setIsPublishing(true);
    setPublishSuccess(false);
    setPublishError(null);
    setLogs([]);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      const blob = await compileVideoSegment();
      const targetUrl = await uploadToCloud(blob);

      addLog("Step 1: Creating Meta Media Container on Facebook Graph node...", "info");
      const fullCaption = `${captionData?.hook}\n\n${captionData?.body}\n\n${(captionData?.hashtags || []).map(t => `#${String(t || '').trim()}`).join(' ')}`;
      
      const containerResponse = await fetch(`${proxyPrefix}/v19.0/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: targetUrl,
          caption: fullCaption,
          share_to_feed: true,
          access_token: accessToken
        })
      });

      const containerResult = await containerResponse.json();
      if (!containerResponse.ok || !containerResult.id) {
        const metaErr = containerResult.error || {};
        throw new Error(`${metaErr.message || "Container creation failed."} (Code: ${metaErr.code || "unknown"})`);
      }

      const containerId = containerResult.id;
      addLog(`Container created successfully. ID: ${containerId}`, "success");
      addLog("Step 2: Polling Meta processing status (checks every 10s)...", "info");

      let status = 'IN_PROGRESS';
      let attempts = 0;
      while (status !== 'FINISHED' && attempts < 25) {
        attempts++;
        await sleep(10000);
        const statusRes = await fetch(`${proxyPrefix}/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`);
        const statusObj = await statusRes.json();
        if (!statusRes.ok) {
          const metaErr = statusObj.error || {};
          throw new Error(`Polling failed: ${metaErr.message || "unknown"}`);
        }
        status = statusObj.status_code || 'IN_PROGRESS';
        addLog(`Polling Meta (Attempt ${attempts}): ${status}`, "info");
        if (status === 'ERROR') throw new Error("Meta rendering processing failed.");
      }

      if (status !== 'FINISHED') throw new Error("Reels processing timed out on Meta API.");

      addLog("Step 3: Confirming Reel publish node and registering timeline post...", "success");
      const publishRes = await fetch(`${proxyPrefix}/v19.0/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerId, access_token: accessToken })
      });

      const publishObj = await publishRes.json();
      if (!publishRes.ok || !publishObj.id) {
        const metaErr = publishObj.error || {};
        throw new Error(`${metaErr.message || "Publication confirmation failed."}`);
      }

      addLog(`Successfully Published! Reel Post ID: ${publishObj.id}`, "success");
      setPublishSuccess(true);
      setIgPostUrl(`https://www.instagram.com/p/${publishObj.id}`);
    } catch (err: any) {
      const msg = err.message || "An unexpected error occurred.";
      addLog(`Publish failed: ${msg}`, "error");
      setPublishError(msg);
    } finally {
      setIsPublishing(false);
    }
  };

  const getCountdownString = (targetTime: string): string => {
    const diff = new Date(targetTime).getTime() - new Date().getTime();
    if (diff <= 0) return "Publishing...";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  };

  // STEP 1: CAPTION GENERATOR SCREEN
  if (wizardStep === 'caption-setup') {
    if (isGenerating && !captionData) {
      return (
        <div className="w-full flex flex-col items-center justify-center py-20 text-center bg-gray-50 border border-gray-100 border-dashed rounded-2xl gap-4">
          <Loader className="w-10 h-10 text-indigo-600 animate-spin" />
          <div>
            <h4 className="text-sm font-bold text-gray-800">🤖 AI is analyzing your Reel...</h4>
            <p className="text-[11px] text-gray-500 mt-1 max-w-[280px] mx-auto leading-relaxed">
              Reading dialogue subtitles and generating a high-converting hook, caption, and hashtags tailored to this segment.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col gap-6 text-gray-800">
        <div className="border-b border-gray-100 pb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            AI Video Caption Writer
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Generate viral hooks, captions, and hashtag bundles tailored to this segment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* Form Side */}
          <form onSubmit={handleGenerateCaption} className="flex flex-col gap-4">
            <div className="form-group">
              <label className="form-label">Video Topic / Core Message *</label>
              <input
                type="text"
                required
                placeholder="e.g., 3 productivity secrets for software engineers"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="input-premium"
                disabled={isGenerating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tone of Voice</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="input-premium form-select-premium"
                disabled={isGenerating}
              >
                <option value="viral">Viral & Hype (Maximum Engagement)</option>
                <option value="educational">Educational & Direct (Structured)</option>
                <option value="witty">Witty & Sarcastic (Humorous)</option>
                <option value="motivational">Motivational & Deep (Inspirational)</option>
                <option value="mysterious">Curious & Suspenseful (Build Hook)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Key Points to Highlight</label>
              <textarea
                placeholder="e.g., mention VS Code shortcuts, suggest ergonomic setup"
                value={keyPoints}
                onChange={(e) => setKeyPoints(e.target.value)}
                className="input-premium h-16 resize-none"
                disabled={isGenerating}
              />
            </div>

            <div className="form-group">
              <div className="transcription-header-row">
                <label className="form-label">Audio Script / Dialogue Transcript</label>
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`dictate-badge ${isListening ? 'dictate-badge-active' : 'dictate-badge-inactive'}`}
                  >
                    {isListening ? <MicOff size={11} /> : <Mic size={11} />}
                    {isListening ? 'Listening...' : 'Dictate Speech'}
                  </button>
                )}
              </div>
              <textarea
                placeholder="Describe your spoken dialogue, or copy/edit the subtitle transcript here."
                value={transcription}
                onChange={(e) => setTranscription(e.target.value)}
                className="input-premium h-24 resize-none"
                disabled={isGenerating}
              />
            </div>

            {generationError && (
              <div className="p-3 bg-rose-50 text-rose-600 rounded-lg text-xs flex items-center gap-2 border border-rose-100">
                <AlertTriangle size={14} className="flex-shrink-0" />
                <span>{generationError}</span>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={handleSkipCaption}
                disabled={isGenerating}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-200 transition-colors"
              >
                Skip & Manual Caption
              </button>
              <button
                type="submit"
                disabled={isGenerating || !topic}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white font-semibold rounded-xl text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    <span>Writing Caption...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Generate Captions</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Right Preview Side */}
          <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-center items-center text-center">
            <h4 className="font-bold text-gray-700 mb-2">Original Segment Script</h4>
            <div className="max-w-[280px] max-h-[220px] overflow-y-auto text-xs text-gray-500 italic leading-relaxed border-l-2 border-indigo-200 pl-3 text-left">
              {segment.subtitles.length > 0 ? (
                segment.subtitles.map((sub, i) => (
                  <p key={i} className="mb-2">
                    <span className="text-[10px] font-bold text-indigo-400 mr-2">[{Math.floor(sub.start)}s]</span>
                    "{sub.text.replace(/\r?\n/g, ' ')}"
                  </p>
                ))
              ) : (
                <p>No subtitles found for this segment.</p>
              )}
            </div>
            <div className="mt-4 p-3 bg-indigo-50/50 rounded-lg text-[11px] text-indigo-600 text-left border border-indigo-100/50 flex gap-2">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              <span>We automatically read the subtitles generated from your transcription upload to pre-populate the AI model's context.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: PUBLISHING PANEL
  return (
    <div className="w-full flex flex-col gap-6 text-gray-800">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-gray-100 pb-4 gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Instagram className="w-5 h-5 text-pink-500" />
            Instagram Publishing Panel
          </h3>
          <p className="text-xs text-gray-500">
            Direct-access active. Linked to Instagram Account {igAccountId}.
          </p>
        </div>
        
        {/* Navigation tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg self-start sm:self-center">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'queue' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('queue')}
          >
            <Calendar size={13} /> Schedule Queue
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
              activeTab === 'mockup' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('mockup')}
          >
            <Eye size={13} /> Mock Feed
          </button>
        </div>
      </div>

      {/* Grid panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full items-start">
        
        {/* Left Column: Form & Connection Details (lg:span-7) */}
        <div className="lg:col-span-7 flex flex-col gap-5 w-full">
          
          {/* TAB 1: SCHEDULE QUEUE */}
          {activeTab === 'queue' && (
            <div className="flex flex-col gap-4 w-full">
              
              {/* Compile and Queue Trigger Card */}
              <div className="p-4 bg-indigo-50/20 border border-indigo-100 rounded-xl">
                <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-1.5 mb-2">
                  <Calendar size={15} className="text-indigo-500" /> Stage Current Reel Segment
                </h4>
                <p className="text-xs text-indigo-700 leading-relaxed mb-4">
                  Compile the segment into 9:16 layout, burn subtitle overlays, upload to CDN, and add it to the release queue. It will automatically take the next open slot at <strong>11:00 AM</strong> or <strong>9:00 PM</strong> daily.
                </p>

                {isCompiling && (
                  <div className="mb-4 p-3 bg-white border border-indigo-100 rounded-lg flex items-center gap-3">
                    <Loader size={16} className="animate-spin text-indigo-600" />
                    <div className="flex-1">
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span>Compiling Video...</span>
                        <span>{Math.round(compileProgress)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-full transition-all duration-100" style={{ width: `${compileProgress}%` }} />
                      </div>
                    </div>
                  </div>
                )}

                {uploadingToCloud && (
                  <div className="mb-4 p-3 bg-white border border-indigo-100 rounded-lg flex items-center gap-3">
                    <Loader size={16} className="animate-spin text-indigo-600" />
                    <span className="text-xs text-gray-600">Uploading media to temporary public CDN...</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    type="button" 
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white font-semibold rounded-lg text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    onClick={handleAddToQueue}
                    disabled={isPublishing || isCompiling || uploadingToCloud}
                  >
                    <Plus size={16} /> Stage Reel in Queue
                  </button>
                  <button 
                    type="button" 
                    className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    onClick={handlePublishInstant}
                    disabled={isPublishing || isCompiling || uploadingToCloud}
                  >
                    <Send size={15} /> Publish Instantly
                  </button>
                </div>
              </div>

              {/* Interactive Weekly Content Calendar Timeline Chart */}
              <div className="border border-gray-200 rounded-xl p-4 bg-white">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-gray-800 text-sm">Content Calendar Schedule Chart</h4>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider bg-gray-100 px-2 py-0.5 rounded">
                    7-Day week view
                  </span>
                </div>

                <div className="overflow-x-auto pb-2 scrollbar-thin">
                  <div className="min-w-[650px] grid grid-cols-7 gap-2">
                    {/* Headers */}
                    {getCalendarSlots().map((slot, idx) => (
                      <div key={idx} className="text-center font-bold text-[11px] text-gray-600 pb-1 border-b border-gray-100">
                        {slot.label}
                      </div>
                    ))}

                    {/* Morning Row */}
                    {getCalendarSlots().map((slot, idx) => {
                      const item = slot.morningItem;
                      const time = slot.morningTime;
                      
                      return (
                        <div key={`m-${idx}`} className="flex flex-col gap-1">
                          <div className="text-[8px] font-bold text-gray-400 uppercase tracking-wider text-center">11:00 AM</div>
                          {item ? (
                            <div className="group relative border border-indigo-100 bg-indigo-50/20 hover:border-indigo-400 rounded-lg p-1.5 flex flex-col gap-1 transition-all h-[95px] justify-between">
                              <div className="flex gap-1.5 items-start min-w-0">
                                <div className="w-6 h-9 bg-black rounded overflow-hidden flex-shrink-0 relative">
                                  <video src={item.videoUrl} className="w-full h-full object-cover" muted playsInline />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[9px] font-bold text-gray-800 line-clamp-2 leading-tight">
                                    {item.hook}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-1 text-[8px] font-semibold">
                                <span className={`px-1 rounded-sm border ${
                                  item.status === 'queued' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' :
                                  item.status === 'publishing' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                  item.status === 'published' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                                  'bg-rose-50 border-rose-100 text-rose-600'
                                }`}>
                                  {item.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromQueue(item.id)}
                                  className="text-gray-400 hover:text-rose-500 p-0.5"
                                  title="Delete Scheduled Reel"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddToSpecificSlot(time)}
                              disabled={isPublishing || isCompiling || uploadingToCloud}
                              className="border border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/10 rounded-lg p-2 flex flex-col items-center justify-center gap-1 transition-all h-[95px] text-gray-400 hover:text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                              <Plus size={14} className="group-hover:scale-110 transition-transform" />
                              <span className="text-[9px] font-semibold">Stage</span>
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Evening Row */}
                    {getCalendarSlots().map((slot, idx) => {
                      const item = slot.eveningItem;
                      const time = slot.eveningTime;
                      
                      return (
                        <div key={`e-${idx}`} className="flex flex-col gap-1">
                          <div className="text-[8px] font-bold text-gray-400 uppercase tracking-wider text-center">09:00 PM</div>
                          {item ? (
                            <div className="group relative border border-indigo-100 bg-indigo-50/20 hover:border-indigo-400 rounded-lg p-1.5 flex flex-col gap-1 transition-all h-[95px] justify-between">
                              <div className="flex gap-1.5 items-start min-w-0">
                                <div className="w-6 h-9 bg-black rounded overflow-hidden flex-shrink-0 relative">
                                  <video src={item.videoUrl} className="w-full h-full object-cover" muted playsInline />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[9px] font-bold text-gray-800 line-clamp-2 leading-tight">
                                    {item.hook}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-1 text-[8px] font-semibold">
                                <span className={`px-1 rounded-sm border ${
                                  item.status === 'queued' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' :
                                  item.status === 'publishing' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                  item.status === 'published' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                                  'bg-rose-50 border-rose-100 text-rose-600'
                                }`}>
                                  {item.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromQueue(item.id)}
                                  className="text-gray-400 hover:text-rose-500 p-0.5"
                                  title="Delete Scheduled Reel"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddToSpecificSlot(time)}
                              disabled={isPublishing || isCompiling || uploadingToCloud}
                              className="border border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/10 rounded-lg p-2 flex flex-col items-center justify-center gap-1 transition-all h-[95px] text-gray-400 hover:text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                              <Plus size={14} className="group-hover:scale-110 transition-transform" />
                              <span className="text-[9px] font-semibold">Stage</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: EDIT CAPTION TEXT (Always configurable on Left column in Mockup mode too) */}
          {activeTab === 'mockup' && captionData && (
            <div className="flex flex-col gap-4 border border-gray-200 rounded-xl p-4 bg-white">
              <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Edit Caption Text</h4>
              
              <div className="form-group">
                <label className="form-label">Viral Hook Overlay</label>
                <input
                  type="text"
                  value={captionData.hook}
                  onChange={(e) => setCaptionData({ ...captionData, hook: e.target.value })}
                  className="input-premium text-xs"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Caption Body Text</label>
                <textarea
                  value={captionData.body}
                  onChange={(e) => setCaptionData({ ...captionData, body: e.target.value })}
                  className="input-premium text-xs h-24 resize-none"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Hashtags</label>
                <input
                  type="text"
                  value={captionData.hashtags.map(t => `#${t}`).join(' ')}
                  onChange={(e) => {
                    const tags = e.target.value.split(/\s+/).map(t => t.replace(/#/g, '').trim()).filter(Boolean);
                    setCaptionData({ ...captionData, hashtags: tags });
                  }}
                  className="input-premium text-xs"
                />
              </div>
            </div>
          )}

          {/* Active Publishing Execution Logs Console */}
          {(isPublishing || logs.length > 0) && (
            <div className="border border-gray-200 rounded-xl p-4 bg-white flex flex-col gap-2">
              <h4 className="font-bold text-gray-800 text-sm">Publishing Console Logs</h4>
              <div className="console-box">
                {logs.map((log, idx) => {
                  let textClass = 'console-text-info';
                  if (log.type === 'success') textClass = 'console-text-success';
                  if (log.type === 'error') textClass = 'console-text-error';
                  if (log.type === 'warn') textClass = 'console-text-warn';

                  return (
                    <div key={idx} className="console-line">
                      <span className="console-timestamp">[{log.timestamp}]</span>
                      <span className={textClass}>{log.message}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feedbacks Alerts */}
          {publishError && (
            <div className="alert-card alert-card-danger">
              <AlertTriangle size={18} className="alert-card-icon" />
              <div>
                <div className="alert-card-title">Publishing Failed</div>
                <p>{publishError}</p>
              </div>
            </div>
          )}

          {publishSuccess && (
            <div className="alert-card alert-card-success">
              <CheckCircle2 size={18} className="alert-card-icon" />
              <div className="flex-1">
                <div className="alert-card-title">Reel Published Live!</div>
                <p className="mb-2">Your vertical Reel clip and viral captions are now posted live on Instagram.</p>
                <a
                  href={igPostUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 transition-colors"
                >
                  <Link size={12} /> View live post
                </a>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-start mt-2">
            <button
              type="button"
              onClick={() => setWizardStep('caption-setup')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
            >
              ← Back to AI parameters setup
            </button>
          </div>

        </div>

        {/* Right Column: Instagram Mockup Frame (lg:span-5) */}
        <div className="lg:col-span-5 flex justify-center w-full">
          <div className="phone-frame-wrapper">
            <div className="phone-frame">
              <div className="phone-notch"></div>
              
              <div className="phone-screen">
                {/* Loop video segment */}
                <video
                  src={compiledUrl || videoUrl}
                  className="phone-video-bg"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
                
                {/* Visual overlays */}
                <div className="phone-dimmer"></div>

                {/* Top Reels Header */}
                <div className="phone-header">
                  <span>Reels</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                  </svg>
                </div>

                {/* Foot overlay */}
                <div className="phone-footer-overlay">
                  <div className="phone-meta-section">
                    
                    {/* User profile row */}
                    <div className="phone-avatar-row">
                      <div className="phone-avatar">
                        <div className="phone-avatar-inner">SM</div>
                      </div>
                      <span className="phone-username">reels_slicer_bot</span>
                      <button type="button" className="phone-follow-btn">Follow</button>
                    </div>

                    {/* Sticker Hook */}
                    {captionData && (
                      <div className="phone-hook-sticker">
                        🎬 {captionData.hook}
                      </div>
                    )}

                    {/* Caption area */}
                    {captionData && (
                      <div className="phone-caption-box">
                        <div className={isCaptionExpanded ? 'phone-caption-expanded' : 'phone-caption-truncated'}>
                          <span style={{ fontWeight: 'bold', marginRight: '4px' }}>reels_slicer_bot</span>
                          {captionData.body}
                          <div style={{ color: '#22d3ee', marginTop: '4px', fontWeight: 'bold' }}>
                            {captionData.hashtags.map(t => `#${t}`).join(' ')}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="phone-caption-more"
                          onClick={() => setIsCaptionExpanded(!isCaptionExpanded)}
                        >
                          {isCaptionExpanded ? 'less' : 'more'}
                        </button>
                      </div>
                    )}

                  </div>

                  {/* Sidebar engagement buttons */}
                  <div className="phone-actions-column">
                    <div className="phone-action-btn">
                      <Heart size={20} fill="white" />
                      <span>15.8K</span>
                    </div>
                    <div className="phone-action-btn">
                      <MessageCircle size={20} fill="white" />
                      <span>324</span>
                    </div>
                    <div className="phone-action-btn">
                      <Share2 size={20} />
                      <span>Share</span>
                    </div>
                    <div className="phone-music-icon">🎵</div>
                  </div>
                </div>

              </div>
            </div>
            
            <div className="phone-preview-label">
              <Eye size={12} /> Live preview mockup frame
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
