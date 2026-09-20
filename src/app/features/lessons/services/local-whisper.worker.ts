/// <reference lib="webworker" />

const TRANSFORMERS_CDN_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
const MODEL_ID = 'onnx-community/whisper-base_timestamped';

type DeviceType = 'webgpu' | 'wasm';

type PipelineFunction = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{
  text?: string;
  chunks?: Array<{ text?: string; timestamp?: [number, number | null] }>;
}>;


interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>,
  ) => Promise<PipelineFunction>;
}

const pipelines = new Map<DeviceType, Promise<PipelineFunction>>();
let transformersModulePromise: Promise<TransformersModule> | null = null;

function post(status: string, data: Record<string, unknown> = {}): void {
  self.postMessage({ status, ...data });
}

async function loadTransformers(): Promise<TransformersModule> {
  if (!transformersModulePromise) {
    transformersModulePromise = import(
      /* @vite-ignore */ TRANSFORMERS_CDN_URL
    ) as Promise<TransformersModule>;
  }

  return transformersModulePromise;
}

async function getPipeline(device: DeviceType): Promise<PipelineFunction> {
  const existing = pipelines.get(device);
  if (existing) return existing;

  const pipelinePromise = (async () => {
    const { pipeline } = await loadTransformers();
    const config =
      device === 'webgpu'
        ? {
            device: 'webgpu',
            dtype: {
              encoder_model: 'fp32',
              decoder_model_merged: 'q4',
            },
          }
        : {
            device: 'wasm',
            dtype: 'q8',
          };

    return pipeline('automatic-speech-recognition', MODEL_ID, {
      ...config,
      progress_callback: (progress: Record<string, unknown>) => {
        post('model-progress', { progress });
      },
    });
  })();

  pipelines.set(device, pipelinePromise);
  return pipelinePromise;
}

async function transcribe(
  audio: Float32Array,
  requestedDevice: DeviceType,
): Promise<void> {
  let activeDevice = requestedDevice;

  try {
    post('model-loading', {
      message:
        requestedDevice === 'webgpu'
          ? 'Downloading/starting the local Whisper model with WebGPU...'
          : 'Downloading/starting the local Whisper model with WebAssembly...',
      device: requestedDevice,
    });

    let transcriber: PipelineFunction;

    try {
      transcriber = await getPipeline(requestedDevice);
    } catch (error) {
      if (requestedDevice !== 'webgpu') throw error;

      activeDevice = 'wasm';
      post('device-fallback', {
        message: 'WebGPU did not start, so the app switched to the compatible CPU mode.',
        device: activeDevice,
      });
      transcriber = await getPipeline('wasm');
    }

    post('transcribing', {
      message: 'Whisper is listening to the lesson and locating every spoken word...',
      device: activeDevice,
    });

    const startedAt = performance.now();
    const result = await transcriber(audio, {
      language: 'en',
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 29,
      stride_length_s: 5,
    });

    post('complete', {
      result,
      elapsedMs: performance.now() - startedAt,
      device: activeDevice,
    });
  } catch (error) {
    post('error', {
      message: error instanceof Error ? error.message : 'Local Whisper failed to run.',
    });
  }
}

self.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as {
    type?: string;
    audio?: Float32Array;
    device?: DeviceType;
  };

  if (data.type !== 'transcribe' || !data.audio) return;
  void transcribe(data.audio, data.device || 'wasm');
});
