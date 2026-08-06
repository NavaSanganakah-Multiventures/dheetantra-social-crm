import 'package:flutter/material.dart';

import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const DheeTantraApp());
}

class DheeTantraApp extends StatelessWidget {
  const DheeTantraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DheeTantra',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      home: const SplashScreen(),
      routes: {
        LoginScreen.routeName: (_) => const LoginScreen(),
      },
    );
  }
}
