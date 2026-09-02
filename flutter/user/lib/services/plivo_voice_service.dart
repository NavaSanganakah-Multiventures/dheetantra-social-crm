import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_sound/flutter_sound.dart';
import 'package:audio_session/audio_session.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'api_service.dart';

/// Plivo Audio Stream wrapper for the DheeTantra user app.
///
/// Bidirectional mu-law 8kHz stream (Plivo recommended: native telephony,
/// lowest latency, no transcoding, byte-order agnostic).
///   - Plivo <-> DO relay <-> App, sab kuch audio/x-mulaw;rate=8000.
///   - Recorder: PCM16@8000 -> mu-law bytes (encode) -> base64.
///   - Player:   base64 -> mu-law bytes -> PCM16@8000 (decode) -> sink.
///   - Recorder sirf 'stream_started' (ya pehle inbound media) ke baad start
///     hota hai, taaki Plivo stream ready hone se pehle mic waste na ho aur
///     acoustic echo kam ho. Connect pe {'type':'ready'} bhejte hain jisse
///     DO late-join par stored start dobara bhej de.
class PlivoVoiceService {
  static final PlivoVoiceService _instance = PlivoVoiceService._internal();
  factory PlivoVoiceService() => _instance;
  PlivoVoiceService._internal();

  static const int _sampleRate = 8000;

  final _callStateController = StreamController<String>.broadcast();
  Stream<String> get onCallState => _callStateController.stream;

  FlutterSoundRecorder? _recorder;
  FlutterSoundPlayer? _player;
  WebSocketChannel? _audioChannel;
  StreamController<Uint8List>? _micController;
  Timer? _heartbeatTimer;

  bool _recorderStarted = false;
  bool _playerStarted = false;
  bool _isMuted = false;
  bool _speakerOn = false;
  bool _isOnCall = false;
  bool _initStarted = false;

  String? _currentCallId;

  bool get isMuted => _isMuted;
  bool get isSpeakerOn => _isSpeakerOn;
  bool get isOnCall => _isOnCall;

  // ---------- G.711 mu-law <-> 16-bit linear PCM ----------
  static const int _bias = 0x84;
  static const int _clip = 32635;

  static int _linearToMulaw(int pcm) {
    int sign = (pcm >> 8) & 0x80;
    int magnitude = pcm < 0 ? -pcm : pcm;
    if (magnitude > _clip) magnitude = _clip;
    magnitude += _bias;
    int exponent = 7;
    int mask = 0x4000;
    while ((magnitude & mask) == 0 && exponent > 0) {
      exponent--;
      mask >>= 1;
    }
    int mantissa = (magnitude >> (exponent + 3)) & 0x0F;
    int mulaw = ~(sign | (exponent << 4) | mantissa);
    return mulaw & 0xFF;
  }

  static int _mulawToLinear(int u) {
    u = ~u & 0xFF;
    int t = ((u & 0x0F) << 3) + _bias;
    t <<= (u & 0x70) >> 4;
    return ((u & 0x80) == 0) ? (t - _bias) : (_bias - t);
  }

  /// PCM16 little-endian (signed) chunk -> mu-law bytes.
  static Uint8List _pcm16ToMulaw(Uint8List pcm) {
    final int frames = pcm.length ~/ 2;
    final out = Uint8List(frames);
    for (int i = 0; i < frames; i++) {
      int lo = pcm[2 * i] & 0xFF;
      int hi = pcm[2 * i + 1] & 0xFF;
      int s = (hi << 8) | lo;
      if ((s & 0x8000) != 0) s -= 0x10000; // sign-extend
      out[i] = _linearToMulaw(s);
    }
    return out;
  }

  /// mu-law bytes -> PCM16 little-endian bytes.
  static Uint8List _mulawToPcm16(Uint8List mulaw) {
    final out = Uint8List(mulaw.length * 2);
    for (int i = 0; i < mulaw.length; i++) {
      int lin = _mulawToLinear(mulaw[i] & 0xFF);
      out[2 * i] = lin & 0xFF;
      out[2 * i + 1] = (lin >> 8) & 0xFF;
    }
    return out;
  }

  /// App start/login ke baad ek baar call karein: sirf mic permission check.
  Future<void> init() async {
    if (_initStarted) return;
    _initStarted = true;
    try {
      await _ensureMicrophonePermissionGranted();
    } catch (e) {
      debugPrint('[PlivoVoice] mic permission error: $e');
    }
  }

