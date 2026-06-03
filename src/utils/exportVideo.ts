import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Segment } from './segmenter';
import { TextSettings } from '../components/Slicer';

export async function exportVideo(
  videoUrl: string,
  segment: Segment,
  onProgress: (progress: number) => void,
  textSettings: TextSettings
): Promise<Blob> {
  const CANVAS_WIDTH = 720;
  const CANVAS_HEIGHT = 1280;
  const FPS = 30;

  // 1. Decode Audio first so we can sync it correctly
  let audioBuffer: AudioBuffer | null = null;
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContext({ sampleRate: 44100 });
    const resp = await fetch(videoUrl);
    const ab = await resp.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(ab);
  } catch (err) {
    console.error('Failed to decode audio track:', err);
  }

  return new Promise(async (resolve, reject) => {
    try {
      // 2. Setup mp4-muxer
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
        },
        audio: audioBuffer ? {
          codec: 'aac',
          sampleRate: 44100,
          numberOfChannels: audioBuffer.numberOfChannels,
        } : undefined,
        fastStart: 'in-memory',
      });

      // 3. Setup VideoEncoder
      let videoConfig: VideoEncoderConfig = {
        codec: 'avc1.42E01F', // H.264 Baseline Profile level 3.1
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        bitrate: 5_000_000,
        framerate: FPS,
      };

      const videoSupport = await VideoEncoder.isConfigSupported(videoConfig);
      if (!videoSupport.supported) {
        // Fallback to simpler or higher profile if needed, or vp9 (but mp4-muxer mainly targets avc)
        console.warn('avc1.42E01F not strictly supported, trying anyway or falling back to defaults');
      }

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta as any),
        error: (e) => reject(e),
      });
      videoEncoder.configure(videoConfig);

      // 4. Setup AudioEncoder
      let audioEncoder: AudioEncoder | null = null;
      if (audioBuffer) {
        const audioConfig: AudioEncoderConfig = {
          codec: 'mp4a.40.2',
          sampleRate: 44100,
          numberOfChannels: audioBuffer.numberOfChannels,
          bitrate: 128_000,
        };
        const audioSupport = await AudioEncoder.isConfigSupported(audioConfig);
        
        if (audioSupport.supported) {
          audioEncoder = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta as any),
            error: (e) => console.error('Audio encoder error:', e),
          });
          audioEncoder.configure(audioConfig);
        } else {
          console.warn('AAC audio encoding not supported in this browser.');
        }
      }

      // 5. Setup Canvas and Video Element
      const video = document.createElement('video');
      video.src = videoUrl;
      video.playsInline = true;
      video.muted = true;
      video.crossOrigin = 'anonymous'; // Optional but good practice

      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2d context');

      const initVideo = async () => {
        // Wait for video to be seekable
        if (video.readyState < 2) {
          await new Promise((r) => { video.onloadeddata = r; });
        }
        
        const duration = segment.endTime - segment.startTime;
        const totalFrames = Math.ceil(duration * FPS);
        let currentFrame = 0;
        let currentTime = segment.startTime;
        const frameInterval = 1 / FPS;

        // Offline loop via seeked event
        video.onseeked = async () => {
          if (currentFrame >= totalFrames || currentTime > segment.endTime) {
            video.onseeked = null;
            await finishExport();
            return;
          }

          // Draw crop
          const scale = Math.max(CANVAS_WIDTH / video.videoWidth, CANVAS_HEIGHT / video.videoHeight);
          const w = video.videoWidth * scale;
          const h = video.videoHeight * scale;
          const x = (CANVAS_WIDTH - w) / 2;
          const y = (CANVAS_HEIGHT - h) / 2;

          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.drawImage(video, x, y, w, h);

          // Draw Subtitle (Impact Font + Great Colors)
          const currentSub = (segment.subtitles || []).find(s => currentTime >= s.start && currentTime <= s.end);
          if (currentSub) {
            ctx.save();
            
            // Map 56px UI font size to roughly 64px Canvas size (720 width vs ~320 preview)
            const fontSizeCanvas = Math.floor(textSettings.fontSize * (720 / 400));
            ctx.font = `bold ${fontSizeCanvas}px Impact, sans-serif`; // IMPACT FONT!
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const textX = CANVAS_WIDTH / 2;
            const textY = CANVAS_HEIGHT - 350;
            const maxTextWidth = CANVAS_WIDTH * 0.85;
            
            const words = currentSub.text.replace(/\r?\n/g, ' ').split(' ');
            let line = '';
            const lines: string[] = [];
            for (let n = 0; n < words.length; n++) {
              const testLine = line + words[n] + ' ';
              if (ctx.measureText(testLine).width > maxTextWidth && n > 0) {
                lines.push(line.trim());
                line = words[n] + ' ';
              } else {
                line = testLine;
              }
            }
            lines.push(line.trim());

            const lineHeight = fontSizeCanvas * 1.25;
            const timeSinceStart = currentTime - currentSub.start;
            const animScale = Math.min(Math.max((timeSinceStart / 0.15), 0), 1);
            const popScale = 0.9 + (animScale * 0.1);

            ctx.translate(textX, textY);
            ctx.scale(popScale, popScale);

            // Draw Background Box if not transparent
            if (textSettings.bgColor !== 'transparent') {
              lines.forEach((l, index) => {
                const y = (index - (lines.length - 1) / 2) * lineHeight;
                const m = ctx.measureText(l);
                const paddingX = 20;
                const paddingY = 10;
                ctx.fillStyle = textSettings.bgColor;
                // No shadow for the background box to keep it crisp
                ctx.shadowColor = 'transparent';
                ctx.fillRect(
                  -m.width / 2 - paddingX,
                  y - fontSizeCanvas / 2 - paddingY,
                  m.width + paddingX * 2,
                  fontSizeCanvas + paddingY * 2
                );
              });
            }

            // Text Styles (Great Colors)
            // Yellow body with thick black stroke and drop shadow
            ctx.fillStyle = textSettings.textColor || '#ffde00';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 8;
            ctx.lineJoin = 'round';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 4;

            lines.forEach((l, index) => {
              const y = (index - (lines.length - 1) / 2) * lineHeight;
              
              ctx.strokeText(l, 0, y);
              
              // Reset shadow for fill to avoid double shadow
              ctx.shadowColor = 'transparent'; 
              ctx.fillText(l, 0, y);
              
              // Restore shadow for next line stroke
              ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            });

            ctx.restore();
          }

          // Create VideoFrame and Encode
          const frame = new VideoFrame(canvas, { timestamp: Math.floor((currentFrame / FPS) * 1_000_000) });
          // Ensure we encode keyframes periodically (every 30 frames)
          const keyFrame = (currentFrame % FPS === 0);
          videoEncoder.encode(frame, { keyFrame });
          frame.close();

          onProgress((currentFrame / totalFrames) * 100);

          currentFrame++;
          currentTime += frameInterval;
          video.currentTime = currentTime;
        };

        // Kickoff
        video.currentTime = currentTime;
      };

      const finishExport = async () => {
        // Encode Audio
        if (audioEncoder && audioBuffer) {
          const channels = audioBuffer.numberOfChannels;
          const sampleRate = audioBuffer.sampleRate;
          const startSample = Math.floor(segment.startTime * sampleRate);
          const endSample = Math.floor(segment.endTime * sampleRate);
          const chunkSize = sampleRate; // 1 sec chunks

          for (let i = startSample; i < endSample; i += chunkSize) {
            const chunkLength = Math.min(chunkSize, endSample - i);
            const planarData = new Float32Array(chunkLength * channels);

            for (let c = 0; c < channels; c++) {
              const channelData = audioBuffer.getChannelData(c);
              planarData.set(channelData.subarray(i, i + chunkLength), c * chunkLength);
            }

            const timestamp = Math.floor(((i - startSample) / sampleRate) * 1_000_000);
            const audioData = new AudioData({
              format: 'f32-planar',
              sampleRate,
              numberOfFrames: chunkLength,
              numberOfChannels: channels,
              timestamp,
              data: planarData,
            });

            audioEncoder.encode(audioData);
            audioData.close();
          }
          await audioEncoder.flush();
        }

        await videoEncoder.flush();
        muxer.finalize();
        const { buffer } = muxer.target;
        
        // Clean up context
        if (audioCtx) {
          audioCtx.close().catch(() => {});
        }

        resolve(new Blob([buffer], { type: 'video/mp4' }));
      };

      initVideo();

    } catch (err) {
      if (audioCtx) audioCtx.close().catch(() => {});
      reject(err);
    }
  });
}
