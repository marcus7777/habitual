window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa !== 'undefined') {
      return btoa(binary);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    throw new Error('No Base64 encoder available');
  }

  function base64ToArrayBuffer(base64) {
    if (typeof atob !== 'undefined') {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(base64, 'base64');
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
    throw new Error('No Base64 decoder available');
  }

  const CryptoKeys = {
    arrayBufferToBase64: arrayBufferToBase64,
    base64ToArrayBuffer: base64ToArrayBuffer,

    _cachedKeyPair: null,

    generateKeyPair: function() {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return Promise.reject(new Error('Web Crypto API (crypto.subtle) is not supported in this environment.'));
      }
      return crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        true,
        ['sign', 'verify']
      );
    },

    exportPublicKey: function(publicKey) {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return Promise.reject(new Error('Web Crypto API is required'));
      }
      return crypto.subtle.exportKey('spki', publicKey).then(function(spkiBuffer) {
        return arrayBufferToBase64(spkiBuffer);
      });
    },

    importPublicKey: function(spkiBase64) {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return Promise.reject(new Error('Web Crypto API is required'));
      }
      try {
        const buffer = base64ToArrayBuffer(spkiBase64);
        return crypto.subtle.importKey(
          'spki',
          buffer,
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          true,
          ['verify']
        );
      } catch (e) {
        return Promise.reject(e);
      }
    },

    exportPrivateKey: function(privateKey) {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return Promise.reject(new Error('Web Crypto API is required'));
      }
      return crypto.subtle.exportKey('jwk', privateKey).then(function(jwk) {
        return JSON.stringify(jwk);
      });
    },

    importPrivateKey: function(jwkString) {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return Promise.reject(new Error('Web Crypto API is required'));
      }
      try {
        const jwk = typeof jwkString === 'string' ? JSON.parse(jwkString) : jwkString;
        return crypto.subtle.importKey(
          'jwk',
          jwk,
          {
            name: 'ECDSA',
            namedCurve: 'P-256'
          },
          true,
          ['sign']
        );
      } catch (e) {
        return Promise.reject(e);
      }
    },

    getOrCreateUserKeyPair: function() {
      const self = this;
      if (self._cachedKeyPair) {
        return Promise.resolve(self._cachedKeyPair);
      }

      let stored = null;
      if (typeof localStorage !== 'undefined') {
        try {
          const item = localStorage.getItem('habitual_ec_keypair');
          if (item) stored = JSON.parse(item);
        } catch (e) {
          console.warn('Error reading stored keypair:', e);
        }
      }

      if (stored && stored.privateKeyJwk && stored.publicKeySpki) {
        return Promise.all([
          self.importPrivateKey(stored.privateKeyJwk),
          self.importPublicKey(stored.publicKeySpki)
        ]).then(function(keys) {
          const result = {
            privateKey: keys[0],
            publicKey: keys[1],
            publicKeyBase64: stored.publicKeySpki
          };
          self._cachedKeyPair = result;
          return result;
        }).catch(function(err) {
          console.warn('Failed importing stored keypair, generating new keypair:', err);
          return self._createNewUserKeyPair();
        });
      }

      return self._createNewUserKeyPair();
    },

    _createNewUserKeyPair: function() {
      const self = this;
      let generatedKeys = null;
      let pubSpki = '';
      let privJwk = '';

      return self.generateKeyPair().then(function(keyPair) {
        generatedKeys = keyPair;
        return self.exportPublicKey(keyPair.publicKey);
      }).then(function(spkiBase64) {
        pubSpki = spkiBase64;
        return self.exportPrivateKey(generatedKeys.privateKey);
      }).then(function(jwkString) {
        privJwk = jwkString;
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('habitual_ec_keypair', JSON.stringify({
              privateKeyJwk: privJwk,
              publicKeySpki: pubSpki
            }));
          } catch (e) {
            console.warn('Unable to store keypair in localStorage:', e);
          }
        }
        const result = {
          privateKey: generatedKeys.privateKey,
          publicKey: generatedKeys.publicKey,
          publicKeyBase64: pubSpki
        };
        self._cachedKeyPair = result;
        return result;
      });
    },

    signPayload: function(privateKey, payload) {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        return Promise.reject(new Error('Web Crypto API is required'));
      }
      const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const enc = new TextEncoder();
      const buffer = enc.encode(dataStr);

      return crypto.subtle.sign(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' }
        },
        privateKey,
        buffer
      ).then(function(signatureBuffer) {
        return arrayBufferToBase64(signatureBuffer);
      });
    },

    verifySignature: function(publicKeyBase64, signatureBase64, payload) {
      if (!publicKeyBase64 || !signatureBase64) {
        return Promise.resolve(false);
      }
      const self = this;
      const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const enc = new TextEncoder();
      const payloadBuffer = enc.encode(dataStr);

      return self.importPublicKey(publicKeyBase64).then(function(pubKey) {
        const sigBuffer = base64ToArrayBuffer(signatureBase64);
        return crypto.subtle.verify(
          {
            name: 'ECDSA',
            hash: { name: 'SHA-256' }
          },
          pubKey,
          sigBuffer,
          payloadBuffer
        );
      }).catch(function(err) {
        console.warn('Signature verification failed with error:', err);
        return false;
      });
    }
  };

  core.CryptoKeys = CryptoKeys;

})(window.HabitualCore);
