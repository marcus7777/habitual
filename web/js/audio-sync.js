window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  core.AudioSync = {
    ggwave: null,
    ggwaveFactory: null,
    audioCtx: null,
    initPromise: null,

    init: function() {
      if (this.initPromise) return this.initPromise;
      const self = this;

      this.initPromise = new Promise(async (resolve, reject) => {
        try {
          if (!window.ggwave) {
            await core.loadScript('lib/ggwave.js');
          }
          if (window.ggwave) {
             self.ggwaveFactory = window.ggwave;
             // Initialize GGwave WebAssembly module
             self.ggwave = await window.ggwave();
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

      // Protocol: 1 = Fast, 0 = Normal, 2 = Fastest
      // ggwave.encode(instance, payload, protocol, volume)
      const waveform = this.ggwave.encode(this.ggwave, 'HAB:' + code, 1, 10);
      if (!waveform) throw new Error('Failed to encode audio chirp.');

      // Play waveform through WebAudio
      const buf = ctx.createBuffer(1, waveform.length, ctx.sampleRate);
      buf.getChannelData(0).set(waveform);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();

      if (core.showToast) core.showToast('🔊 Emitting Sound Chirp...', 'info');
      return new Promise(resolve => src.onended = resolve);
    },

    listenForCodeChirp: async function(timeoutMs = 15000) {
      await this.init();
      const ctx = this.getAudioContext();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser.');
      }

      if (core.showToast) core.showToast('🎙️ Listening for Sound Chirp...', 'info');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaSrc = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(1024, 1, 1);

      return new Promise((resolve, reject) => {
        let isDone = false;
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Chirp listen timed out. Try playing sound again.'));
        }, timeoutMs);

        function cleanup() {
          if (isDone) return;
          isDone = true;
          clearTimeout(timer);
          processor.disconnect();
          mediaSrc.disconnect();
          stream.getTracks().forEach(track => track.stop());
        }

        processor.onaudioprocess = (e) => {
          if (isDone) return;
          const inputData = e.inputBuffer.getChannelData(0);

          // ggwave.decode(instance, pPCM8) or pass Float32 array
          const decoded = this.ggwave.decode(this.ggwave, inputData);
          if (decoded && decoded.length > 0) {
            // Decoded is Int8Array or Uint8Array of characters
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
      return rawBytes; // Fallback to raw uncompressed
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
          // Fallback parsing as raw uncompressed
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

      // Chunk compressed bytes into small 20-byte packets
      const chunkSize = 18;
      const totalChunks = Math.ceil(compressedBytes.length / chunkSize);

      if (core.showToast) {
        core.showToast(`🔊 Broadcasting ${isDelta ? 'Delta' : 'Full'} Data (${compressedBytes.length} bytes over ${totalChunks} chirps)...`, 'info');
      }

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const chunk = compressedBytes.slice(start, start + chunkSize);

        // Packet Header: [ 'H', 'D', chunkIndex, totalChunks, ...chunkData ]
        const packet = new Uint8Array(4 + chunk.length);
        packet[0] = 72; // 'H'
        packet[1] = 68; // 'D'
        packet[2] = i;  // Chunk Index
        packet[3] = totalChunks;
        packet.set(chunk, 4);

        // Encode and play
        const waveform = this.ggwave.encode(this.ggwave, packet, 1, 10);
        if (waveform) {
          const buf = ctx.createBuffer(1, waveform.length, ctx.sampleRate);
          buf.getChannelData(0).set(waveform);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start();

          await new Promise(resolve => src.onended = resolve);
          // Brief pause between chirps
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      if (core.showToast) core.showToast('✅ Sound Broadcast Complete!', 'success');
    },

    listenForAcousticPayload: async function(onProgress = null, timeoutMs = 45000) {
      await this.init();
      const ctx = this.getAudioContext();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser.');
      }

      if (core.showToast) core.showToast('🎙️ Listening for Sound Data Stream...', 'info');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaSrc = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(1024, 1, 1);

      return new Promise((resolve, reject) => {
        let isDone = false;
        const chunksMap = new Map();
        let expectedTotal = 0;

        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Sound reception timed out.'));
        }, timeoutMs);

        function cleanup() {
          if (isDone) return;
          isDone = true;
          clearTimeout(timer);
          processor.disconnect();
          mediaSrc.disconnect();
          stream.getTracks().forEach(track => track.stop());
        }

        processor.onaudioprocess = async (e) => {
          if (isDone) return;
          const inputData = e.inputBuffer.getChannelData(0);

          const decoded = this.ggwave.decode(this.ggwave, inputData);
          if (decoded && decoded.length >= 4) {
            // Check Header ('H', 'D')
            if (decoded[0] === 72 && decoded[1] === 68) {
              const chunkIdx = decoded[2];
              const totalChunks = decoded[3];
              expectedTotal = totalChunks;

              if (!chunksMap.has(chunkIdx)) {
                const chunkData = decoded.slice(4);
                chunksMap.set(chunkIdx, chunkData);

                if (onProgress) onProgress(Math.round((chunksMap.size / expectedTotal) * 100));

                if (chunksMap.size === expectedTotal) {
                  cleanup();
                  // Reassemble Uint8Array
                  let totalLen = 0;
                  for (let i = 0; i < expectedTotal; i++) {
                    totalLen += (chunksMap.get(i) || new Uint8Array()).length;
                  }
                  const fullBytes = new Uint8Array(totalLen);
                  let offset = 0;
                  for (let i = 0; i < expectedTotal; i++) {
                    const c = chunksMap.get(i) || new Uint8Array();
                    fullBytes.set(c, offset);
                    offset += c.length;
                  }

                  try {
                    const receivedPayload = await this.decompressJSON(fullBytes);

                    // Merge payload into current state
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
        };

        mediaSrc.connect(processor);
        processor.connect(ctx.destination);
      });
    }
  };

})(window.HabitualCore);