  Future<bool> _ensureMicrophonePermissionGranted() async {
    final status = await Permission.microphone.status;
    if (status.isGranted) return true;
    final result = await Permission.microphone.request();
    return result.isGranted;
  }

  /// Legacy SIP endpoint switch (ab Audio Stream mein no-op).
  Future<void> switchAccountBackground(String configId) async {
    debugPrint('[PlivoVoice] switchAccountBackground noop for stream $configId');
  }

  /// Backend di hui streamUrl se WebSocket audio bridge connect karo.
  Future<bool> connectAudioStream({
    required String callId,
    required String streamUrl,
    String? sessionId,
  }) async {
    if (callId.isEmpty || streamUrl.isEmpty) {
      _callStateController.add('error: Missing stream URL');
      return false;
    }

    await _disconnect();

    if (!await _ensureMicrophonePermissionGranted()) {
      _callStateController.add('error: Microphone permission required');
      return false;
    }

    _currentCallId = callId;

    try {
      final sid = sessionId ?? await ApiService().fetchSessionToken();
      if (sid == null || sid.isEmpty) {
        _callStateController.add('error: Session not available');
        await _disconnect();
        return false;
      }
      final uri = Uri.parse(streamUrl).replace(queryParameters: {'sid': sid});
      _audioChannel = WebSocketChannel.connect(uri);
      _callStateController.add('connecting');

      _audioChannel!.stream.listen(
        (message) => _handleMessage(message, callId),
        onDone: () {
          if (_currentCallId == callId) {
            _callStateController.add('ended');
            _disconnect();
          }
        },
        onError: (e) {
          debugPrint('[PlivoVoice] audio stream error: $e');
          _callStateController.add('error: Audio stream error');
          _disconnect();
        },
      );

      _heartbeatTimer = Timer.periodic(const Duration(seconds: 25), (_) {
        try {
          _audioChannel?.sink.add(jsonEncode({'type': 'ping'}));
        } catch (e) {
          debugPrint('[PlivoVoice] heartbeat error: $e');
        }
      });

      // Player turant start (caller sun sake). Recorder 'stream_started' ke
      // baad start hoga. DO ko 'ready' bhej do taaki late-join par stored
      // start dobara mil jaaye.
      await _initPlayer();
      _sendReady();
      return true;
    } catch (e) {
      debugPrint('[PlivoVoice] connectAudioStream error: $e');
      _callStateController.add('error: $e');
      _disconnect();
      return false;
    }
  }

  void _sendReady() {
    try {
      _audioChannel?.sink.add(jsonEncode({'type': 'ready'}));
    } catch (e) {
      debugPrint('[PlivoVoice] ready send error: $e');
    }
  }

  Future<void> _initPlayer() async {
    if (_playerStarted) return;
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration(
      avAudioSessionCategory: AVAudioSessionCategory.playAndRecord,
      avAudioSessionCategoryOptions: AVAudioSessionCategoryOptions.allowBluetooth | AVAudioSessionCategoryOptions.defaultToSpeaker,
      avAudioSessionMode: AVAudioSessionMode.voiceChat,
      avAudioSessionRouteSharingPolicy: AVAudioSessionRouteSharingPolicy.defaultPolicy,
      avAudioSessionSetActiveOptions: AVAudioSessionSetActiveOptions.none,
      androidAudioAttributes: AndroidAudioAttributes(
        usage: AndroidAudioUsage.voiceCommunication,
        contentType: AndroidAudioContentType.speech,
        flags: AndroidAudioFlags.none,
      ),
      androidAudioFocus: AndroidAudioFocus.gain,
      androidWillPauseWhenDucked: true,
    ));

