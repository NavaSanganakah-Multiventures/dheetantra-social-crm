import 'package:flutter/material.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const CRMApp());
}

class CRMApp extends StatelessWidget {
  const CRMApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CRM App',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: const LoginScreen(),
    );
  }
}
