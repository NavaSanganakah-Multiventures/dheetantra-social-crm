import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'send_new_message_screen.dart';
import 'send_template_screen.dart';
import 'email_compose_screen.dart';
import 'twilio_settings_screen.dart';
import 'plivo_settings_screen.dart';

class IntegrationsScreen extends StatelessWidget {
  const IntegrationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tools & Integrations'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _ToolCard(
            icon: Icons.message_outlined,
            iconColor: AppColors.whatsapp,
            title: 'Send WhatsApp to a new number',
            subtitle: 'Send a message directly without creating a contact',
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
            title: 'Send WhatsApp template',
            subtitle: 'Meta-approved template to a specific number',
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SendTemplateScreen()),
              );
            },
          ),
          const SizedBox(height: 12),
          _ToolCard(
            icon: Icons.phone_in_talk_outlined,
            iconColor: const Color(0xFFF472B6),
            title: 'Twilio Voice',
            subtitle: 'Manage Workspace Twilio Account and From Numbers',
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const TwilioSettingsScreen()),
              );
            },
          ),
          const SizedBox(height: 12),
          _ToolCard(
            icon: Icons.phone_callback_outlined,
            iconColor: const Color(0xFF34D399),
            title: 'Plivo Voice',
            subtitle: 'Manage Workspace Plivo Account, From Numbers and Agent Phone',
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PlivoSettingsScreen()),
              );
            },
          ),
          const SizedBox(height: 12),
          _ToolCard(
            icon: Icons.email_outlined,
            iconColor: const Color(0xFF60A5FA),
            title: 'Send Email',
            subtitle: 'Send email from the Workspace\'s verified domain',
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
