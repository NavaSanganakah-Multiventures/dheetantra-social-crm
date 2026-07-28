import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/constants.dart';

class ApiService {
  late final Dio _dio;

  ApiService() {
    _dio = Dio(
      BaseOptions(
        baseUrl: Constants.baseUrl,
        headers: {
          'x-app-signature': Constants.appSignature,
          'Content-Type': 'application/json',
        },
      )
    );

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final session = prefs.getString('auth_session');
        final workspaceId = prefs.getString('workspace_id');
        if (session != null) {
          options.headers['Cookie'] = 'auth_session=$session';
        }
        if (workspaceId != null) {
          options.headers['x-workspace-id'] = workspaceId;
        }
        return handler.next(options);
      },
      onResponse: (response, handler) async {
        final setCookie = response.headers.map['set-cookie'];
        if (setCookie != null && setCookie.isNotEmpty) {
          final sessionStr = setCookie.firstWhere(
            (s) => s.startsWith('auth_session='),
            orElse: () => ''
          );
          if (sessionStr.isNotEmpty) {
             final sessionValue = sessionStr.split(';').first.split('=').last;
             final prefs = await SharedPreferences.getInstance();
             await prefs.setString('auth_session', sessionValue);
          }
        }
        return handler.next(response);
      }
    ));
  }

  // Auth APIs
  Future<Response> sendOtp(String email) async => _dio.post('/auth/send-otp', data: {'email': email});
  Future<Response> verifyOtp(String email, String otp) async => _dio.post('/auth/verify-otp', data: {'email': email, 'otp': otp});
  Future<Response> getUserProfile() async => _dio.get('/auth/me');
  Future<Response> logout() async => _dio.post('/auth/logout');

  // Chat APIs (Inbox)
  Future<Response> getActiveConversations() async => _dio.get('/inbox/conversations/active');
  Future<Response> getMessages(String contactId) async => _dio.get('/inbox/conversations/$contactId');
  Future<Response> sendMessage(String contactId, String text) async {
    return _dio.post('/inbox/messages', data: {
      'contactId': contactId,
      'type': 'text',
      'text': text,
      'platform': 'whatsapp'
    });
  }

  // Call APIs
  Future<Response> getCalls() async => _dio.get('/whatsapp/calls');
  Future<Response> startCall(String contactId) async {
    // Note: Outbound calling might have limitations on Meta's end,
    // this mimics the UI trigger.
    return _dio.post('/whatsapp/calls/start', data: {'contactId': contactId});
  }

  // Broadcast APIs
  Future<Response> getBroadcasts() async => _dio.get('/broadcast');
  Future<Response> createBroadcast(Map<String, dynamic> data) async => _dio.post('/broadcast', data: data);

  // WhatsApp Management APIs
  Future<Response> getWhatsAppConfigs() async => _dio.get('/whatsapp/config');

  // Settings API
  Future<Response> getWorkspaces() async => _dio.get('/workspace');
}
