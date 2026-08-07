import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api_service.dart';

class WebSocketService {
  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal();

  WebSocketChannel? _channel;
  bool _isConnected = false;

  final _incomingCallController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onIncomingCall => _incomingCallController.stream;

  final _callStatusController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onCallStatusUpdated => _callStatusController.stream;

  final _newMessageController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onNewMessage => _newMessageController.stream;

  final _messageStatusController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onMessageStatusUpdated => _messageStatusController.stream;

  void connect() {
    if (_isConnected) return;
    final workspaceId = ApiService().workspaceId;
    if (workspaceId == null) return;

    final url = 'wss://dheetantra.navasanganakah.com/api/chat/connect/global-$workspaceId';
    try {
      _channel = WebSocketChannel.connect(Uri.parse(url));
      _isConnected = true;

      _channel!.stream.listen(
        (message) {
          try {
            String msgString = message is String ? message : utf8.decode(message);
            final data = jsonDecode(msgString);
            if (data['type'] == 'incoming_call') {
              _incomingCallController.add(data['call']);
            } else if (data['type'] == 'call_status_updated') {
              _callStatusController.add(data);
            } else if (data['type'] == 'new_message') {
              _newMessageController.add(data);
            } else if (data['type'] == 'message_status_updated') {
              _messageStatusController.add(data);
            }
          } catch (e) {
            print('WS Message Error: $e');
          }
        },
        onDone: () {
          _isConnected = false;
          // Implement reconnect logic here if needed
          Future.delayed(const Duration(seconds: 5), connect);
        },
        onError: (error) {
          _isConnected = false;
          print('WS Error: $error');
        },
      );
    } catch (e) {
      print('WS Connection Error: $e');
    }
  }

  void disconnect() {
    _channel?.sink.close();
    _isConnected = false;
  }
}
