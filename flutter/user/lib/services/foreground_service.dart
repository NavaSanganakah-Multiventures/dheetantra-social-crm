import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

import 'dart:isolate';

@pragma('vm:entry-point')
void startCallback() {
  FlutterForegroundTask.setTaskHandler(ForegroundTaskHandler());
}

class ForegroundTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, SendPort? sendPort) async {
    // Service started.
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // Keep alive tick
  }

  @override
  Future<void> onDestroy(DateTime timestamp) async {
    // Service destroyed.
  }
}

class DheetantraForegroundService {
  static final DheetantraForegroundService _instance = DheetantraForegroundService._internal();
  factory DheetantraForegroundService() => _instance;
  DheetantraForegroundService._internal();

  bool _isInitialized = false;

  Future<void> init() async {
    if (_isInitialized) return;
    _isInitialized = true;
    
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'dheetantra_foreground',
        channelName: 'DheeTantra Service',
        channelDescription: 'Keeps connection alive to receive messages instantly.',
        channelImportance: NotificationChannelImportance.MIN,
        priority: NotificationPriority.MIN,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: false,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(5000),
        autoRunOnBoot: true,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  Future<void> startService() async {
    if (!Platform.isAndroid) return;
    if (await FlutterForegroundTask.isRunningService) return;
    
    // Check permissions
    if (await FlutterForegroundTask.checkNotificationPermission() == NotificationPermission.denied) {
      await FlutterForegroundTask.requestNotificationPermission();
    }
    
    await FlutterForegroundTask.startService(
      notificationTitle: 'DheeTantra सक्रिय है',
      notificationText: 'नए संदेश प्राप्त हो रहे हैं',
      callback: startCallback,
    );
  }

  Future<void> stopService() async {
    if (!Platform.isAndroid) return;
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.stopService();
    }
  }

  Future<bool> get isRunning async => await FlutterForegroundTask.isRunningService;
}
