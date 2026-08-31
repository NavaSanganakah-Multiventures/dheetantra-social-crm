import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';
import 'package:path/path.dart' as path;

class ApiService {
  static const String baseUrl = 'https://dheetantra.navasanganakah.com';

  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  late final Dio _dio;
  late final PersistCookieJar _cookieJar;
  String? _workspaceId;
  String? _sessionId;
  Map<String, dynamic>? _currentUser;

  Dio get dio => _dio;
  String? get workspaceId => _workspaceId;
  String? get sessionId => _sessionId;
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
    _sessionId = prefs.getString('sessionId');
  }

  Future<void> _saveWorkspaceId(String id) async {
    _workspaceId = id;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('workspaceId', id);
  }

  Future<void> _saveSessionId(String id) async {
    _sessionId = id;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('sessionId', id);
  }

  Future<void> clearSession() async {
    _workspaceId = null;
    _sessionId = null;
    _currentUser = null;
    _cookieJar.deleteAll();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('workspaceId');
    await prefs.remove('sessionId');
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
      if (data['sessionId'] != null) {
        await _saveSessionId(data['sessionId']);
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

  /// Fetches the session id from the server. Mobile apps cannot read the
  /// httpOnly cookie directly, so this endpoint returns the active session id
  /// for use as a WebSocket auth query parameter.
  Future<String?> fetchSessionToken() async {
    try {
      final res = await _dio.get('/api/auth/session-token');
      final data = res.data as Map<String, dynamic>;
      final token = data['sessionId'] as String?;
      if (token != null && token.isNotEmpty) {
        await _saveSessionId(token);
      }
      return token;
    } on DioException catch (e) {
      debugPrint('fetchSessionToken error: $e');
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

  Future<bool> registerFcmToken(String token, {String deviceType = 'android', String? oldToken}) async {
    try {
      final data = <String, dynamic>{
        'token': token,
        'device_type': deviceType,
      };
      if (oldToken != null) {
        data['old_token'] = oldToken;
      }
      final res = await _dio.post('/api/fcm/register', data: data);
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

  /// Diagnostic: ask the backend to send a test FCM push to this device.
  Future<Map<String, dynamic>> testPushNotification() async {
    try {
      final res = await _dio.post('/api/fcm/test');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map<String, dynamic>) return data;
      return {'error': e.message ?? 'Unknown error'};
    } catch (e) {
      return {'error': e.toString()};
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
    String? phoneNumberId,
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
          if (phoneNumberId != null && phoneNumberId.isNotEmpty) 'phoneNumberId': phoneNumberId,
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

  /// WhatsApp WebRTC outbound call initiate karta hai. Client offer SDP banata
  /// hai aur backend use Meta Graph API (/phone_number_id/calls) ko proxy karta hai.
  Future<Map<String, dynamic>> initiateWhatsAppCall({
    required String to,
    String? contactId,
    String? phoneNumberId,
    String? recipient,
    required String sdp,
    String sdpType = 'offer',
  }) async {
    try {
      final res = await _dio.post('/api/whatsapp/calls/outbound', data: {
        'to': to,
        if (contactId != null) 'contactId': contactId,
        if (phoneNumberId != null) 'phoneNumberId': phoneNumberId,
        if (recipient != null) 'recipient': recipient,
        'sdp': sdp,
        'sdpType': sdpType,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  /// Incoming call ka stored Meta SDP offer fetch karta hai. FCM push payload
  /// size limit ki wajah se offer push mein nahi bhejte; accept ke waqt yahan
  /// se lete hain.
  Future<Map<String, dynamic>> getCallSdp(String callId) async {
    try {
      final res = await _dio.get('/api/whatsapp/calls/$callId/sdp');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }


  // ========== CALLER ID / AFTER-CALL CRM ==========

  Future<Map<String, dynamic>> getCallerCard(String phone) async {
    try {
      final res = await _dio.get('/api/crm/caller-card', queryParameters: {'phone': phone});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> summarizeCall(String callId) async {
    try {
      final res = await _dio.post('/api/calls/$callId/summarize');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }





  // ========== TWILIO VOICE TOKEN ==========

  Future<Map<String, dynamic>> getTwilioVoiceToken() async {
    try {
      final res = await _dio.get('/api/twilio/token');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== TWILIO CALL ==========

  Future<Map<String, dynamic>> initiateTwilioCall({
    required String to,
    String? contactId,
    String? twilioConfigId,
    String? fromNumber,
  }) async {
    try {
      final res = await _dio.post('/api/twilio/call', data: {
        'to': to,
        if (contactId != null) 'contactId': contactId,
        if (twilioConfigId != null) 'twilioConfigId': twilioConfigId,
        if (fromNumber != null) 'fromNumber': fromNumber,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== PLIVO CALL ==========

  Future<Map<String, dynamic>> hangupPlivoCall(String callId) async {
    try {
      final res = await _dio.post('/api/plivo/call/$callId/hangup');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== TWILIO WORKSPACE CONFIG ==========

  Future<List<dynamic>> getTwilioConfigs() async {
    try {
      final res = await _dio.get('/api/twilio/configs');
      final data = res.data as Map<String, dynamic>;
      return data['configs'] as List? ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> saveTwilioConfig({
    String? id,
    required String name,
    required String accountSid,
    String? authToken,
    bool isActive = true,
    List<String> fromNumbers = const [],
    String? voiceApplicationSid,
    String? apiKeySid,
    String? apiKeySecret,
    String? pushCredentialSidAndroid,
    String? pushCredentialSidIos,
  }) async {
    try {
      final data = <String, dynamic>{
        'name': name,
        'accountSid': accountSid,
        'isActive': isActive,
        if (authToken != null && authToken.isNotEmpty) 'authToken': authToken,
        if (fromNumbers.isNotEmpty) 'fromNumbers': fromNumbers,
        if (voiceApplicationSid != null && voiceApplicationSid.isNotEmpty) 'voiceApplicationSid': voiceApplicationSid,
        if (apiKeySid != null && apiKeySid.isNotEmpty) 'apiKeySid': apiKeySid,
        if (apiKeySecret != null && apiKeySecret.isNotEmpty) 'apiKeySecret': apiKeySecret,
        if (pushCredentialSidAndroid != null && pushCredentialSidAndroid.isNotEmpty) 'pushCredentialSidAndroid': pushCredentialSidAndroid,
        if (pushCredentialSidIos != null && pushCredentialSidIos.isNotEmpty) 'pushCredentialSidIos': pushCredentialSidIos,
      };
      final res = id == null
          ? await _dio.post('/api/twilio/configs', data: data)
          : await _dio.put('/api/twilio/configs/$id', data: data);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> deleteTwilioConfig(String id) async {
    try {
      final res = await _dio.delete('/api/twilio/configs/$id');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> addTwilioFromNumber(String configId, String fromNumber, {bool isDefault = false}) async {
    try {
      final res = await _dio.post('/api/twilio/configs/$configId/from-numbers', data: {
        'fromNumber': fromNumber,
        'isDefault': isDefault,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> deleteTwilioFromNumber(String id) async {
    try {
      final res = await _dio.delete('/api/twilio/from-numbers/$id');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> setDefaultTwilioFromNumber(String id) async {
    try {
      final res = await _dio.post('/api/twilio/from-numbers/$id/default');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== PLIVO CALL ==========

  Future<Map<String, dynamic>> initiatePlivoCall({
    required String to,
    String? contactId,
    String? plivoConfigId,
    String? fromNumber,
  }) async {
    try {
      final res = await _dio.post('/api/plivo/call', data: {
        'to': to,
        'mode': 'in_app',
        if (contactId != null) 'contactId': contactId,
        if (plivoConfigId != null) 'plivoConfigId': plivoConfigId,
        if (fromNumber != null) 'fromNumber': fromNumber,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> hangupCall(String callId) async {
    try {
      final res = await _dio.post('/api/calls/$callId/hangup');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> declineCall(String callId) async {
    try {
      final res = await _dio.post('/api/calls/$callId/decline');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== PLIVO WORKSPACE CONFIG ==========

  Future<List<dynamic>> getPlivoConfigs() async {
    try {
      final res = await _dio.get('/api/plivo/configs');
      final data = res.data as Map<String, dynamic>;
      return data['configs'] as List? ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> getPlivoSipCredentials() async {
    try {
      final res = await _dio.get('/api/plivo/sip-credentials');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> linkPlivoEndpoint(String configId, {bool force = false}) async {
    try {
      final res = await _dio.post('/api/plivo/configs/$configId/link', data: {'force': force});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }


  Future<Map<String, dynamic>> savePlivoConfig({
    String? id,
    required String name,
    required String authId,
    String? authToken,
    bool isActive = true,
    List<String> fromNumbers = const [],
    String? endpointUsername,
    String? endpointPassword,
  }) async {
    try {
      final data = <String, dynamic>{
        'name': name,
        'authId': authId,
        'isActive': isActive,
        if (authToken != null && authToken.isNotEmpty) 'authToken': authToken,
        if (fromNumbers.isNotEmpty) 'fromNumbers': fromNumbers,
        if (endpointUsername != null) 'endpointUsername': endpointUsername,
        if (endpointPassword != null && endpointPassword.isNotEmpty) 'endpointPassword': endpointPassword,
      };
      final res = id == null
          ? await _dio.post('/api/plivo/configs', data: data)
          : await _dio.put('/api/plivo/configs/$id', data: data);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> deletePlivoConfig(String id) async {
    try {
      final res = await _dio.delete('/api/plivo/configs/$id');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> addPlivoFromNumber(String configId, String fromNumber, {bool isDefault = false}) async {
    try {
      final res = await _dio.post('/api/plivo/configs/$configId/from-numbers', data: {
        'fromNumber': fromNumber,
        'isDefault': isDefault,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> deletePlivoFromNumber(String id) async {
    try {
      final res = await _dio.delete('/api/plivo/from-numbers/$id');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> setDefaultPlivoFromNumber(String id) async {
    try {
      final res = await _dio.post('/api/plivo/from-numbers/$id/default');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> setPlivoAutoDialAgents(String configId, bool enabled) async {
    try {
      final res = await _dio.put('/api/plivo/configs/$configId', data: {'autoDialAgents': enabled});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== VOICE AGENT AVAILABILITY ==========

  Future<List<dynamic>> getVoiceAgents() async {
    try {
      final res = await _dio.get('/api/voice/agents');
      final data = res.data as Map<String, dynamic>;
      return data['agents'] as List? ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> setAgentVoiceStatus(String status) async {
    try {
      final res = await _dio.post('/api/voice/agent-status', data: {'status': status});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> setAgentVoicePhone(String phone) async {
    try {
      final res = await _dio.post('/api/voice/agent-phone', data: {'phone': phone});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== UNIFIED CRM CALLS ==========

  Future<List<dynamic>> getUnifiedCalls({String? source, String? search, String? phone, int limit = 100, int offset = 0}) async {
    try {
      final query = <String, dynamic>{'limit': limit, 'offset': offset};
      if (source != null && source != 'all') query['source'] = source;
      if (phone != null && phone.isNotEmpty) query['phone'] = phone;
      final res = await _dio.get('/api/calls', queryParameters: query);
      final data = res.data as Map<String, dynamic>;
      final calls = data['calls'] as List? ?? [];
      if (search != null && search.trim().isNotEmpty) {
        final term = search.trim().toLowerCase();
        return calls.where((c) {
          final map = c as Map<String, dynamic>;
          final name = (map['contact_name'] ?? map['name'] ?? '').toString().toLowerCase();
          final phone = (map['phone'] ?? map['caller_number'] ?? '').toString().toLowerCase();
          return name.contains(term) || phone.contains(term);
        }).toList();
      }
      return calls;
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> getCallDetail(String callId) async {
    try {
      final res = await _dio.get('/api/calls/$callId');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> updateCallNotes(String callId, String notes) async {
    try {
      final res = await _dio.post('/api/calls/$callId/status', data: {'notes': notes});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> updateCallStatus(String callId, {String? status, int? duration, String? endedAt, String? notes}) async {
    try {
      final body = <String, dynamic>{};
      if (status != null) body['status'] = status;
      if (duration != null) body['duration'] = duration;
      if (endedAt != null) body['endedAt'] = endedAt;
      if (notes != null) body['notes'] = notes;
      final res = await _dio.post('/api/calls/$callId/status', data: body);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }
  Future<Map<String, dynamic>> createGsmCall({required String phone, required String direction, int duration = 0}) async {
    try {
      final res = await _dio.post('/api/calls', data: {
        'phone': phone,
        'direction': direction,
        'status': 'ended',
        'duration': duration,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }
  Future<Map<String, dynamic>> uploadCallRecording(String callId, File file) async {
    try {
      final fileName = path.basename(file.path);
      final form = FormData.fromMap({
        'recording': await MultipartFile.fromFile(file.path, filename: fileName),
      });
      final res = await _dio.post('/api/calls/$callId/recording', data: form);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
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
      // Dono calls parallel chalao ÃÂ¢ÃÂÃÂ sequential hone se dashboard load me
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

  // ========== WORKSPACE MEMBERS ==========

  Future<List<dynamic>> getWorkspaceMembers() async {
    try {
      final res = await _dio.get('/api/workspace/members');
      final data = res.data as Map<String, dynamic>;
      return data['members'] ?? [];
    } on DioException {
      // _handleError returns a Map, but this method's return type is
      // Future<List<dynamic>>; return an empty list on failure instead.
      return [];
    }
  }

  Future<Map<String, dynamic>> addWorkspaceMember(String email, {String role = 'member'}) async {
    try {
      final res = await _dio.post('/api/workspace/members', data: {
        'email': email.trim().toLowerCase(),
        'role': role,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> updateWorkspaceMember(String userId, String role) async {
    try {
      final res = await _dio.put('/api/workspace/members/$userId', data: {'role': role});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> removeWorkspaceMember(String userId) async {
    try {
      final res = await _dio.delete('/api/workspace/members/$userId');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== WHATSAPP CONFIGS ==========

  Future<Map<String, dynamic>?> getWhatsAppConfigs() async {
    try {
      final res = await _dio.get('/api/whatsapp/config');
      return res.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  Future<Map<String, dynamic>> saveWhatsAppConfig(Map<String, dynamic> configData) async {
    try {
      final res = await _dio.post('/api/whatsapp/config', data: configData);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> deleteWhatsAppConfig(String id) async {
    try {
      final res = await _dio.delete('/api/whatsapp/config/$id');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== SEND WHATSAPP TO NEW NUMBER ==========

  Future<Map<String, dynamic>> sendWhatsAppToNewNumber({
    required String name,
    required String phone,
    required String text,
  }) async {
    try {
      final cleanedPhone = phone.replaceAll(RegExp(r'[^0-9+]'), '');
      final existing = await _dio.get('/api/crm/contacts');
      final contacts = (existing.data['contacts'] as List?) ?? [];
      String? contactId;
      String displayName = name;
      for (final c in contacts) {
        final cPhone = _cleanPhone(c['phone'] ?? c['platform_contact_id'] ?? '');
        if (cPhone == cleanedPhone.replaceAll('+', '')) {
          contactId = c['id'] as String?;
          if ((c['name'] ?? '').toString().isNotEmpty) displayName = c['name'].toString();
          break;
        }
      }

      if (contactId == null) {
        final created = await createContact({
          'name': displayName,
          'phone': cleanedPhone,
          'platform': 'whatsapp',
        });
        if (created['error'] != null) return created;
        contactId = created['contact']?['id'] ?? created['id'];
      }

      if (contactId == null || contactId.toString().isEmpty) {
        return {'error': 'Contact could not be created'};
      }

      final conv = await initiateConversation(contactId.toString());
      if (conv['error'] != null) return conv;
      final conversation = conv['conversation'] as Map<String, dynamic>?;
      if (conversation == null || conversation['id'] == null) {
        return {'error': 'Conversation could not be created'};
      }

      return await sendMessage(
        to: cleanedPhone,
        text: text,
        conversationId: conversation['id'].toString(),
        platform: 'whatsapp',
      );
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  String _cleanPhone(dynamic phone) {
    return phone.toString().replaceAll(RegExp(r'[^0-9]'), '');
  }

  // ========== WHATSAPP TEMPLATES SEND ==========

  Future<Map<String, dynamic>> sendTemplate({
    required String to,
    required String templateName,
    String languageCode = 'en_US',
    List<String> parameters = const [],
    String? phoneNumberId,
  }) async {
    try {
      final body = <String, dynamic>{
        'to': to,
        'templateName': templateName,
        'languageCode': languageCode,
        if (parameters.isNotEmpty) 'parameters': parameters,
        if (phoneNumberId != null && phoneNumberId.isNotEmpty) 'phoneNumberId': phoneNumberId,
      };
      final res = await _dio.post('/api/whatsapp/templates/send', data: body);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== EMAIL ==========

  Future<List<dynamic>> getEmailMailboxes() async {
    try {
      final res = await _dio.get('/api/email/mailboxes');
      final data = res.data as Map<String, dynamic>;
      return data['mailboxes'] ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> sendEmail({
    required String to,
    required String subject,
    required String body,
    String? fromAddress,
  }) async {
    try {
      final res = await _dio.post('/api/email/send', data: {
        'to': to.trim(),
        'subject': subject.trim(),
        'text': body,
        'html': body.replaceAll('\n', '<br/>'),
        if (fromAddress != null && fromAddress.isNotEmpty) 'fromAddress': fromAddress,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== CATALOGS ==========

  Future<List<dynamic>> getCatalogs({String? status}) async {
    try {
      final query = <String, dynamic>{};
      if (status != null && status != 'all') query['status'] = status;
      final res = await _dio.get('/api/catalogs', queryParameters: query);
      final data = res.data as Map<String, dynamic>;
      return data['catalogs'] ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> createCatalog(Map<String, dynamic> data) async {
    try {
      final res = await _dio.post('/api/catalogs', data: data);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> getCatalog(String id) async {
    try {
      final res = await _dio.get('/api/catalogs/$id');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> updateCatalog(String id, Map<String, dynamic> data) async {
    try {
      final res = await _dio.put('/api/catalogs/$id', data: data);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> deleteCatalog(String id) async {
    try {
      final res = await _dio.delete('/api/catalogs/$id');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<List<dynamic>> getProducts(String catalogId) async {
    try {
      final res = await _dio.get('/api/catalogs/$catalogId/products');
      final data = res.data as Map<String, dynamic>;
      return data['products'] ?? [];
    } on DioException {
      return [];
    }
  }

  Future<Map<String, dynamic>> createProduct(String catalogId, Map<String, dynamic> data) async {
    try {
      final res = await _dio.post('/api/catalogs/$catalogId/products', data: data);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> updateProduct(String productId, Map<String, dynamic> data) async {
    try {
      final res = await _dio.put('/api/catalogs/products/$productId', data: data);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> deleteProduct(String productId) async {
    try {
      final res = await _dio.delete('/api/catalogs/products/$productId');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> shareCatalog({
    required String conversationId,
    required String type,
    String? productId,
    String? catalogId,
    String? note,
  }) async {
    try {
      final data = <String, dynamic>{
        'conversationId': conversationId,
        'type': type,
        if (note != null && note.isNotEmpty) 'note': note,
        if (type == 'product' && productId != null) 'productId': productId,
        if (type == 'catalog' && catalogId != null) 'catalogId': catalogId,
      };
      final res = await _dio.post('/api/catalogs/share', data: data);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  Future<Map<String, dynamic>> uploadImage(File file, {String field = 'file'}) async {
    try {
      final fileName = path.basename(file.path);
      final form = FormData.fromMap({
        field: await MultipartFile.fromFile(file.path, filename: fileName),
      });
      final res = await _dio.post('/api/media/upload', data: form);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== WHATSAPP NATIVE CATALOG SHARE ==========

  Future<Map<String, dynamic>> sendWhatsAppCatalog({
    required String conversationId,
    required String type,
    String? productId,
    String? catalogId,
    String? body,
    String? footer,
    String? header,
    String? sectionTitle,
    String? phoneNumberId,
  }) async {
    try {
      final data = <String, dynamic>{
        'conversationId': conversationId,
        'type': type,
        if (productId != null && productId.isNotEmpty) 'productId': productId,
        if (catalogId != null && catalogId.isNotEmpty) 'catalogId': catalogId,
        if (body != null && body.isNotEmpty) 'body': body,
        if (footer != null && footer.isNotEmpty) 'footer': footer,
        if (header != null && header.isNotEmpty) 'header': header,
        if (sectionTitle != null && sectionTitle.isNotEmpty) 'sectionTitle': sectionTitle,
        if (phoneNumberId != null && phoneNumberId.isNotEmpty) 'phoneNumberId': phoneNumberId,
      };
      final res = await _dio.post('/api/catalogs/whatsapp/send', data: data);
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== CATALOG PRODUCT URL FETCH ==========

  Future<Map<String, dynamic>> fetchProductFromUrl(String url) async {
    try {
      final res = await _dio.post('/api/catalogs/fetch-product', data: {'url': url.trim()});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      return _handleError(e);
    }
  }

  // ========== HELPERS ==========

  Map<String, dynamic> _handleError(DioException e) {
    if (e.response != null && e.response!.data is Map) {
      return e.response!.data;
    }
    return {'error': e.message ?? 'ÃÂ ÃÂ¤ÃÂÃÂ ÃÂ¥ÃÂÃÂ ÃÂ¤ÃÂ ÃÂ ÃÂ¤ÃÂÃÂ ÃÂ¤ÃÂ¡ÃÂ ÃÂ¤ÃÂ¼ÃÂ ÃÂ¤ÃÂ¬ÃÂ ÃÂ¤ÃÂ¡ÃÂ ÃÂ¤ÃÂ¼ ÃÂ ÃÂ¤ÃÂ¹ÃÂ ÃÂ¥ÃÂ ÃÂ ÃÂ¤ÃÂÃÂ ÃÂ¤ÃÂ'};
  }
}
