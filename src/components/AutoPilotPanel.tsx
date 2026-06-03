import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Plus, Trash2, Calendar, Loader, Info, ShieldCheck, CheckCircle2, AlertTriangle, Link, Zap, Flame, Terminal, HelpCircle } from 'lucide-react';
import { analyzeReelAndGenerateCaption, ReelCaptionData } from '../utils/openrouter';
import { exportVideo } from '../utils/exportVideo';
import { Segment } from '../utils/segmenter';

interface AutoPilotLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

interface AutoPilotHistoryItem {
  id: string;
  timestamp: string;
  videoUrl: string;
  hook: string;
  postUrl: string;
}

export function AutoPilotPanel() {
  // Toggle states
  const [isActive, setIsActive] = useState<boolean>(() => {
    return localStorage.getItem('sm_autopilot_active') === 'true';
  });

  const [useSuperCaption, setUseSuperCaption] = useState<boolean>(() => {
    return localStorage.getItem('sm_use_super_caption') === 'true';
  });

  // Video URL Pool
  const [videos, setVideos] = useState<string[]>(() => {
    const saved = localStorage.getItem('sm_autopilot_videos_v6');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    // Pre-populate dynamically using the current window origin
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    return [
      `${baseOrigin}/episode_569.mp4`,
      `${baseOrigin}/episode_1520.mp4`,
      `${baseOrigin}/bhide_scooter.mp4`,
      `${baseOrigin}/videoplayback.mp4`,
      `${baseOrigin}/bapuji_ghur_raha_hai.mp4`,
      `${baseOrigin}/episode_648.mp4`
    ];
  });

  const [newVideoUrl, setNewVideoUrl] = useState('');

  // Logs terminal states
  const [logs, setLogs] = useState<AutoPilotLog[]>(() => {
    const saved = localStorage.getItem('sm_autopilot_logs');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      {
        timestamp: new Date().toLocaleTimeString(),
        message: 'Auto-Pilot engine initialized. Standing by...',
        type: 'info'
      }
    ];
  });

  // Execution History
  const [history, setHistory] = useState<AutoPilotHistoryItem[]>(() => {
    const saved = localStorage.getItem('sm_autopilot_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });

  // Pipeline Running State
  const [isRunningCycle, setIsRunningCycle] = useState(false);
  const [cycleProgress, setCycleProgress] = useState(0);
  const [cycleStatus, setCycleStatus] = useState('');

  // Local storage updates
  useEffect(() => {
    localStorage.setItem('sm_autopilot_active', String(isActive));
  }, [isActive]);

  useEffect(() => {
    localStorage.setItem('sm_use_super_caption', String(useSuperCaption));
  }, [useSuperCaption]);

  useEffect(() => {
    localStorage.setItem('sm_autopilot_videos_v6', JSON.stringify(videos));
  }, [videos]);

  useEffect(() => {
    localStorage.setItem('sm_autopilot_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('sm_autopilot_history', JSON.stringify(history));
  }, [history]);

  const addLog = (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const logItem: AutoPilotLog = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [...prev, logItem].slice(-50)); // limit to 50 logs
  };

  const handleAddVideo = () => {
    if (!newVideoUrl || !newVideoUrl.startsWith('http')) {
      alert('Please enter a valid HTTP URL pointing to a video.');
      return;
    }
    setVideos(prev => [...prev, newVideoUrl]);
    setNewVideoUrl('');
    addLog(`Added video to autopilot pool: ${newVideoUrl.split('/').pop()}`, 'info');
  };

  const handleRemoveVideo = (index: number) => {
    const removed = videos[index];
    setVideos(prev => prev.filter((_, i) => i !== index));
    addLog(`Removed video from autopilot pool: ${removed.split('/').pop()}`, 'warn');
  };

  const clearLogs = () => {
    setLogs([
      {
        timestamp: new Date().toLocaleTimeString(),
        message: 'Console logs cleared.',
        type: 'info'
      }
    ]);
  };

  // MAIN RUN AUTOMATION PIPELINE (TEST SHORTCUT)
  const triggerAutoPilotCycle = async () => {
    if (videos.length === 0) {
      alert('Please add at least one video to the pool first.');
      return;
    }
    setIsRunningCycle(true);
    setCycleProgress(0);
    setCycleStatus('Selecting video...');
    addLog('🚀 Autopilot execution cycle triggered manually.', 'info');

    const igAccountId = '17841469941844600';
    const accessToken = 'IGAAZBlrjgzhq1BZAGE4dmhUS2dLbjBoTVo2ajZACdHYweEZAVUllEZAmQxcHllc1EzQ3FKNWE3UVM2ZAFhEYTc3YWd3RmZA4dDA5UGN1bk1UdDQ2b3p3ek1kM19RZAzFKNnZAYS3Q0QmR2aVh4ZAjZAaOXBzYUM1WDN5R3gzdUZAYQkNURDNZAYwZDZD';
    const isIgToken = accessToken.startsWith('IGAA');
    const proxyPrefix = isIgToken ? '/api-proxy/instagram' : '/api-proxy/facebook';

    try {
      // 1. Pick a video randomly from the pool
      const selectedIndex = Math.floor(Math.random() * videos.length);
      const videoSrcUrl = videos[selectedIndex];
      const videoName = videoSrcUrl.split('/').pop() || 'autopilot_reel.mp4';
      addLog(`Picked video: "${videoName}"`, 'info');
      setCycleStatus('Loading video metadata...');

      // 2. Load video metadata in background
      const video = document.createElement('video');
      video.src = videoSrcUrl;
      video.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video file. Make sure URL is direct and supports CORS.'));
      });

      const targetDuration = Math.min(video.duration, 15); // crop up to 15 seconds
      const maxStartTime = Math.max(0, video.duration - targetDuration);
      const randomStart = Math.random() * maxStartTime;
      const startTime = Number(randomStart.toFixed(2));
      const endTime = Number((startTime + targetDuration).toFixed(2));

      addLog(`Video loaded. Trimming random segment: ${startTime.toFixed(1)}s to ${endTime.toFixed(1)}s (Total duration: ${video.duration.toFixed(1)}s)`, 'info');
      setCycleStatus('Compiling 9:16 vertical Reel...');

      // 3. Compile segment to 9:16 canvas output
      const segment: Segment = {
        id: `auto-${Date.now()}`,
        startTime,
        endTime,
        duration: targetDuration,
        subtitles: [] // Auto-Pilot doesn't burn subtitles by default
      };

      const defaultTextSettings = {
        fontSize: 32,
        textColor: '#ffffff',
        bgColor: 'transparent'
      };

      const compiledBlob = await exportVideo(
        videoSrcUrl,
        segment,
        (progress) => {
          setCycleProgress(Math.round(progress * 0.5)); // compiler is first 50% of workflow
        },
        defaultTextSettings
      );

      addLog('Video compiled successfully! Uploading to CDN...', 'success');
      setCycleStatus('Uploading to temporary CDN...');

      // 4. Upload to CDN (tmpfiles.org)
      const formData = new FormData();
      formData.append('file', compiledBlob, 'reel_output.mp4');

      const response = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`CDN server rejected upload with code ${response.status}`);
      }

      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.data || 'CDN upload rejected.');
      }

      const viewerUrl = result.data.url;
      const directCdnUrl = viewerUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      addLog(`Video uploaded to CDN: ${directCdnUrl}`, 'success');
      setCycleProgress(60);
      setCycleStatus('Generating AI caption...');

      // 5. Generate or select captions
      let captionData: ReelCaptionData;
      if (useSuperCaption) {
        addLog('Super Caption Mode is active. Using predefined tea caption.', 'info');
        captionData = {
          hook: "When you’re so desperate for tea you literally destroy it.",
          body: "Jethalal really out here doing the most just for a cup of chai. Pro tip: if you’re looking for someone, maybe don't tackle them the second they show up? ☕️💨 Now the only thing being served is a floor-cleaning session. Truly a masterclass in coordination.",
          hashtags: ["TeaSpill", "JethalalMemes", "TMKOC", "DramaQueen"]
        };
      } else {
        addLog('Asking OpenRouter AI to analyze dialogue context and write captions...', 'info');
        // Autofill topic/context with filename
        const dialogueText = `(Autopilot post based on video file: ${videoName})`;
        captionData = await analyzeReelAndGenerateCaption(dialogueText, videoName);
      }

      addLog(`Captions Configured! Hook: "${captionData.hook}"`, 'success');
      setCycleProgress(75);
      setCycleStatus('Publishing to Instagram...');

      // 6. Post to Instagram Graph API
      addLog('Step A: Creating Media Container on Meta Graph node...', 'info');
      const fullCaption = `${captionData.hook}\n\n${captionData.body}\n\n${(captionData.hashtags || []).map(t => `#${String(t || '').replace(/^#/, '').trim()}`).join(' ')}`;
      
      const containerRes = await fetch(`${proxyPrefix}/v19.0/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: directCdnUrl,
          caption: fullCaption,
          share_to_feed: true,
          access_token: accessToken
        })
      });

      const containerObj = await containerRes.json();
      if (!containerRes.ok || !containerObj.id) {
        throw new Error(containerObj.error?.message || 'Instagram container creation failed.');
      }

      const containerId = containerObj.id;
      addLog(`Container created. Polling processing status...`, 'info');
      setCycleStatus('Polling Meta processing status...');

      let publishStatus = 'IN_PROGRESS';
      let attempts = 0;
      while (publishStatus !== 'FINISHED' && attempts < 25) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 8000));
        const statusRes = await fetch(`${proxyPrefix}/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`);
        const statusObj = await statusRes.json();
        if (!statusRes.ok) {
          throw new Error('Polling failed.');
        }
        publishStatus = statusObj.status_code || 'IN_PROGRESS';
        addLog(`Polling Meta (Attempt ${attempts}): ${publishStatus}`, 'info');
        if (publishStatus === 'ERROR') throw new Error('Meta rendering failed.');
      }

      if (publishStatus !== 'FINISHED') throw new Error('Meta rendering timed out.');

      setCycleProgress(90);
      setCycleStatus('Confirming publication...');
      addLog('Step B: Confirming Reel publish node...', 'info');

      const publishRes = await fetch(`${proxyPrefix}/v19.0/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerId, access_token: accessToken })
      });

      const publishObj = await publishRes.json();
      if (!publishRes.ok || !publishObj.id) {
        throw new Error(publishObj.error?.message || 'Meta publication failed.');
      }

      const postUrl = `https://www.instagram.com/p/${publishObj.id}`;
      addLog(`Reel published successfully! Post ID: ${publishObj.id}`, 'success');
      setCycleProgress(100);

      // 7. Add to History
      const newHistoryItem: AutoPilotHistoryItem = {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        videoUrl: videoSrcUrl,
        hook: captionData.hook,
        postUrl
      };

      setHistory(prev => [newHistoryItem, ...prev]);
      addLog(`Automation cycle completed successfully. Post Live at: ${postUrl}`, 'success');
    } catch (e: any) {
      const errMsg = e.message || e;
      addLog(`Autopilot cycle failed: ${errMsg}`, 'error');
      alert(`Autopilot cycle failed: ${errMsg}`);
    } finally {
      setIsRunningCycle(false);
      setCycleStatus('');
    }
  };

  // Clock Trigger: Check once an hour if autopilot is active, and schedule slot
  // Note: For showcase/web app, we run checker.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isActive) return;
      
      const now = new Date();
      // Auto-post at exactly 11:00 AM or 9:00 PM if active
      if ((now.getHours() === 11 || now.getHours() === 21) && now.getMinutes() === 0) {
        addLog('Scheduled daily slot time matched. Running autopilot cycle...', 'info');
        triggerAutoPilotCycle();
      }
    }, 60000); // Check every minute

    return () => clearInterval(timer);
  }, [isActive, videos]);

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6 pt-6 text-gray-800">
      
      {/* Top Header Panel */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-indigo-600 animate-pulse" />
            <h2 className="text-xl font-bold tracking-tight text-gray-900">Auto-Pilot Publishing Bot</h2>
            <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
              Autonomous mode
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1 max-w-xl leading-relaxed">
            Upload 5-6 web videos to the pool. When Auto-Pilot is active, the bot will pick a video daily, crop it to vertical format, write captions based on context, and publish it to Instagram.
          </p>
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200/50 p-3 rounded-xl">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Auto-Pilot Status</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={isActive} 
              onChange={(e) => {
                setIsActive(e.target.checked);
                addLog(`Auto-Pilot Mode turned ${e.target.checked ? 'ON' : 'OFF'}.`, e.target.checked ? 'success' : 'warn');
              }}
              className="sr-only peer" 
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
        
        {/* Left Column: Video Pool & Terminal Logs (lg:span-7) */}
        <div className="lg:col-span-7 flex flex-col gap-6 w-full">
          
          {/* Web Video Pool Card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-500" /> Video Playlist Pool ({videos.length})
              </h3>
              <span className="text-[10px] text-gray-400 font-semibold uppercase">Daily Queue</span>
            </div>

            {/* Input URL */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste public direct video URL (.mp4)..."
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                className="input-premium flex-1 text-xs"
              />
              <button
                onClick={handleAddVideo}
                className="px-4 py-2 bg-indigo-600 text-white font-semibold text-xs rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {/* Video List */}
            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {videos.map((vid, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-100 rounded-lg text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-4 h-4 bg-gray-200 rounded-full flex items-center justify-center font-bold text-[9px] text-gray-600 flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-gray-700 truncate max-w-[220px] sm:max-w-[340px]">
                      {vid.split('/').pop()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveVideo(idx)}
                    className="text-gray-400 hover:text-rose-500 p-1 flex-shrink-0"
                    title="Delete Video"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {videos.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">No videos in the pool. Add direct video links above.</p>
              )}
            </div>
          </div>

          {/* Autopilot Terminal Log Card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-emerald-500" /> Autopilot Live Logs Console
              </h3>
              <button
                onClick={clearLogs}
                className="text-[10px] text-gray-400 hover:text-gray-600 font-semibold uppercase tracking-wider"
              >
                Clear Log
              </button>
            </div>

            <div className="console-box min-h-[180px]">
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

        </div>

        {/* Right Column: Execution History & Manual Test Trigger (lg:span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-6 w-full">
          
          {/* Auto-Pilot Trigger Controls */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Bot Scheduler Config</h3>
            
            <div className="flex items-center justify-between p-3 bg-indigo-50/20 border border-indigo-100/50 rounded-xl">
              <div className="flex items-center gap-2 text-indigo-900">
                <Calendar size={16} />
                <span className="text-xs font-bold">Daily Slot Timers</span>
              </div>
              <div className="text-[10px] bg-indigo-100 text-indigo-600 font-bold px-2.5 py-1 rounded">
                11:00 AM & 9:00 PM
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100/80 rounded-xl shadow-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                  <span>Super Caption Mode</span>
                </span>
                <span className="text-[9px] text-amber-700 max-w-[200px] leading-tight">
                  Always use the Jethalal viral tea caption instead of OpenRouter AI.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={useSuperCaption} 
                  onChange={(e) => setUseSuperCaption(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {isRunningCycle ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Loader size={16} className="animate-spin text-indigo-600" />
                  <span className="text-xs font-bold text-gray-700">{cycleStatus}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-1 font-mono">
                  <span>Cycle Progress</span>
                  <span>{cycleProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${cycleProgress}%` }} />
                </div>
              </div>
            ) : (
              <button
                onClick={triggerAutoPilotCycle}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
              >
                <Zap size={16} fill="white" />
                <span>Trigger Auto-Pilot Cycle Now</span>
              </button>
            )}

            <div className="p-3 bg-amber-50 border border-amber-100/50 rounded-xl text-[10px] text-amber-800 flex gap-2">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Simulated Cron:</strong> While the tab is active, the scheduler checks every minute. You can click the trigger button above to immediately run and test the complete automated compiling and posting pipeline.
              </p>
            </div>
          </div>

          {/* Publishing History Card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
            <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Auto-Pilot History</h3>
            
            <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto pr-1">
              {history.map((item) => (
                <div key={item.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-gray-400">{item.timestamp}</span>
                    <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded">
                      SUCCESS
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-gray-800 truncate">🎬 {item.hook}</h4>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-500 font-mono truncate max-w-[150px]">
                      Source: {item.videoUrl.split('/').pop()}
                    </span>
                    <a
                      href={item.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5"
                    >
                      <Link size={10} /> View Post
                    </a>
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">No previous Auto-Pilot runs recorded.</p>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
