import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api_service.dart';

/// Realtime connection to the workspace Durable Object.
///
/// - Auto-connects once a workspace is available (login/splash).
/// - Exponential backoff reconnect (2s -> 30s) on drop/error.
/// - Keepalive ping every 25s so proxies don't kill the socket.
/// - Exposes typed streams for every event the backend broadcasts.
class WebSocketService {
  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal();

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _keepaliveTimer;
  Timer? _reconnectTimer;
  bool _connecting = false;
  int _retryAttempt = 0;
  bool _manuallyDisconnected = false;
  // Becomes true only after the handshake is confirmed by a real message.
  bool _connectionConfirmed = false;

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
      // Optimistic "connected": the server sends no welcome message and never
      // echoes pings, so an idle workspace would otherwise never confirm the
      // connection. A failed handshake still flips the flag via onDone/onError.
      _connectionController.add(true);
      _startKeepalive();
    } catch (e) {
      debugPrint('WS Connection Error: $e');
      _connecting = false;
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic message) {
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
    _stopKeepalive();
    _sub?.cancel();
    _sub = null;
    _channel = null;
    _connecting = false;
    _connectionConfirmed = false;
    _connectionController.add(false);
    _scheduleReconnect();
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
    _keepaliveTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      send({'event': 'ping'});
    });
  }

  void _stopKeepalive() {
    _keepaliveTimer?.cancel();
    _keepaliveTimer = null;
  }

  /// Stops the connection permanently (e.g. on logout).
  void disconnect() {
    _manuallyDisconnected = true;
    _reconnectTimer?.cancel();
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