    _player = FlutterSoundPlayer();
    await _player!.openPlayer();
    await _player!.startPlayerFromStream(
      codec: Codec.pcm16,
      interleaved: true,
      numChannels: 1,
      sampleRate: _sampleRate,
      bufferSize: 8192,
    );
    _playerStarted = true;
  }

  Future<void> _startRecorder() async {
    if (_recorderStarted) return;
    _recorder = FlutterSoundRecorder();
    await _recorder!.openRecorder();
    _micController = StreamController<Uint8List>();
    await _recorder!.startRecorder(
      codec: Codec.pcm16,
      toStream: _micController!.sink,
      sampleRate: _sampleRate,
      numChannels: 1,
      bufferSize: 2048,
      enableEchoCancellation: true,
      enableNoiseSuppression: true,
    );
    _recorderStarted = true;

    _micController!.stream.listen((chunk) {
      if (_isMuted || chunk.isEmpty) return;
      try {
        final mulaw = _pcm16ToMulaw(chunk);
        final b64 = base64Encode(mulaw);
        _audioChannel?.sink.add(jsonEncode({'type': 'media', 'payload': b64}));
      } catch (e) {
        debugPrint('[PlivoVoice] mic send error: $e');
      }
    });
  }

  void _handleMessage(dynamic message, String callId) {
    try {
      final text = message is String ? message : utf8.decode(message);
      final data = jsonDecode(text);
      if (data is! Map<String, dynamic>) return;

      final type = data['type']?.toString();
      if (type == 'stream_started') {
        _isOnCall = true;
        _callStateController.add('connected');
        // Plivo stream ready -> ab mic chalu karo.
        _startRecorder();
      } else if (type == 'media') {
        final payload = data['payload']?.toString();
        if (payload == null || payload.isEmpty) return;
        // Safety: agar stream_started miss ho gaya ho, pehle media par bhi
        // recorder start kar lo.
        if (!_recorderStarted) _startRecorder();
        _playMedia(payload);
      } else if (type == 'stream_ended') {
        _callStateController.add('ended');
        _disconnect();
      } else if (type == 'dtmf') {
        // Local confirmation ke liye.
      } else if (type == 'pong') {
        // ignore
      }
    } catch (e) {
      debugPrint('[PlivoVoice] message handle error: $e');
    }
  }

  void _playMedia(String base64Payload) {
    if (_player == null || !_playerStarted) return;
    try {
      String normalized = base64Payload;
      while (normalized.length % 4 != 0) {
        normalized += '=';
      }
      final mulaw = base64Decode(normalized);
      if (mulaw.isEmpty) return;
      final pcm = _mulawToPcm16(mulaw);
      _player!.uint8ListSink?.add(pcm);
    } catch (e) {
      debugPrint('[PlivoVoice] play media error: $e');
    }
  }

  /// DTMF digits bridge par bhejo.
  Future<void> sendDtmf(String digits) async {
    if (digits.isEmpty) return;
    try {
      _audioChannel?.sink.add(jsonEncode({'type': 'dtmf', 'digits': digits}));
    } catch (e) {
      debugPrint('[PlivoVoice] dtmf send error: $e');
    }
  }

  /// Call end karo: bridge ko 'end' bhejo aur local audio band karo.
  Future<void> hangUp() async {
    try {
      _audioChannel?.sink.add(jsonEncode({'type': 'end'}));
    } catch (e) {
      debugPrint('[PlivoVoice] hangup send error: $e');
    }
    await _disconnect();
    _callStateController.add('ended');
  }

  /// hangUp ka alias.
  Future<void> endCall() async => hangUp();

  Future<void> toggleMute() async {
    _isMuted = !_isMuted;
    _callStateController.add(_isMuted ? 'muted' : 'unmuted');
  }

  Future<void> toggleSpeaker() async {
    _speakerOn = !_speakerOn;
    // Mobile speaker/earpiece routing OS level par hoti hai; UI state update karte hain.
    _callStateController.add(_speakerOn ? 'speaker_on' : 'speaker_off');
  }

  Future<void> _disconnect() async {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;

    if (_recorderStarted && _recorder != null) {
      try { await _recorder!.stopRecorder(); } catch (_) {}
      _recorderStarted = false;
    }
    if (_playerStarted && _player != null) {
      try { await _player!.stopPlayer(); } catch (_) {}
      _playerStarted = false;
    }

    await _micController?.close();
    _micController = null;

    try { await _recorder?.closeRecorder(); } catch (_) {}
    try { await _player?.closePlayer(); } catch (_) {}
    _recorder = null;
    _player = null;

    try { await _audioChannel?.sink.close(); } catch (_) {}
    _audioChannel = null;

    _currentCallId = null;
    _isOnCall = false;
    _isMuted = false;
    _speakerOn = false;
  }
}
