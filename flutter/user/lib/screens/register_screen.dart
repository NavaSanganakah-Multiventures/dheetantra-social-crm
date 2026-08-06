import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'login_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _workspaceType = 'व्यक्तिगत';

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _register() {
    FocusScope.of(context).unfocus();
    if (_nameController.text.trim().isEmpty ||
        _emailController.text.trim().isEmpty ||
        _phoneController.text.trim().isEmpty ||
        _passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('कृपया सभी फ़ील्ड भरें')),
      );
      return;
    }
    setState(() => _loading = true);
    Future.delayed(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('खाता सफलतापूर्वक बना! अब लॉगिन करें')),
      );
      Navigator.of(context).popUntil((route) => route.isFirst);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('खाता बनाएं')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'DheeTantra में शामिल हों',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'अपना CRM वर्कस्पेस बनाएं और ग्राहकों से WhatsApp, ईमेल और कॉल के ज़रिए जुड़ें।',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13, height: 1.5),
              ),
              const SizedBox(height: 28),
              TextField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'पूरा नाम',
                  prefixIcon: Icon(Icons.person_outline_rounded, color: AppColors.textMuted),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'ईमेल',
                  prefixIcon: Icon(Icons.mail_outline_rounded, color: AppColors.textMuted),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'फ़ोन नंबर',
                  hintText: '+91 98765 43210',
                  prefixIcon: Icon(Icons.phone_outlined, color: AppColors.textMuted),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _passwordController,
                obscureText: _obscure,
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
              const SizedBox(height: 20),
              const Text(
                'वर्कस्पेस प्रकार',
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _WorkspaceTypeCard(
                      icon: Icons.person_outline_rounded,
                      label: 'व्यक्तिगत',
                      selected: _workspaceType == 'व्यक्तिगत',
                      onTap: () => setState(() => _workspaceType = 'व्यक्तिगत'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _WorkspaceTypeCard(
                      icon: Icons.business_center_outlined,
                      label: 'व्यवसाय',
                      selected: _workspaceType == 'व्यवसाय',
                      onTap: () => setState(() => _workspaceType = 'व्यवसाय'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _loading ? null : _register,
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                      )
                    : const Text('खाता बनाएं'),
              ),
              const SizedBox(height: 18),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text(
                    'पहले से खाता है?',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.of(context).pushAndRemoveUntil(
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                        (route) => false,
                      );
                    },
                    style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                    child: const Text('लॉगिन करें', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              const Text(
                'रजिस्टर करके आप हमारी सेवा की शर्तों और गोपनीयता नीति से सहमत होते हैं।',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textMuted, fontSize: 11, height: 1.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WorkspaceTypeCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _WorkspaceTypeCard({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent.withValues(alpha: 0.12) : AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.border,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              color: selected ? AppColors.accent : AppColors.textMuted,
              size: 26,
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(
                color: selected ? AppColors.accent : AppColors.textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
