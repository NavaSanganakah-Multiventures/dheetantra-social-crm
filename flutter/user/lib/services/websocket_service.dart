import 'dart:async';
import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api_service.dart';

/// Realtime connection to the workspace Durable Object.
///
/// - Auto-connects once a workspace is available (login/splash).
/// - Exponential backoff reconnect (2s -> 30s) on drop/error.
/// - Keepalive ping every 25s; the server answers with a pong, which both
///   confirms the handshake and feeds a liveness watchdog that recycles dead
///   half-open sockets (network switches, zombie connections).
/// - App-lifecycle aware: keepalive pauses in background (battery), and on
///   resume the connection is torn down + re-established immediately instead
///   of waiting on a backed-off timer.
/// - Exposes typed streams for every event the backend broadcasts.
class WebSocketService with WidgetsBindingObserver {
  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal() {
    try {
      WidgetsBinding.instance.addObserver(this);
    } catch (_) {
      // No binding (unit tests) — lifecycle handling simply disabled.
    }
  }

  static const _keepaliveInterval = Duration(seconds: 25);
  static const _watchdogInterval = Duration(seconds: 5);
  /// If the server hasn't sent anything (pong or real event) this long after
  /// connecting, the handshake is assumed failed and the socket is recycled.
  static const _confirmTimeout = Duration(seconds: 12);
  /// No inbound traffic (including pongs) for this long = dead network path.
  static const _staleTimeout = Duration(seconds: 75);
  /// Backgrounded longer than this → force a fresh connection on resume.
  static const _resumeThreshold = Duration(seconds: 10);

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _keepaliveTimer;
  Timer? _reconnectTimer;
  Timer? _watchdogTimer;
  bool _connecting = false;
  int _retryAttempt = 0;
  bool _manuallyDisconnected = false;
  // Becomes true only after the handshake is confirmed by a real message
  // (the server answers pings with a pong, so this happens fast).
  bool _connectionConfirmed = false;
  DateTime _connectedAt = DateTime.now();
  DateTime _lastMessageAt = DateTime.now();
  DateTime _pausedAt = DateTime.now();

  final _connectionController = StreamController<bool>.broadcast();
  /// Emits `true` when connected, `false` when disconnected.
  Stream<bool> get onConnectionChanged => _connectionController.stream;
  bool get isConnected => _channel != null && _sub != null && !_manuallyDisconnected;

  final _incomingCallController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onIncomingCall => _incomingCallController.stream;

  final _callStatusController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onCallStatusUpdated => _callStatusController.stream;

  final _newMessageController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onNewMessage => _newMessageController.stream;

  final _messageStatusController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onMessageStatusUpdated => _messageStatusController.stream;

  final _conversationStatusController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onConversationStatusUpdated => _conversationStatusController.stream;

  final _conversationDeletedController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onConversationDeleted => _conversationDeletedController.stream;

  /// Sends a raw JSON event through the socket (relayed by the server to
  /// other clients in the same room). No-op when disconnected.
  void send(Map<String, dynamic> data) {
    final ch = _channel;
    if (ch == null) return;
    try {
      ch.sink.add(jsonEncode(data));
    } catch (e) {
      debugPrint('WS send error: $e');
    }
  }

  /// Connects to the workspace realtime channel. Safe to call multiple times.
  void connect() {
    if (_connecting || isConnected) return;
    _manuallyDisconnected = false;
    _connect();
  }

