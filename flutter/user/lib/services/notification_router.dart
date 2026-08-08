import 'dart:async';

/// Routes notification taps (FCM + in-app) to the UI shell.
///
/// [dispatch] is called from FcmService; HomeShell listens and reacts
/// (open chat, switch tab, show dialog). Decouples push handling from
/// navigation so taps work whether the app was terminated, backgrounded,
/// or foregrounded.
class NotificationRouter {
  static final NotificationRouter _instance = NotificationRouter._internal();
  factory NotificationRouter() => _instance;

  // Agar app kill ke baad notification se khulti hai toh HomeShell abhi
  // mounted nahi hota. Pending events ko queue me save rakhte hain taaki
  // multiple notification taps overwrite na ho jayein.
  NotificationRouter._internal() {
    _controller = StreamController<Map<String, dynamic>>.broadcast(
      onListen: () {
        while (_pending.isNotEmpty) {
          _controller.add(_pending.removeAt(0));
        }
      },
    );
  }

  late final StreamController<Map<String, dynamic>> _controller;
  Stream<Map<String, dynamic>> get onNotification => _controller.stream;

  final List<Map<String, dynamic>> _pending = [];

  void dispatch(Map<String, dynamic> data) {
    if (_controller.hasListener) {
      _controller.add(data);
    } else {
      _pending.add(data);
    }
  }
}
