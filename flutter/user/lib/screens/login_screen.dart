import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'home_shell.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  static const routeName = '/login';

  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;
  bool _loading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _login() {
    FocusScope.of(context).unfocus();
    if (_emailController.text.trim().isEmpty || _passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('कृपया ईमेल और पासवर्ड दर्ज करें')),
      );
      return;
    }
    setState(() => _loading = true);
    Future.delayed(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      setState(() => _loading = false);
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomeShell()),
        (route) => false,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    gradient: AppColors.brandGradient,
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.accent.withValues(alpha: 0.3),
                        blurRadius: 28,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.forum_rounded, color: Colors.white, size: 34),
                ),
                const SizedBox(height: 24),
                const Text(
                  'फिर से स्वागत है!',
                  style: TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'अपने वर्कस्पेस में लॉगिन करें',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 14),
                ),
                const SizedBox(height: 36),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'ईमेल',
                    hintText: 'aap@example.com',
                    prefixIcon: Icon(Icons.mail_outline_rounded, color: AppColors.textMuted),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  obscureText: _obscure,
                  onSubmitted: (_) => _login(),
                  decoration: InputDecoration(
                    labelText: 'पासवर्ड',
                    prefixIcon: const Icon(Icons.lock_outline_rounded, color: AppColors.textMuted),
                    suffixIcon: IconButton(
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: Icon(
                        _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        color: AppColors.textMuted,
                        size: 20,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () {},
                    style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                    child: const Text('पासवर्ड भूल गए?', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _loading ? null : _login,
                  child: _loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Text('लॉगिन करें'),
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 14),
                      child: Text('या', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 28),
                OutlinedButton.icon(
                  onPressed: _loading ? null : () {},
                  icon: const Icon(Icons.g_mobiledata_rounded, color: AppColors.textPrimary, size: 26),
                  label: const Text('Google से जारी रखें'),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'नया खाता बनाएं?',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                    ),
                    TextButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const RegisterScreen()),
                        );
                      },
                      style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                      child: const Text('रजिस्टर करें', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
