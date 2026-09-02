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
/// Ab koi conference/PSTN forwarding nahi hai. Inbound/Outbound Plivo calls
/// ka media seedha backend ke WebSocket bridge par jaata hai. SIP endpoint
/// aur softphone register karne ki zaroorat nahi. Instant logout/login
/// concept legacy tarah banaaye rakhte hain lekin SIP account switch ab
/// Audio Stream ke saath kaam nahi karta.
class PlivoVoiceService {
  static final PlivoVoiceService _instance = PlivoVoiceService._internal();
  factory PlivoVoiceService() => _instance;
  PlivoVoiceService._internal();

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
  bool get isSpeakerOn => _speakerOn;
  bool get isOnCall => _isOnCall;

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
  /// CallKit trigger ko intact rakhta hai, lekin media bridge change nahi hota.
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

      await _initAudioDevices();
      return true;
    } catch (e) {
      debugPrint('[PlivoVoice] connectAudioStream error: $e');
      _callStateController.add('error: $e');
      _disconnect();
      return false;
    }
  }

  Future<void> _initAudioDevices() async {
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
      sampleRate: 16000,
      bufferSize: 8192,
    );
    _playerStarted = true;

    _recorder = FlutterSoundRecorder();
    await _recorder!.openRecorder();
    _micController = StreamController<Uint8List>();
    await _recorder!.startRecorder(
      codec: Codec.pcm16,
      toStream: _micController!.sink,
      sampleRate: 16000,
      numChannels: 1,
      bufferSize: 4096,
      enableEchoCancellation: true,
      enableNoiseSuppression: true,
    );
    _recorderStarted = true;

    _micController!.stream.listen((chunk) {
      if (_isMuted || chunk.isEmpty) return;
      try {
        final b64 = base64Encode(chunk);
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
      } else if (type == 'media') {
        final payload = data['payload']?.toString();
        if (payload == null || payload.isEmpty) return;
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
      final bytes = base64Decode(normalized);
      if (bytes.isEmpty) return;

      _player!.uint8ListSink?.add(bytes);
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
