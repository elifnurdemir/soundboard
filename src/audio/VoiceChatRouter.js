/**
 * VoiceChatRouter — manages dual audio output (speakers + virtual cable)
 * and optional microphone passthrough for voice chat integration.
 *
 * Usage:
 *   voiceChatRouter.setVirtualDevice(deviceId)
 *   voiceChatRouter.setMicPassthrough(true/false)
 *   // called by the sound store on each playSound:
 *   voiceChatRouter.playOnVirtualDevice(url, volume, loop)
 */
class VoiceChatRouter {
  constructor() {
    this.virtualDeviceId = null;
    this.micPassthrough = false;
    this.micStream = null;
    this.micAudioEl = null;
    this.micAudioCtx = null;
  }

  /** Set the output device ID for the virtual cable. null = disabled. */
  setVirtualDevice(deviceId) {
    this.virtualDeviceId = deviceId || null;
  }

  /** Enable/disable mic passthrough to virtual cable */
  async setMicPassthrough(enabled) {
    if (enabled && !this.micPassthrough) {
      await this._startMicPassthrough();
    } else if (!enabled && this.micPassthrough) {
      this._stopMicPassthrough();
    }
  }

  async _startMicPassthrough() {
    if (!this.virtualDeviceId) return;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });

      this.micAudioCtx = new AudioContext({ sampleRate: 44100 });
      const src = this.micAudioCtx.createMediaStreamSource(this.micStream);
      const gain = this.micAudioCtx.createGain();
      gain.gain.value = 1;
      const dest = this.micAudioCtx.createMediaStreamDestination();
      src.connect(gain);
      gain.connect(dest);

      this.micAudioEl = new Audio();
      this.micAudioEl.srcObject = dest.stream;
      this.micAudioEl.muted = false;

      try {
        await this.micAudioEl.setSinkId(this.virtualDeviceId);
      } catch (e) {
        console.warn('setSinkId for mic passthrough failed:', e.message);
      }

      await this.micAudioEl.play();
      this.micPassthrough = true;
    } catch (err) {
      console.error('Mic passthrough error:', err);
      this._stopMicPassthrough();
      throw err;
    }
  }

  _stopMicPassthrough() {
    if (this.micAudioEl) {
      this.micAudioEl.pause();
      this.micAudioEl.srcObject = null;
      this.micAudioEl = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.micAudioCtx) {
      this.micAudioCtx.close().catch(() => {});
      this.micAudioCtx = null;
    }
    this.micPassthrough = false;
  }

  /**
   * Play a sound URL on the virtual cable device.
   * Returns the Audio element so it can be tracked.
   */
  async playOnVirtualDevice(url, volume, loop = false, playbackRate = 1) {
    if (!this.virtualDeviceId) return null;

    const audio = new Audio(url);
    audio.volume = Math.min(1, volume);
    audio.loop = loop;
    audio.playbackRate = playbackRate;
    audio.preservesPitch = false;

    try {
      await audio.setSinkId(this.virtualDeviceId);
    } catch (e) {
      console.warn('setSinkId failed:', e.message);
      return null;
    }

    audio.play().catch((e) => console.warn('VC play error:', e.message));
    return audio;
  }

  /** Whether a device label looks like a virtual audio cable (VB-CABLE, VoiceMeeter, ...) */
  static isVirtualCableLabel(label) {
    const l = (label || '').toLowerCase();
    return l.includes('cable') || l.includes('virtual') || l.includes('vb-audio') || l.includes('voicemeeter');
  }

  /** Enumerate all audio output devices */
  static async getOutputDevices() {
    try {
      // Request mic permission first so labels are populated
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (_) {
      // Ignore — labels may be empty
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ id: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 8)}` }));
  }
}

export const voiceChatRouter = new VoiceChatRouter();
export { VoiceChatRouter };
export default VoiceChatRouter;
