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
  NotificationRouter._internal();

  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get onNotification => _controller.stream;

  void dispatch(Map<String, dynamic> data) {
    _controller.add(data);
  }
}