  Future<void> _connect() async {
    // If no workspace yet, wait and retry (login may still be in progress).
    final workspaceId = ApiService().workspaceId;
    if (workspaceId == null) {
      _retryAttempt = 0;
      _reconnectTimer?.cancel();
      _reconnectTimer = Timer(const Duration(seconds: 2), () {
        _connecting = false;
        connect();
      });
      return;
    }

    _connecting = true;
    final url = 'wss://dheetantra.navasanganakah.com/api/chat/connect/global-$workspaceId';
    try {
      final channel = WebSocketChannel.connect(Uri.parse(url));
      _channel = channel;
      _sub = channel.stream.listen(
        _onMessage,
        onDone: _onDisconnected,
        onError: (error) {
          debugPrint('WS Error: $error');
          _onDisconnected();
        },
        cancelOnError: false,
      );
      // Optimistic "connected": the server's pong (answering the ping below)
      // confirms the handshake, and the watchdog recycles the socket if no
      // confirmation arrives within _confirmTimeout. A failed handshake still
      // flips the flag via onDone/onError.
      _connectionController.add(true);
      _connectedAt = DateTime.now();
      _lastMessageAt = DateTime.now();
      // Ping immediately so the server's pong confirms the handshake without
      // waiting for the first 25s keepalive tick.
      send({'event': 'ping'});
      _startKeepalive();
      _startWatchdog();
    } catch (e) {
      debugPrint('WS Connection Error: $e');
      _connecting = false;
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic message) {
    // Any inbound traffic (pong or real event) proves the socket is alive.
    _lastMessageAt = DateTime.now();
    try {
      // A real inbound message confirms the handshake completed — only now
      // does the backoff counter reset (resetting on listen() would make a
      // downed server retry every 2s forever).
      if (!_connectionConfirmed) {
        _connectionConfirmed = true;
        _retryAttempt = 0;
      }
      final msgString = message is String ? message : utf8.decode(message);
      final data = jsonDecode(msgString);
      if (data is! Map<String, dynamic>) return;
      final type = data['type'];

      switch (type) {
        case 'pong':
        case 'pong_ack':
          break;
        case 'incoming_call':
          final call = data['call'];
          if (call != null) _incomingCallController.add(call);
          break;
        // Webhook broadcasts raw WhatsApp call events; normalize them so the
        // overlay can answer/reject using the same callData shape.
        case 'whatsapp_incoming_call':
          final direction = data['direction'] ?? 'incoming';
          if (direction == 'outgoing' || direction == 'BUSINESS_INITIATED') break;
          _incomingCallController.add({
            'id': data['callId'],
            'contact_name': data['contactName'] ?? data['from'] ?? 'अज्ञात',
            'phone': data['from'] ?? '',
            'sdp': data['sdp'],
            'sdpType': data['sdpType'],
            'phoneNumberId': data['phoneNumberId'],
            'direction': 'incoming',
            'type': 'voice',
            'status': 'ringing',
          });
          break;
        case 'whatsapp_call_terminated':
          _callStatusController.add({
            'call_id': data['callId'],
            'status': 'ended',
            'duration': data['duration'] ?? 0,
          });
          break;
        case 'call_status_updated':
          _callStatusController.add(data);
          break;
        case 'new_message':
          _newMessageController.add(data);
          break;
        case 'message_status_updated':
          _messageStatusController.add(data);
          break;
        case 'conversation_status_updated':
          _conversationStatusController.add(data);
          break;
        case 'conversation_deleted':
          _conversationDeletedController.add(data);
          break;
        default:
          // Unknown event — ignore silently.
          break;
      }
    } catch (e) {
      debugPrint('WS Message Error: $e');
    }
  }

  void _onDisconnected() {
    _watchdogTimer?.cancel();
    _stopKeepalive();
    _sub?.cancel();
    _sub = null;
    _channel = null;
    _connecting = false;
    _connectionConfirmed = false;
    _connectionController.add(false);
    _scheduleReconnect();
  }

  /// Tears down the socket WITHOUT scheduling a reconnect (used by the
  /// watchdog and the app-resume path, which then reconnect explicitly).
  void _teardown() {
    _watchdogTimer?.cancel();
    _stopKeepalive();
    _sub?.cancel();
    _sub = null;
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
    _connecting = false;
    _connectionConfirmed = false;
    _connectionController.add(false);
  }

  void _scheduleReconnect() {
    if (_manuallyDisconnected) return;
    _reconnectTimer?.cancel();
    // Exponential backoff capped at 30 seconds.
    final delay = Duration(seconds: [2, 4, 8, 16, 30][_retryAttempt.clamp(0, 4)]);
    _retryAttempt++;
    _reconnectTimer = Timer(delay, () {
      _connecting = false;
      connect();
    });
  }

  void _startKeepalive() {
    _keepaliveTimer?.cancel();
    _keepaliveTimer = Timer.periodic(_keepaliveInterval, (_) {
      send({'event': 'ping'});
    });
  }

  void _stopKeepalive() {
    _keepaliveTimer?.cancel();
    _keepaliveTimer = null;
  }

  void _startWatchdog() {
    _watchdogTimer?.cancel();
    _watchdogTimer = Timer.periodic(_watchdogInterval, (_) => _checkHealth());
  }

  /// Detects zombie connections the OS can't tell us about:
  ///  - handshake never confirmed (server unreachable mid-connect), or
  ///  - no inbound traffic (pongs included) for too long (dead half-open
  ///    TCP path after a network switch).
  void _checkHealth() {
    if (_channel == null || _manuallyDisconnected) return;
    final now = DateTime.now();
    if (!_connectionConfirmed && now.difference(_connectedAt) > _confirmTimeout) {
      debugPrint('WS watchdog: handshake not confirmed, reconnecting');
      _teardown();
      _scheduleReconnect();
      return;
    }
    if (now.difference(_lastMessageAt) > _staleTimeout) {
      debugPrint('WS watchdog: stale connection, reconnecting');
      _teardown();
      _scheduleReconnect();
    }
  }

  // ---------------------------------------------------------------------
  // App lifecycle — the OS freezes the isolate in background, so keepalive
  // stops and the socket dies there. On resume we must reconnect FAST instead
  // of waiting on a backed-off timer.
  // ---------------------------------------------------------------------
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _onAppResumed();
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        // Battery: no point pinging a frozen isolate.
        _pausedAt = DateTime.now();
        _stopKeepalive();
        break;
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }

  void _onAppResumed() {
    _reconnectTimer?.cancel();
    _retryAttempt = 0;
    _startKeepalive();
    final pausedFor = DateTime.now().difference(_pausedAt);
    if (_connecting || (isConnected && pausedFor > _resumeThreshold)) {
      // The old socket almost certainly died while frozen (or the handshake
      // hung) — tear it down and establish a fresh connection now.
      debugPrint('WS resume: recycling stale connection');
      _teardown();
    }
    connect();
  }

  /// Stops the connection permanently (e.g. on logout).
  void disconnect() {
    _manuallyDisconnected = true;
    _reconnectTimer?.cancel();
    _watchdogTimer?.cancel();
    _stopKeepalive();
    _sub?.cancel();
    _sub = null;
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
    _connecting = false;
    _retryAttempt = 0;
    _connectionConfirmed = false;
    _connectionController.add(false);
  }
}
