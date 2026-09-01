import 'dart:async';

import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'home_shell.dart';
import 'register_screen.dart';

import '../widgets/responsive_layout.dart';

class LoginScreen extends StatefulWidget {
  static const routeName = '/login';

  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _otpControllers = List.generate(6, (_) => TextEditingController());
  final _otpFocusNodes = List.generate(6, (_) => FocusNode());
  bool _loading = false;
  String _step = 'email'; // 'email' or 'otp'
  String? _message;
  bool _isError = false;
  int _resendCooldown = 0;
  Timer? _resendTimer;

  static final _emailRegex = RegExp(r'^[\w\.\-+]+@[\w\-]+(\.[\w\-]+)+$');

  @override
  void dispose() {
    _resendTimer?.cancel();
    _emailController.dispose();
    for (final c in _otpControllers) {
      c.dispose();
    }
    for (final f in _otpFocusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  void _startResendCooldown() {
    _resendTimer?.cancel();
    // Backend cooldown is 60s (authRoutes.ts) — UI must match or resends get 429.
    setState(() => _resendCooldown = 60);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_resendCooldown <= 1) {
        timer.cancel();
        setState(() => _resendCooldown = 0);
      } else {
        setState(() => _resendCooldown--);
      }
    });
  }

  Future<void> _sendOtp() async {
    FocusScope.of(context).unfocus();
    final email = _emailController.text.trim();
    if (email.isEmpty) {
      _showMessage('Please enter your email', true);
      return;
    }
    if (!_emailRegex.hasMatch(email)) {
      _showMessage('Please enter a valid email address', true);
      return;
    }

    setState(() => _loading = true);
    final result = await ApiService().sendOtp(email);
    if (!mounted) return;
    setState(() => _loading = false);

    if (result['error'] != null) {
      _showMessage(result['error'], true);
    } else {
      setState(() => _step = 'otp');
      _showMessage('OTP sent to your email', false);
      _startResendCooldown();
      Future.delayed(const Duration(milliseconds: 100), () {
        if (mounted) _otpFocusNodes[0].requestFocus();
      });
    }
  }

  Future<void> _verifyOtp() async {
    FocusScope.of(context).unfocus();
    final otp = _otpControllers.map((c) => c.text).join();
    if (otp.length != 6) {
      _showMessage('Please enter the 6-digit OTP', true);
      return;
    }

    setState(() => _loading = true);
    final result = await ApiService().verifyOtp(_emailController.text.trim(), otp);
    if (!mounted) return;
    setState(() => _loading = false);

    if (result['error'] != null) {
      _showMessage(result['error'], true);
      for (final c in _otpControllers) {
        c.clear();
      }
      _otpFocusNodes[0].requestFocus();
    } else {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomeShell()),
        (route) => false,
      );
    }
  }

  void _showMessage(String msg, bool error) {
    setState(() {
      _message = msg;
      _isError = error;
    });
  }

  void _onOtpChanged(int index, String value) {
    if (value.length == 1 && index < 5) {
      _otpFocusNodes[index + 1].requestFocus();
    }
    if (value.isEmpty && index > 0) {
      _otpFocusNodes[index - 1].requestFocus();
    }
    // Auto-submit when all 6 digits are entered
    if (index == 5 && value.isNotEmpty) {
      final otp = _otpControllers.map((c) => c.text).join();
      if (otp.length == 6) {
        _verifyOtp();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ResponsiveLayout(
        child: SafeArea(
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
                    'Welcome back!',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.3,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _step == 'email'
                        ? 'Enter your email to log in to your DheeTantra account.'
                        : '${_emailController.text.trim()} - enter the code sent here',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13, height: 1.5),
                  ),
                  const SizedBox(height: 28),
                  if (_step == 'email') ...[
                    TextField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      onSubmitted: (_) => _sendOtp(),
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(Icons.mail_outline_rounded, color: AppColors.textMuted),
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _loading ? null : _sendOtp,
                      child: _loading
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                            )
                          : const Text('Send OTP'),
                    ),
                  ] else ...[
                    // Responsive OTP boxes: size adapts to screen width.
                    LayoutBuilder(
                      builder: (context, constraints) {
                        const gap = 8.0;
                        final boxWidth = (constraints.maxWidth - gap * 5) / 6;
                        return Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: List.generate(6, (i) {
                            return Container(
                              width: boxWidth,
                              height: 54,
                              margin: EdgeInsets.only(right: i < 5 ? gap : 0),
                              child: TextField(
                                controller: _otpControllers[i],
                                focusNode: _otpFocusNodes[i],
                                keyboardType: TextInputType.number,
                                textAlign: TextAlign.center,
                                maxLength: 1,
                                onChanged: (v) => _onOtpChanged(i, v),
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.textPrimary,
                                ),
                                decoration: const InputDecoration(
                                  counterText: '',
                                  contentPadding: EdgeInsets.symmetric(vertical: 14),
                                ),
                              ),
                            );
                          }),
                        );
                      },
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _loading ? null : _verifyOtp,
                      child: _loading
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                            )
                          : const Text('Log in'),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        TextButton(
                          onPressed: _resendCooldown > 0 || _loading
                              ? null
                              : _sendOtp,
                          style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                          child: Text(
                            _resendCooldown > 0
                                ? 'Resend ($_resendCooldown sec)'
                                : 'Resend OTP',
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: () {
                            setState(() {
                              _step = 'email';
                              _message = null;
                              for (final c in _otpControllers) {
                                c.clear();
                              }
                            });
                          },
                          style: TextButton.styleFrom(foregroundColor: AppColors.textMuted),
                          child: const Text('Change email', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                  ],
                  if (_message != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: _isError
                            ? AppColors.danger.withValues(alpha: 0.1)
                            : AppColors.success.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        _message!,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: _isError ? AppColors.danger : AppColors.success,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        'Don't have an account?',
                        style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                      ),
                      TextButton(
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const RegisterScreen()),
                          );
                        },
                        style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                        child: const Text('Create one', style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
