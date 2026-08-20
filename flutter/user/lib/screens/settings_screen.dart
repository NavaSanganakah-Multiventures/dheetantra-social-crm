import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_service.dart';
import '../services/fcm_service.dart';
import '../services/notification_center.dart';
import '../services/websocket_service.dart';
import '../services/battery_optimization_service.dart';
import '../services/foreground_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'login_screen.dart';
import 'workspace_screen.dart';
import 'whatsapp_accounts_screen.dart';
import 'integrations_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  static const _notificationsPref = 'notifications_enabled';
  static const _callsPref = 'calls_enabled';

  bool _notifications = true;
  bool _callsEnabled = true;
  bool _loading = true;
  bool _savingNotifications = false;
  bool _testingPush = false;
  String _userName = '';
  String _userEmail = '';
  String _userRole = 'member';

  @override
  void initState() {
    super.initState();
    _loadUserData();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _notifications = prefs.getBool(_notificationsPref) ?? true;
      _callsEnabled = prefs.getBool(_callsPref) ?? true;
    });
  }

  Future<void> _loadUserData() async {
    final api = ApiService();
    final user = await api.getMe();
    if (!mounted) return;
    setState(() {
      _userName = user?['name'] ?? 'User';
      _userEmail = user?['email'] ?? '';
      _userRole = user?['role'] ?? 'member';
      _loading = false;
    });
  }

  Future<void> _setNotifications(bool enabled) async {
    setState(() {
      _notifications = enabled;
      _savingNotifications = true;
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_notificationsPref, enabled);
    await FcmService().setEnabled(enabled);
    if (!mounted) return;
    setState(() => _savingNotifications = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(enabled ? 'पुश नोटिफिकेशन्स चालू' : 'पुश नोटिफिकेशन्स बंद'),
      ),
    );
  }

  Future<void> _setCallsEnabled(bool enabled) async {
    setState(() => _callsEnabled = enabled);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_callsPref, enabled);
  }

  Future<void> _requestBatteryOptimization() async {
    if (kIsWeb || !Platform.isAndroid) return;
    try {
      final status = await Permission.ignoreBatteryOptimizations.status;
      if (status.isDenied || status.isRestricted) {
        final result = await Permission.ignoreBatteryOptimizations.request();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.isGranted
                  ? 'बैटरी ऑप्टिमाइज़ेशन बंद कर दिया गया'
                  : 'सेटिंग्स से बैटरी ऑप्टिमाइज़ेशन बंद करें',
            ),
          ),
        );
      } else {
        await openAppSettings();
      }
    } catch (e) {
      debugPrint('Battery optimization request error: $e');
      await openAppSettings();
    }
  }

  Future<void> _sendTestPush() async {
    setState(() => _testingPush = true);
    final result = await ApiService().testPushNotification();
    if (!mounted) return;
    setState(() => _testingPush = false);

    final success = result['success'] == true;
    final count = result['count'] ?? 0;
    final error = result['error'];
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'टेस्ट push भेजा गया ($count token)'
              : 'टेस्ट push failed: ${error ?? 'unknown'}',
        ),
      ),
    );
  }

  Future<void> _logout() async {
    await FcmService().cleanup();
    WebSocketService().disconnect();
    NotificationCenter().clear();
    await DheetantraForegroundService().stopService();
    await ApiService().logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  bool get _canManageWorkspace {
    return _userRole == 'owner' || _userRole == 'admin';
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
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _userRole.toUpperCase(),
                        style: const TextStyle(
                          color: AppColors.accent,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
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
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const WorkspaceScreen()),
                );
              },
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.smartphone_outlined,
              title: 'WhatsApp अकाउंट्स',
              subtitle: _canManageWorkspace ? 'जोड़ें, संपादित करें, हटाएं' : 'सिर्फ़ देखें',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const WhatsAppAccountsScreen()),
                );
              },
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.integration_instructions_outlined,
              title: 'टूल्स और इंटीग्रेशन्स',
              subtitle: 'Email, Template, नया WhatsApp',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const IntegrationsScreen()),
                );
              },
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
              subtitle: _savingNotifications
                  ? 'सिंक हो रहा है...'
                  : 'नई बातचीत और कॉल्स की पुश सूचना',
              value: _notifications,
              onChanged: _savingNotifications ? (_) {} : _setNotifications,
            ),
            const Divider(height: 1, indent: 52),
            _SettingsSwitchTile(
              icon: Icons.call_outlined,
              title: 'कॉलिंग सक्षम',
              subtitle: 'WhatsApp कॉल्स प्राप्त करें',
              value: _callsEnabled,
              onChanged: _setCallsEnabled,
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.battery_charging_full_outlined,
              title: 'बैटरी ऑप्टिमाइज़ेशन',
              subtitle: 'Background में चालू रखने के लिए',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: () {
                BatteryOptimizationService().showOptimizationDialog(context);
              },
            ),
            const Divider(height: 1, indent: 52),
            const _SettingsTile(
              icon: Icons.dark_mode_outlined,
              title: 'थीम',
              subtitle: 'डार्क मोड (डिफ़ॉल्ट)',
              trailing: Icon(Icons.check_rounded, color: AppColors.accent, size: 20),
              onTap: null,
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.battery_saver_outlined,
              title: 'बैटरी ऑप्टिमाइज़ेशन',
              subtitle: 'ऐप बंद होने पर भी नोटिफिकेशन पाने के लिए',
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
              onTap: _requestBatteryOptimization,
            ),
            const Divider(height: 1, indent: 52),
            _SettingsTile(
              icon: Icons.notifications_active_outlined,
              title: 'टेस्ट पुश नोटिफिकेशन',
              subtitle: 'FCM push instantly check करें',
              trailing: _testingPush
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_outlined, color: AppColors.textMuted),
              onTap: _testingPush ? null : _sendTestPush,
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
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget trailing;
  final VoidCallback? onTap;

  const _SettingsTile({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.trailing,
    this.onTap,
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
