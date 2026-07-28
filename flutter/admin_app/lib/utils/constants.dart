class Constants {
  // Replace with your actual backend URL for local testing
  static const String baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000/api');

  // App signature passed during build using --dart-define=APP_SIGNATURE=your_secret
  static const String appSignature = String.fromEnvironment('APP_SIGNATURE', defaultValue: '');
}
