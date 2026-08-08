import 'dart:async';

import 'package:flutter/foundation.dart';

/// Global refresh trigger for screens that should reload data when:
/// - app foreground me aata hai (resume),
/// - WebSocket reconnect ho jaata hai,
/// - user manually refresh karna chahta hai.
///
/// Dashboard/Inbox iske stream ko sunte hain aur [silent] flag ke saath
/// reload karte hain, taaki UI reset na ho.
class DataRefreshService {
  static final DataRefreshService _instance = DataRefreshService._internal();
  factory DataRefreshService() => _instance;
  DataRefreshService._internal();

  final _controller = StreamController<RefreshReason>.broadcast();
  Stream<RefreshReason> get onRefresh => _controller.stream;

  void trigger(RefreshReason reason) {
    debugPrint('[DataRefreshService] trigger: $reason');
    _controller.add(reason);
  }

  void dispose() {
    _controller.close();
  }
}

enum RefreshReason {
  appResumed,
  websocketReconnected,
  manual,
}
