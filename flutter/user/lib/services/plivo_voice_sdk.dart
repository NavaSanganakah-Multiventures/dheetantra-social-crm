import 'dart:async';

import 'package:flutter/services.dart';

/// Plivo official Android SDK ka MethodChannel bridge.
/// Channel: com.navasanganakah.dheetantra/plivo_voice
class PlivoVoiceSdk {
  static const MethodChannel _channel =
      MethodChannel('com.navasanganakah.dheetantra/plivo_voice');

  final _events = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get events => _events.stream;

  bool _handlerSet = false;

  void _ensureHandler() {
    if (_handlerSet) return;
    _handlerSet = true;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onEvent') {
        final args = Map<String, dynamic>.from(call.arguments as Map);
        _events.add(args);
      }
    });
  }

  Future<bool> init() async {
    _ensureHandler();
    return await _channel.invokeMethod<bool>('init') ?? false;
  }

  Future<bool> login({
    required String username,
    required String password,
    String? fcmToken,
    String? certificateId,
  }) async {
    _ensureHandler();
    return await _channel.invokeMethod<bool>('login', <String, dynamic>{
          'username': username,
          'password': password,
          'fcmToken': fcmToken,
          'certificateId': certificateId,
        }) ??
        false;
  }

  Future<void> logout() async {
    await _channel.invokeMethod('logout');
  }

  Future<bool> makeCall(String destination) async {
    return await _channel.invokeMethod<bool>('makeCall', <String, dynamic>{
          'destination': destination,
        }) ??
        false;
  }

  Future<bool> answer() async =>
      await _channel.invokeMethod<bool>('answer') ?? false;

  Future<bool> reject() async =>
      await _channel.invokeMethod<bool>('reject') ?? false;

  Future<void> hangup() async {
    await _channel.invokeMethod('hangup');
  }

  Future<bool> toggleMute({required bool mute}) async {
    return await _channel.invokeMethod<bool>(mute ? 'mute' : 'unmute') ?? false;
  }

  Future<bool> sendDigits(String digits) async {
    return await _channel.invokeMethod<bool>('sendDigits', <String, dynamic>{
          'digits': digits,
        }) ??
        false;
  }

  Future<bool> isLoggedIn() async =>
      await _channel.invokeMethod<bool>('isLoggedIn') ?? false;
}
