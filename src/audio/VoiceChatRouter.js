/**
 * VoiceChatRouter — manages dual audio output (speakers + virtual cable)
 * and optional microphone passthrough for voice chat integration.
 *
 * Usage:
 *   voiceChatRouter.setVirtualDevice(deviceId)
 *   voiceChatRouter.setMicPassthrough(true/false)
 *
 * Sound playback itself lives in AudioEngine, which feeds speakers and the
 * virtual cable from the same graph; the router only tells it which device to use.
 */
import { audioEngine } from './AudioEngine';
import { VoiceChanger } from './VoiceChanger';

class VoiceChatRouter {
  constructor() {
    this.virtualDeviceId = null;
    this.micPassthrough = false;
    this.micStream = null;
    this.micAudioEl = null;
    this.micAudioCtx = null;
    this.voiceChanger = null;
    this.voiceFx = { pitch: 0, robot: false, echo: 0, radio: false, cave: 0 };
  }

  /** Live voice-changer params: { pitch, robot, echo }. Applied to mic passthrough. */
  setVoiceFx(params) {
    this.voiceFx = { ...this.voiceFx, ...params };
    this.voiceChanger?.set(this.voiceFx);
  }

  /** Set the output device ID for the virtual cable. null = disabled. */
  setVirtualDevice(deviceId) {
    this.virtualDeviceId = deviceId || null;
    audioEngine.setCableDevice(this.virtualDeviceId);
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
      this.voiceChanger = new VoiceChanger(this.micAudioCtx);
      this.voiceChanger.set(this.voiceFx);
      src.connect(this.voiceChanger.input);
      this.voiceChanger.output.connect(gain);
      gain.connect(dest);

      this.micAudioEl = new Audio();
      this.micAudioEl.srcObject = dest.stream;
      this.micAudioEl.muted = false;

      // Cihaza yönlendirilemezse geçişi başlatma — aksi halde mikrofon varsayılan çıkışa (hoparlör)
      // düşer, kendi sesini gecikmeli duyarsın ve mikrofon onu tekrar yakalayıp yankı yapar.
      try {
        await this.micAudioEl.setSinkId(this.virtualDeviceId);
      } catch (e) {
        throw new Error(`Mikrofon sanal cihaza yönlendirilemedi: ${e.message}`);
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
    if (this.voiceChanger) {
      this.voiceChanger.destroy();
      this.voiceChanger = null;
    }
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

  /** Whether a device label looks like a virtual audio cable (VB-CABLE, VoiceMeeter, ...) */
  static isVirtualCableLabel(label) {
    const l = (label || '').toLowerCase();
    return l.includes('cable') || l.includes('virtual') || l.includes('vb-audio') || l.includes('voicemeeter') || l.includes('padoboard');
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
