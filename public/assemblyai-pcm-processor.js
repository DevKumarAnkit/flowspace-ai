class AssemblyAIPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = options.processorOptions || {};
    this.inputSampleRate = settings.inputSampleRate || sampleRate;
    this.targetSampleRate = settings.targetSampleRate || 16000;
    this.chunkSamples = settings.chunkSamples || 800;
    this.ratio = this.inputSampleRate / this.targetSampleRate;
    this.pending = [];
    this.resampled = [];
    this.sourcePosition = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;
    for (let index = 0; index < input.length; index += 1) this.pending.push(input[index]);

    while (this.sourcePosition + 1 < this.pending.length) {
      const left = Math.floor(this.sourcePosition);
      const mix = this.sourcePosition - left;
      const sample = this.pending[left] * (1 - mix) + this.pending[left + 1] * mix;
      this.resampled.push(sample);
      this.sourcePosition += this.ratio;
    }

    const consumed = Math.floor(this.sourcePosition);
    if (consumed > 0) {
      this.pending.splice(0, consumed);
      this.sourcePosition -= consumed;
    }

    while (this.resampled.length >= this.chunkSamples) {
      const pcm = new Int16Array(this.chunkSamples);
      for (let index = 0; index < this.chunkSamples; index += 1) {
        const value = Math.max(-1, Math.min(1, this.resampled[index] || 0));
        pcm[index] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
      this.resampled.splice(0, this.chunkSamples);
    }
    return true;
  }
}

registerProcessor("assemblyai-pcm-processor", AssemblyAIPcmProcessor);
