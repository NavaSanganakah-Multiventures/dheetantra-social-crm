import 'dart:async';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';

class CallerIdService {
  static const MethodChannel _channel = MethodChannel('dheetantra/callerid')
    ..setMethodCallHandler(_handleMethodCall);
  static final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();
  static Stream<Map<String, dynamic>> get events => _eventController.stream;

  static void initialize() {
    _channel.setMethodCallHandler(_handleMethodCall);
  }

  static Future<dynamic> _handleMethodCall(MethodCall call) async {
    switch (call.method) {
      case 'onIncomingCall':
      case 'onCallEnded':
        _eventController.add(Map<String, dynamic>.from(call.arguments as Map));
        break;
      default:
        debugPrint('CallerIdService: unhandled method ${call.method}');
    }
  }

  static Future<bool> storeSession(String sessionId, String workspaceId) async {
    if (!Platform.isAndroid) return false;
    try {
      return await _channel.invokeMethod('storeSession', {
        'sessionId': sessionId,
        'workspaceId': workspaceId,
      }) == true;
    } catch (e) {
      debugPrint('storeSession error: $e');
      return false;
    }
  }

  static Future<bool> isCallerIdRoleHeld() async {
    if (!Platform.isAndroid) return false;
    try {
      return await _channel.invokeMethod('isCallerIdRoleHeld') == true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> requestCallerIdRole() async {
    if (!Platform.isAndroid) return false;
    try {
      return await _channel.invokeMethod('requestCallerIdRole') == true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> setCallerIdEnabled(bool enabled) async {
    if (!Platform.isAndroid) return false;
    try {
      return await _channel.invokeMethod('setCallerIdEnabled', {'enabled': enabled}) == true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> setAfterCallEnabled(bool enabled) async {
    if (!Platform.isAndroid) return false;
    try {
      return await _channel.invokeMethod('setAfterCallEnabled', {'enabled': enabled}) == true;
    } catch (e) {
      return false;
    }
  }



  static Future<List<Map<String, dynamic>>> scanRecordings(String phone, {DateTime? after, DateTime? before}) async {
    if (!Platform.isAndroid) return [];
    try {
      final now = DateTime.now();
      final result = await _channel.invokeMethod('scanRecordings', {
        'phone': phone,
        'afterMs': (after ?? now.subtract(const Duration(minutes: 30))).millisecondsSinceEpoch,
        'beforeMs': (before ?? now.add(const Duration(minutes: 5))).millisecondsSinceEpoch,
      });
      if (result is List) {
        return result.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      return [];
    } catch (e) {
      debugPrint('scanRecordings error: $e');
      return [];
    }
  }

  static Future<Map<String, dynamic>> getInitialIntent() async {
    if (!Platform.isAndroid) return {};
    try {
      final result = await _channel.invokeMethod('getInitialIntent');
      return result is Map ? Map<String, dynamic>.from(result) : {};
    } catch (e) {
      debugPrint('getInitialIntent error: $e');
      return {};
    }
  }

  static Future<bool> clearAuth() async {
    try {
      return await _channel.invokeMethod('clearAuth') == true;
    } catch (e) {
      return false;
    }
  }
}
