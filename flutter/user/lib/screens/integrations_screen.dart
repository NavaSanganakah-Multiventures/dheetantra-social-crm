import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'send_new_message_screen.dart';
import 'send_template_screen.dart';
import 'email_compose_screen.dart';

class IntegrationsScreen extends StatelessWidget {
  const IntegrationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('टूल्स और इंटीग्रेशन्स'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _ToolCard(
            icon: Icons.message_outlined,
            iconColor: AppColors.whatsapp,
            title: 'नए नंबर पर WhatsApp भेजें',
            subtitle: 'संपर्क बनाए बिना सीधे संदेश भेजें',
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SendNewMessageScreen()),
              );
            },
          ),
          const SizedBox(height: 12),
          _ToolCard(
            icon: Icons.description_outlined,
            iconColor: AppColors.accent,
            title: 'WhatsApp टेम्प्लेट भेजें',
            subtitle: 'Meta-approved टेम्प्लेट विशेष नंबर पर',
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SendTemplateScreen()),
              );
            },
          ),
          const SizedBox(height: 12),
          _ToolCard(
            icon: Icons.email_outlined,
            iconColor: const Color(0xFF60A5FA),
            title: 'Email भेजें',
            subtitle: 'Workspace के वेरिफाइड डोमेन से ईमेल भेजें',
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const EmailComposeScreen()),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ToolCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ToolCard({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconColor),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
