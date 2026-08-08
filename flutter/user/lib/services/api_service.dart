import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider/path_provider.dart';

class ApiService {
  static const String baseUrl = 'https://dheetantra.navasanganakah.com';

  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  late final Dio _dio;
  late final PersistCookieJar _cookieJar;
  String? _workspaceId;
  Map<String, dynamic>? _currentUser;

  Dio get dio => _dio;
  String? get workspaceId => _workspaceId;
  Map<String, dynamic>? get currentUser => _currentUser;

  ApiService._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {
        'Content-Type': 'application/json',
      },
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (_workspaceId != null) {
          options.headers['x-workspace-id'] = _workspaceId;
        }
        handler.next(options);
      },
    ));
  }

  Future<void> init() async {
    final dir = await getApplicationDocumentsDirectory();
    _cookieJar = PersistCookieJar(
      storage: FileStorage(dir.path),
    );
    _dio.interceptors.add(CookieManager(_cookieJar));

    final prefs = await SharedPreferences.getInstance();
    _workspaceId = prefs.getString('workspaceId');
  }

  Future<void> _saveWorkspaceId(String id) async {
    _workspaceId = id;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('workspaceId', id);
  }

  Future<void> clearSession() async {
    _workspaceId = null;
    _currentUser = null;
    _cookieJar.deleteAll();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('workspaceId');
  }

  // ========== AUTH ==========

  Future<Map<String, dynamic>> sendOtp(String email, {String type = 'login', String? name}) async {
    try {
      final res = await _dio.post('/api/auth/send-otp', data: {
        'email': email,
        'type': type,
        if (name != null) 'name': name,
      });
      return res.data;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> verifyOtp(String email, String otp) async {
    try {
      final res = await _dio.post('/api/auth/verify-otp', data: {
        'email': email,
        'otp': otp,
      });
      final data = res.data as Map<String, dynamic>;
      if (data['workspaceId'] != null) {
        await _saveWorkspaceId(data['workspaceId']);
      }
      if (data['user'] != null) {
        _currentUser = data['user'];
      }
      return data;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>?> getMe() async {
    try {
      final res = await _dio.get('/api/auth/me');
      final data = res.data as Map<String, dynamic>;
      if (data['user'] != null) {
        _currentUser = data['user'];
        return data['user'];
      }
      return null;
    } on DioException {
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post('/api/auth/logout');
    } catch (_) {}
    await clearSession();
  }

  // ========== FCM PUSH NOTIFICATIONS ==========

  Future<bool> registerFcmToken(String token, {String deviceType = 'android'}) async {
    try {
      final res = await _dio.post('/api/fcm/register', data: {
        'token': token,
        'device_type': deviceType,
      });
      return res.data['success'] == true;
    } catch (e) {
      debugPrint('FCM register error: $e');
      return false;
    }
  }

  Future<void> unregisterFcmToken({String? token}) async {
    try {
      await _dio.delete('/api/fcm/register', data: {
        if (token != null) 'token': token,
      });
    } catch (e) {
      debugPrint('FCM unregister error: $e');
    }
  }

  // ========== CONTACTS ==========

  Future<List<dynamic>> getContacts() async {
    try {
      final res = await _dio.get('/api/crm/contacts');
      final data = res.data as Map<String, dynamic>;
      return data['contacts'] ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> createContact(Map<String, dynamic> contactData) async {
    try {
      final res = await _dio.post('/api/crm/contacts', data: contactData);
      return res.data;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> updateContact(String contactId, Map<String, dynamic> contactData) async {
    try {
      final res = await _dio.put('/api/crm/contacts/$contactId', data: contactData);
      return res.data;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> deleteContact(String contactId) async {
    try {
      final res = await _dio.delete('/api/crm/contacts/$contactId');
      return res.data;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== CONVERSATIONS ==========

  Future<List<dynamic>> getConversations({String? status, String? phoneNumberId, String? platform}) async {
    try {
      final queryParams = <String, dynamic>{};
      if (status != null && status != 'all') queryParams['status'] = status;
      if (phoneNumberId != null) queryParams['phoneNumberId'] = phoneNumberId;
      if (platform != null && platform != 'all') queryParams['platform'] = platform;
      final res = await _dio.get('/api/inbox/conversations', queryParameters: queryParams);
      final data = res.data as Map<String, dynamic>;
      return data['conversations'] ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> getMessages(String conversationId, {int limit = 500}) async {
    try {
      final res = await _dio.get('/api/inbox/messages/$conversationId', queryParameters: {'limit': limit});
      return res.data;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> initiateConversation(String contactId) async {
    try {
      final res = await _dio.post('/api/inbox/conversations/initiate', data: {
        'contactId': contactId,
      });
      return res.data;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> sendMessage({
    required String to,
    required String text,
    required String conversationId,
    String type = 'text',
    String platform = 'whatsapp',
    String? subject,
  }) async {
    try {
      if (platform == 'email') {
        final res = await _dio.post('/api/email/inbox/conversations/$conversationId/reply', data: {
          'text': text,
          'html': text.replaceAll('\n', '<br/>'),
          if (subject != null) 'subject': subject,
        });
        return res.data;
      } else {
        final res = await _dio.post('/api/whatsapp/send', data: {
          'to': to,
          'text': text,
          'conversationId': conversationId,
          'type': type,
        });
        return res.data;
      }
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== CALLS ==========

  Future<List<dynamic>> getCallLogs() async {
    try {
      final res = await _dio.get('/api/whatsapp/calls');
      final data = res.data as Map<String, dynamic>;
      return data['calls'] ?? [];
    } on DioException {
      return [];
    }
  }

  // ========== BROADCAST ==========

  Future<List<dynamic>> getBroadcasts() async {
    try {
      final res = await _dio.get('/api/broadcast');
      final data = res.data as Map<String, dynamic>;
      return data['broadcasts'] ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> sendBroadcast(Map<String, dynamic> broadcastData) async {
    try {
      final res = await _dio.post('/api/broadcast', data: broadcastData);
      return res.data;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== WORKSPACE ==========

  Future<Map<String, dynamic>?> getWorkspace() async {
    try {
      final res = await _dio.get('/api/workspace');
      return res.data;
    } on DioException {
      return null;
    }
  }

  // ========== DASHBOARD STATS ==========

  Future<Map<String, dynamic>> getDashboardStats() async {
    try {
      // Dono calls parallel chalao — sequential hone se dashboard load me
      // 2x delay aa raha tha.
      final results = await Future.wait<dynamic>([
        getContacts(),
        getConversations(status: 'open'),
      ]);
      final contacts = results[0] as List<dynamic>;
      final conversations = results[1] as List<dynamic>;
      return {
        'totalContacts': contacts.length,
        'openConversations': conversations.length,
        'contacts': contacts,
        'conversations': conversations,
      };
    } catch (_) {
      return {
        'totalContacts': 0,
        'openConversations': 0,
        'contacts': [],
        'conversations': [],
      };
    }
  }

  // ========== TEMPLATES ==========

  Future<List<dynamic>> getTemplates() async {
    try {
      final res = await _dio.get('/api/whatsapp/templates');
      final data = res.data as Map<String, dynamic>;
      final local = (data['local'] as List?) ?? [];
      final meta = (data['meta'] as List?) ?? [];
      return [...local, ...meta];
    } on DioException {
      return [];
    }
  }

  // ========== HELPERS ==========

  Map<String, dynamic> _handleError(DioException e) {
    if (e.response != null && e.response!.data is Map) {
      return e.response!.data;
    }
    return {'error': e.message ?? 'कुछ गड़बड़ हो गई'};
  }
}
