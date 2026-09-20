import { Injectable } from '@angular/core';
import {
  alignScriptLinesToWords,
  ScriptAlignmentOptions,
  ScriptLineAlignment,
  WhisperWordTimestamp,
} from './script-alignment.util';

export type LocalAiProgressStage =
  | 'decoding'
  | 'model-loading'
  | 'transcribing'
  | 'aligning'
  | 'complete';

export interface LocalAiProgress {
  stage: LocalAiProgressStage;
  message: string;
  percent: number | null;
  device?: 'webgpu' | 'wasm';
}

export interface LocalAiAlignmentResult {
  lines: ScriptLineAlignment[];
  transcript: string;
  device: 'webgpu' | 'wasm';
  elapsedMs: number;
}

interface WorkerResult {
  text?: string;
  chunks?: Array<{ text?: string; timestamp?: [number, number | null] }>;
}

interface WorkerMessage {
  status?: string;
  message?: string;
  device?: 'webgpu' | 'wasm';
  elapsedMs?: number;
  result?: WorkerResult;
  progress?: {
    progress?: number;
    loaded?: number;
    total?: number;
    file?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class LocalWhisperAlignmentService {
  private worker: Worker | null = null;
  private activeReject: ((reason?: unknown) => void) | null = null;

  async align(
    media: Blob,
    scriptLines: string[],
    mediaDuration: number,
    onProgress: (progress: LocalAiProgress) => void,
    alignmentOptions: ScriptAlignmentOptions = {},
  ): Promise<LocalAiAlignmentResult> {
    if (scriptLines.length === 0) {
      throw new Error('Upload the script before starting automatic splitting.');
    }

    onProgress({
      stage: 'decoding',
      message: 'Extracting and preparing the audio on the teacher laptop...',
      percent: null,
    });

    const audio = await this.decodeMediaToMono16Khz(media);
    const device = await this.detectBestDevice();
    const worker = this.getWorker();

    return new Promise<LocalAiAlignmentResult>((resolve, reject) => {
      this.activeReject = reject;

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;

        switch (message.status) {
          case 'model-loading':
          case 'device-fallback':
            onProgress({
              stage: 'model-loading',
              message: message.message || 'Loading the local Whisper model...',
              percent: null,
              device: message.device,
            });
            return;

          case 'model-progress': {
            const percent = this.readProgressPercent(message.progress);
            onProgress({
              stage: 'model-loading',
              message: this.modelProgressMessage(message.progress, percent),
              percent,
              device,
            });
            return;
          }

          case 'transcribing':
            onProgress({
              stage: 'transcribing',
              message: message.message || 'Whisper is transcribing the lesson...',
              percent: null,
              device: message.device,
            });
            return;

          case 'complete': {
            try {
              onProgress({
                stage: 'aligning',
                message: 'Matching every script line with its first and last spoken word...',
                percent: null,
                device: message.device,
              });

              const words = this.toWordTimestamps(message.result?.chunks || []);
              const lines = alignScriptLinesToWords(
                scriptLines,
                words,
                mediaDuration,
                alignmentOptions,
              );
              const result: LocalAiAlignmentResult = {
                lines,
                transcript: message.result?.text?.trim() || '',
                device: message.device || device,
                elapsedMs: Math.max(Number(message.elapsedMs) || 0, 0),
              };

              onProgress({
                stage: 'complete',
                message: 'Automatic splitting finished. Review the orange lines before saving.',
                percent: 100,
                device: result.device,
              });
              this.activeReject = null;
              resolve(result);
            } catch (error) {
              this.activeReject = null;
              reject(error);
            }
            return;
          }

          case 'error':
            this.activeReject = null;
            reject(new Error(message.message || 'Local Whisper failed to run.'));
            return;
        }
      };

      worker.onerror = (event) => {
        this.activeReject = null;
        reject(new Error(event.message || 'The local AI worker stopped unexpectedly.'));
      };

      worker.postMessage(
        {
          type: 'transcribe',
          audio,
          device,
        },
        [audio.buffer],
      );
    });
  }

  cancel(): void {
    if (this.activeReject) {
      this.activeReject(new Error('Automatic splitting was cancelled.'));
      this.activeReject = null;
    }

    this.worker?.terminate();
    this.worker = null;
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./local-whisper.worker', import.meta.url), {
        type: 'module',
      });
    }

    return this.worker;
  }

  private async decodeMediaToMono16Khz(media: Blob): Promise<Float32Array> {
    const decodingContext = new AudioContext();

    try {
      const sourceBuffer = await decodingContext.decodeAudioData(
        (await media.arrayBuffer()).slice(0),
      );
      const targetLength = Math.max(1, Math.ceil(sourceBuffer.duration * 16_000));
      const offlineContext = new OfflineAudioContext(1, targetLength, 16_000);
      const source = offlineContext.createBufferSource();
      source.buffer = sourceBuffer;
      source.connect(offlineContext.destination);
      source.start(0);

      const rendered = await offlineContext.startRendering();
      return new Float32Array(rendered.getChannelData(0));
    } catch (error) {
      console.error('[Local Whisper] Media decoding failed.', error);
      throw new Error(
        'The browser could not extract audio from this file. Try Chrome with MP4/AAC, MP3, WAV or M4A.',
      );
    } finally {
      await decodingContext.close().catch(() => undefined);
    }
  }

  private async detectBestDevice(): Promise<'webgpu' | 'wasm'> {
    const gpu = (navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<unknown | null> };
    }).gpu;

    if (!gpu) return 'wasm';

    try {
      return (await gpu.requestAdapter()) ? 'webgpu' : 'wasm';
    } catch {
      return 'wasm';
    }
  }

  private toWordTimestamps(
    chunks: Array<{ text?: string; timestamp?: [number, number | null] }>,
  ): WhisperWordTimestamp[] {
    return chunks
      .map<WhisperWordTimestamp | null>((chunk) => {
        const start = Number(chunk.timestamp?.[0]);
        const rawEnd = chunk.timestamp?.[1];
        const end = rawEnd === null || rawEnd === undefined ? start + 0.2 : Number(rawEnd);
        const text = chunk.text?.trim() || '';

        if (!text || !Number.isFinite(start) || !Number.isFinite(end)) return null;
        return { text, start, end };
      })
      .filter((word): word is WhisperWordTimestamp => !!word);
  }

  private readProgressPercent(progress?: WorkerMessage['progress']): number | null {
    if (!progress) return null;

    if (Number.isFinite(progress.progress)) {
      return Math.max(0, Math.min(100, Math.round(Number(progress.progress))));
    }

    if (
      Number.isFinite(progress.loaded) &&
      Number.isFinite(progress.total) &&
      Number(progress.total) > 0
    ) {
      return Math.max(
        0,
        Math.min(100, Math.round((Number(progress.loaded) / Number(progress.total)) * 100)),
      );
    }

    return null;
  }

  private modelProgressMessage(
    progress: WorkerMessage['progress'],
    percent: number | null,
  ): string {
    const file = progress?.file ? ` (${progress.file.split('/').pop()})` : '';
    return percent === null
      ? `Downloading the local Whisper model${file}...`
      : `Downloading the local Whisper model${file}: ${percent}%`;
  }
}
