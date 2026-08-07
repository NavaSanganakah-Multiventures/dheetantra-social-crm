import 'dart:async';

/// In-app notification center: collects realtime events (new messages,
/// missed calls, conversation status changes) so the bell icon can show an
/// unread badge and the notification screen can list recent activity.
class NotificationCenter {
  static final NotificationCenter _instance = NotificationCenter._internal();
  factory NotificationCenter() => _instance;
  NotificationCenter._internal();

  final _controller = StreamController<void>.broadcast();
  Stream<void> get onChanged => _controller.stream;

  final List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> get items => List.unmodifiable(_items);

  int _unread = 0;
  int get unread => _unread;

  void add({
    required String title,
    required String body,
    required String type, // 'message' | 'call' | 'system'
    Map<String, dynamic>? data,
    DateTime? time,
  }) {
    _items.insert(0, {
      'title': title,
      'body': body,
      'type': type,
      'data': data ?? const {},
      'time': time ?? DateTime.now(),
    });
    if (_items.length > 100) _items.removeLast();
    _unread++;
    _controller.add(null);
  }

  void markAllRead() {
    if (_unread == 0) return;
    _unread = 0;
    _controller.add(null);
  }

  void clear() {
    _items.clear();
    _unread = 0;
    _controller.add(null);
  }
}
