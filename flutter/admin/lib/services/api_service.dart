import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../core/constants.dart';
import '../models/models.dart';

class ApiService {
  static const String _authUrl = 'https://dheetantra.navasanganakah.com/api/auth';
  
  static Future<Map<String, String>> _getHeaders() async {
    final prefs = await SharedPreferences.getInstance();
    final cookie = prefs.getString('auth_session');
    
    return {
      'Content-Type': 'application/json',
      if (cookie != null) 'Cookie': 'auth_session=$cookie',
    };
  }

  // --- Auth Flow ---

  static Future<bool> sendOtp(String email) async {
    try {
      final response = await http.post(
        Uri.parse('$_authUrl/send-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'type': 'login'}),
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        return true;
      } else {
        final errorMsg = jsonDecode(response.body)['error'] ?? 'Unknown error';
        throw Exception(errorMsg);
      }
    } catch (e) {
      throw Exception('Failed to send OTP: $e');
    }
  }

  static Future<bool> verifyOtp(String email, String otp) async {
    try {
      final response = await http.post(
        Uri.parse('$_authUrl/verify-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'otp': otp}),
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        // Extract set-cookie header to get auth_session
        final rawCookie = response.headers['set-cookie'];
        if (rawCookie != null) {
          final sessionPart = rawCookie.split(';').firstWhere((p) => p.trim().startsWith('auth_session='), orElse: () => '');
          if (sessionPart.isNotEmpty) {
            final sessionToken = sessionPart.split('=')[1];
            final prefs = await SharedPreferences.getInstance();
            await prefs.setString('auth_session', sessionToken);
          }
        }
        return true;
      } else {
        final errorMsg = jsonDecode(response.body)['error'] ?? 'Invalid OTP';
        throw Exception(errorMsg);
      }
    } catch (e) {
      throw Exception('Failed to verify OTP: $e');
    }
  }

  static Future<void> registerFcmToken(String token) async {
    try {
      final headers = await _getHeaders();
      await http.post(
        Uri.parse('https://dheetantra.navasanganakah.com/api/fcm/register'),
        headers: headers,
        body: jsonEncode({'token': token, 'device_type': 'android'}),
      ).timeout(const Duration(seconds: 10));
    } catch (e) {
      print('Failed to register FCM token: $e');
    }
  }

  static Future<void> logout() async {
    try {
      final headers = await _getHeaders();
      
      // Unregister FCM token before logout so we don't get notifications after logging out
      await http.delete(
        Uri.parse('https://dheetantra.navasanganakah.com/api/fcm/register'),
        headers: headers,
      ).timeout(const Duration(seconds: 5));

      // Perform logout
      await http.post(
        Uri.parse('$_authUrl/logout'),
        headers: headers,
      ).timeout(const Duration(seconds: 5));
    } catch (_) {} // Ignore network errors on logout
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_session');
  }

  static Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey('auth_session');
  }

  // --- Data Fetching ---

  static Future<Map<String, dynamic>> fetchStats() async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('${ApiConstants.baseUrl}/stats'),
        headers: headers,
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['stats'] ?? {};
      } else {
        throw Exception('Failed to load stats: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Network error or timeout. Ensure backend is running.');
    }
  }

  static Future<List<UserModel>> fetchUsers() async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('${ApiConstants.baseUrl}/users'),
        headers: headers,
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List<dynamic> usersJson = data['users'] ?? [];
        return usersJson.map((json) => UserModel.fromJson(json)).toList();
      } else {
        throw Exception('Failed to load users: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Network error or timeout. Ensure backend is running.');
    }
  }

  static Future<List<WorkspaceModel>> fetchWorkspaces() async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse('${ApiConstants.baseUrl}/workspaces'),
        headers: headers,
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List<dynamic> workspacesJson = data['workspaces'] ?? [];
        return workspacesJson.map((json) => WorkspaceModel.fromJson(json)).toList();
      } else {
        throw Exception('Failed to load workspaces: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Network error or invalid data');
    }
  }

  static Future<List<SchoolChargeModel>> fetchSchoolCharges() async {
    try {
      final headers = await _getHeaders();
      final response = await http.get(
        Uri.parse(ApiConstants.baseUrl + '/charges'),
        headers: headers,
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List<dynamic> chargesJson = data['charges'] ?? [];
        return chargesJson.map((json) => SchoolChargeModel.fromJson(json)).toList();
      } else {
        throw Exception('Failed to load charges: ' + response.statusCode.toString());
      }
    } catch (e) {
      throw Exception('Network error or invalid data');
    }
  }

  // --- KV Namespace Copy ---

  /// Copies one batch of keys between two KV namespaces.
  /// Returns the response map; the caller keeps calling with `cursor`
  /// until `done` is true.
  static Future<Map<String, dynamic>> copyKv({
    required String sourceNamespaceId,
    required String destNamespaceId,
    String? cursor,
  }) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('${ApiConstants.baseUrl}/kv-copy'),
      headers: headers,
      body: jsonEncode({
        'sourceNamespaceId': sourceNamespaceId,
        'destNamespaceId': destNamespaceId,
        if (cursor != null) 'cursor': cursor,
      }),
    ).timeout(const Duration(seconds: 120));

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200 || data['success'] != true) {
      throw Exception(data['error'] ?? 'KV copy failed (${response.statusCode})');
    }
    return data;
  }
}
