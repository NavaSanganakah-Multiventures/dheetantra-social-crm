import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _notifications = true;
  bool _callsEnabled = true;
  bool _darkMode = true;
  String _userName = '';
  String _userEmail = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadUserData();
  }

  Future<void> _loadUserData() async {
    final api = ApiService();
    final user = await api.getMe();
    if (!mounted) return;
    setState(() {
      _userName = user?['name'] ?? 'User';
      _userEmail = user?['email'] ?? '';
      _loading = false;
    });
  }

  Future<void> _logout() async {
    await ApiService().logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Avatar(name: _userName, size: 54),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _userName,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _userEmail,
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.edit_outlined, color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        const _SectionLabel('वर्कस्पेस'),
        const SizedBox(height: 10),
        _SettingsCard(
          children: [
            _SettingsTile(
              icon: Icons.business_center_outlined,
              title: 'मेरा वर्कस्पेस',
              subtitle: ApiService().workspaceId != null
                  ? 'ID: ${ApiService().workspaceId!.substring(0, 8)}...'
                  : 'कनेक्ट नहीं',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {},
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.smartphone_outlined,
              title: 'WhatsApp अकाउंट्स',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {},
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.integration_instructions_outlined,
              title: 'इंटीग्रेशन्स',
              subtitle: 'WhatsApp, Email',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {},
            ),
          ],
        ),
        const SizedBox(height: 24),
        const _SectionLabel('सामान्य'),
        const SizedBox(height: 10),
        _SettingsCard(
          children: [
            _SettingsSwitchTile(
              icon: Icons.notifications_outlined,
              title: 'नोटिफिकेशन्स',
              subtitle: 'नई बातचीत और कॉल्स की सूचना',
              value: _notifications,
              onChanged: (v) => setState(() => _notifications = v),
            ),
            const Divider(height: 1, indent: 52),
            _SettingsSwitchTile(
              icon: Icons.call_outlined,
              title: 'कॉलिंग सक्षम',
              subtitle: 'WhatsApp कॉल्स प्राप्त करें',
              value: _callsEnabled,
              onChanged: (v) => setState(() => _callsEnabled = v),
            ),
            const Divider(height: 1, indent: 52),
            _SettingsSwitchTile(
              icon: Icons.dark_mode_outlined,
              title: 'डार्क मोड',
              subtitle: 'थीम बदलें',
              value: _darkMode,
              onChanged: (v) => setState(() => _darkMode = v),
            ),
          ],
        ),
        const SizedBox(height: 24),
        const _SectionLabel('सहायता'),
        const SizedBox(height: 10),
        _SettingsCard(
          children: [
            _SettingsTile(
              icon: Icons.help_outline_rounded,
              title: 'सहायता केंद्र',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {},
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.assignment_outlined,
              title: 'नियम और शर्तें',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {},
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.privacy_tip_outlined,
              title: 'गोपनीयता नीति',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {},
            ),
          ],
        ),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: _logout,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.danger,
            side: BorderSide(color: AppColors.danger.withValues(alpha: 0.5)),
          ),
          icon: const Icon(Icons.logout_rounded, size: 18),
          label: const Text('लॉगआउट'),
        ),
        const SizedBox(height: 16),
        const Center(
          child: Text(
            'DheeTantra v1.0.0',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;

  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.textMuted,
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5,
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  final List<Widget> children;

  const _SettingsCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(children: children),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget trailing;
  final VoidCallback onTap;

  const _SettingsTile({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.trailing,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: AppColors.textSecondary, size: 18),
      ),
      title: Text(
        title,
        style: const TextStyle(
          color: AppColors.textPrimary,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle!,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
      trailing: trailing,
    );
  }
}

class _SettingsSwitchTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _SettingsSwitchTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: AppColors.textSecondary, size: 18),
      ),
      title: Text(
        title,
        style: const TextStyle(
          color: AppColors.textPrimary,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
      ),
      trailing: Switch(
        value: value,
        onChanged: onChanged,
        activeTrackColor: AppColors.accent,
      ),
    );
  }
}
