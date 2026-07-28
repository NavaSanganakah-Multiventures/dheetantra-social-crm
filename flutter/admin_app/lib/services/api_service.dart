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

    // Interceptor to attach auth session cookie if available
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final session = prefs.getString('auth_session');
        if (session != null) {
          options.headers['Cookie'] = 'auth_session=$session';
        }
        return handler.next(options);
      },
      onResponse: (response, handler) async {
        // Automatically save session cookie if returned
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

  Future<Response> sendOtp(String email) async {
    return _dio.post('/auth/send-otp', data: {'email': email});
  }

  Future<Response> verifyOtp(String email, String otp) async {
    return _dio.post('/auth/verify-otp', data: {'email': email, 'otp': otp});
  }

  Future<Response> getUserProfile() async {
    return _dio.get('/auth/me');
  }
}
