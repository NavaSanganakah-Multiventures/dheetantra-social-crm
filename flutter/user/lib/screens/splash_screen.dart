import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../services/callkit_service.dart';
import '../theme/app_theme.dart';
import 'home_shell.dart';
import 'login_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    if (!CallKitService().hasPendingAcceptCall) {
      await Future.delayed(const Duration(milliseconds: 1200));
    }
    if (!mounted) return;

    final api = ApiService();
    final user = await api.getMe();

    if (!mounted) return;

    if (user != null && api.workspaceId != null) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeShell()),
      );
    } else {
      Navigator.of(context).pushReplacementNamed(LoginScreen.routeName);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                gradient: AppColors.brandGradient,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.accent.withValues(alpha: 0.35),
                    blurRadius: 32,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: const Icon(Icons.forum_rounded, color: Colors.white, size: 40),
            ),
            const SizedBox(height: 24),
            const Text(
              'DheeTantra',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 28,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Social CRM - stay connected with your customers',
              style: TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 48),
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: AppColors.accent.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
