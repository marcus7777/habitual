window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  core.AudioSync = {
    ggwaveModule: null,
    instance: null,
    audioCtx: null,
    initPromise: null,

    init: function() {
      if (this.initPromise) return this.initPromise;
      const self = this;

      this.initPromise = new Promise(async (resolve, reject) => {
        try {
          const getFactory = () => window.ggwave_factory || window.ggwave;

          if (!getFactory()) {
            await core.loadScript('lib/ggwave.js');
          }

          const factory = getFactory();
          if (factory) {
             // Initialize GGwave WebAssembly module
             self.ggwaveModule = await factory();

             // Initialize GGwave instance handle with sample format settings
             const params = self.ggwaveModule.getDefaultParameters();
             params.sampleFormatInp = self.ggwaveModule.SampleFormat.GGWAVE_SAMPLE_FORMAT_I8;
             params.sampleFormatOut = self.ggwaveModule.SampleFormat.GGWAVE_SAMPLE_FORMAT_I8;
             self.instance = self.ggwaveModule.init(params);

             resolve();
          } else {
             reject(new Error('Failed to load GGwave library.'));
          }
        } catch (e) {
          console.error('AudioSync init error:', e);
          self.initPromise = null;
          reject(e);
        }
      });

      return this.initPromise;
    },

    getAudioContext: function() {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioCtx({ sampleRate: 48000 });
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    },

    // --- PAIR CODE CHIRP (1-SECOND SOUND) ---
    emitCodeChirp: async function(code) {
      await this.init();
      const ctx = this.getAudioContext();

      const protocol = this.ggwaveModule.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST;
      const waveform = this.ggwaveModule.encode(this.instance, 'HAB:' + code, protocol, 10);
      if (!waveform || waveform.length === 0) throw new Error('Failed to encode audio chirp.');

      // Play waveform through WebAudio (Convert Int8 PCM to Float32 [-1.0, 1.0])
      const buf = ctx.createBuffer(1, waveform.length, 48000);
      const channel = buf.getChannelData(0);
      for (let i = 0; i < waveform.length; i++) {
        channel[i] = waveform[i] / 128.0;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();

      if (core.showToast) core.showToast('🔊 Emitting Sound Chirp...', 'info');
      return new Promise(resolve => src.onended = resolve);
    },

    listenForCodeChirp: async function(timeoutMs = 20000, onMicVolume = null, onCountdown = null) {
      await this.init();
      const ctx = this.getAudioContext();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaSrc = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(1024, 1, 1);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      mediaSrc.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      let meterInterval = null;
      if (onMicVolume) {
        meterInterval = setInterval(() => {
          analyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) sum += freqData[i];
          const avg = sum / freqData.length;
          const vol = Math.min(100, Math.round((avg / 128) * 100));
          onMicVolume(vol);
        }, 50);
      }

      // 3-Second Warmup & Countdown
      if (onCountdown) {
        for (let cd = 3; cd > 0; cd--) {
          onCountdown(cd);
          await new Promise(r => setTimeout(r, 1000));
        }
        onCountdown(0);
      }

      if (core.showToast) core.showToast('🎙️ Listening for Sound Chirp...', 'info');

      return new Promise((resolve, reject) => {
        let isDone = false;
        let timer = null;

        const resetTimer = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            cleanup();
            reject(new Error('Chirp listen timed out. Try playing sound again.'));
          }, timeoutMs);
        };
        resetTimer();

        function cleanup() {
          if (isDone) return;
          isDone = true;
          if (meterInterval) clearInterval(meterInterval);
          if (onMicVolume) onMicVolume(0);
          if (timer) clearTimeout(timer);
          processor.disconnect();
          analyser.disconnect();
          mediaSrc.disconnect();
          stream.getTracks().forEach(track => track.stop());
        }

        processor.onaudioprocess = (e) => {
          if (isDone) return;
          const inputData = e.inputBuffer.getChannelData(0);

          const pcm8 = new Int8Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm8[i] = Math.max(-128, Math.min(127, Math.floor(inputData[i] * 128)));
          }

          const decoded = this.ggwaveModule.decode(this.instance, pcm8);
          if (decoded && decoded.length > 0) {
            resetTimer(); // Reset timeout on hearing sound
            const str = String.fromCharCode.apply(null, decoded);
            if (str.startsWith('HAB:')) {
              const code = str.substring(4).trim();
              cleanup();
              if (core.showToast) core.showToast('✅ Chirp Received: Code ' + code, 'success');
              resolve(code);
            }
          }
        };

        mediaSrc.connect(processor);
        processor.connect(ctx.destination);
      });
    },

    // --- GZIP COMPRESSION HELPERS ---
    compressJSON: async function(jsonObj) {
      const jsonStr = JSON.stringify(jsonObj);
      const encoder = new TextEncoder();
      const rawBytes = encoder.encode(jsonStr);

      if (typeof CompressionStream !== 'undefined') {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(rawBytes);
        writer.close();
        const buffer = await new Response(cs.readable).arrayBuffer();
        return new Uint8Array(buffer);
      }
      return rawBytes;
    },

    decompressJSON: async function(uint8Arr) {
      if (typeof DecompressionStream !== 'undefined') {
        try {
          const ds = new DecompressionStream('gzip');
          const writer = ds.writable.getWriter();
          writer.write(uint8Arr);
          writer.close();
          const buffer = await new Response(ds.readable).arrayBuffer();
          const dec = new TextDecoder();
          return JSON.parse(dec.decode(buffer));
        } catch (e) {
          const dec = new TextDecoder();
          return JSON.parse(dec.decode(uint8Arr));
        }
      }
      const dec = new TextDecoder();
      return JSON.parse(dec.decode(uint8Arr));
    },

    // --- FULL & DELTA ACOUSTIC PAYLOAD SYNC ---
    emitAcousticPayload: async function(isDelta = false, onProgress = null) {
      await this.init();
      const ctx = this.getAudioContext();

      const payload = isDelta
        ? core.getDeltaPayloadFromState(7)
        : core.getPayloadFromState();

      const compressedBytes = await this.compressJSON(payload);

      // Convert Uint8Array to Base64 ASCII string so Emscripten never encounters non-ASCII chars
      let binaryStr = '';
      for (let j = 0; j < compressedBytes.length; j++) {
        binaryStr += String.fromCharCode(compressedBytes[j]);
      }
      const base64Data = btoa(binaryStr);

      const chunkSize = 20;
      const totalChunks = Math.ceil(base64Data.length / chunkSize);

      if (core.showToast) {
        core.showToast(`🔊 Broadcasting ${isDelta ? 'Delta' : 'Full'} Data (${compressedBytes.length} bytes over ${totalChunks} chirps)...`, 'info');
      }

      const protocol = this.ggwaveModule.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const chunkText = base64Data.substring(start, start + chunkSize);

        // Header format: "HD:chunkIdx:totalChunks:chunkText" (100% ASCII)
        const packetStr = `HD:${i}:${totalChunks}:${chunkText}`;

        const waveform = this.ggwaveModule.encode(this.instance, packetStr, protocol, 10);
        if (waveform && waveform.length > 0) {
          const buf = ctx.createBuffer(1, waveform.length, 48000);
          const channel = buf.getChannelData(0);
          for (let k = 0; k < waveform.length; k++) {
            channel[k] = waveform[k] / 128.0;
          }

          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start();

          await new Promise(resolve => src.onended = resolve);
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      if (core.showToast) core.showToast('✅ Sound Broadcast Complete!', 'success');
    },

    listenForAcousticPayload: async function(onProgress = null, onMicVolume = null, chunkTimeoutMs = 25000, onCountdown = null) {
      await this.init();
      const ctx = this.getAudioContext();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaSrc = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(1024, 1, 1);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      mediaSrc.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      let meterInterval = null;
      if (onMicVolume) {
        meterInterval = setInterval(() => {
          analyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) sum += freqData[i];
          const avg = sum / freqData.length;
          const vol = Math.min(100, Math.round((avg / 128) * 100));
          onMicVolume(vol);
        }, 50);
      }

      // 3-Second Warmup & Countdown
      if (onCountdown) {
        for (let cd = 3; cd > 0; cd--) {
          onCountdown(cd);
          await new Promise(r => setTimeout(r, 1000));
        }
        onCountdown(0);
      }

      if (core.showToast) core.showToast('🎙️ Listening for Sound Data Stream...', 'info');

      return new Promise((resolve, reject) => {
        let isDone = false;
        const chunksMap = new Map();
        let expectedTotal = 0;
        let timer = null;

        const resetTimer = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            cleanup();
            reject(new Error('Sound reception timed out (no audio packet heard for 25s).'));
          }, chunkTimeoutMs);
        };
        resetTimer();

        function cleanup() {
          if (isDone) return;
          isDone = true;
          if (meterInterval) clearInterval(meterInterval);
          if (onMicVolume) onMicVolume(0);
          if (timer) clearTimeout(timer);
          processor.disconnect();
          analyser.disconnect();
          mediaSrc.disconnect();
          stream.getTracks().forEach(track => track.stop());
        }

        processor.onaudioprocess = async (e) => {
          if (isDone) return;
          const inputData = e.inputBuffer.getChannelData(0);

          const pcm8 = new Int8Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm8[i] = Math.max(-128, Math.min(127, Math.floor(inputData[i] * 128)));
          }

          const decoded = this.ggwaveModule.decode(this.instance, pcm8);
          if (decoded && decoded.length > 0) {
            const decodedStr = String.fromCharCode.apply(null, decoded);
            if (decodedStr.startsWith('HD:')) {
              const parts = decodedStr.split(':');
              if (parts.length >= 4) {
                const chunkIdx = parseInt(parts[1], 10);
                const totalChunks = parseInt(parts[2], 10);
                const chunkText = parts.slice(3).join(':');
                expectedTotal = totalChunks;

                if (!chunksMap.has(chunkIdx)) {
                  resetTimer(); // Reset the 25-second timeout on every newly received chunk!
                  chunksMap.set(chunkIdx, chunkText);

                  if (onProgress) onProgress(Math.round((chunksMap.size / expectedTotal) * 100));

                  if (chunksMap.size === expectedTotal) {
                    cleanup();

                    let fullBase64 = '';
                    for (let i = 0; i < expectedTotal; i++) {
                      fullBase64 += chunksMap.get(i) || '';
                    }

                    try {
                      const binaryStr = atob(fullBase64);
                      const fullBytes = new Uint8Array(binaryStr.length);
                      for (let k = 0; k < binaryStr.length; k++) {
                        fullBytes[k] = binaryStr.charCodeAt(k);
                      }

                      const receivedPayload = await this.decompressJSON(fullBytes);

                      const localPayload = core.getPayloadFromState();
                      const merged = core.mergeStatePayloads(localPayload, receivedPayload);
                      core.applyPayloadToState(merged);
                      core.saveState();
                      if (core.renderAll) core.renderAll();

                      if (core.showToast) core.showToast('🎉 Acoustic Data Received & Synced!', 'success');
                      resolve(merged);
                    } catch (err) {
                      console.error('Failed to parse received sound payload:', err);
                      reject(new Error('Failed to decompress received sound payload.'));
                    }
                  }
                }
              }
            }
          }
        };

        mediaSrc.connect(processor);
        processor.connect(ctx.destination);
      });
    }
  };

})(window.HabitualCore);
