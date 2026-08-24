import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class CallerCardScreen extends StatefulWidget {
  final String phone;

  const CallerCardScreen({super.key, required this.phone});

  @override
  State<CallerCardScreen> createState() => _CallerCardScreenState();
}

class _CallerCardScreenState extends State<CallerCardScreen> {
  bool _loading = true;
  Map<String, dynamic> _card = {};
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await ApiService().getCallerCard(widget.phone);
    if (!mounted) return;
    if (data['error'] != null) {
      setState(() { _error = data['error'].toString(); _loading = false; });
      return;
    }
    setState(() { _card = data; _loading = false; });
  }

  @override
  Widget build(BuildContext context) {
    final found = _card['found'] == true;
    final name = found ? (_card['name']?.toString() ?? widget.phone) : widget.phone;
    final leadStatus = _card['leadStatus']?.toString();
    final email = _card['email']?.toString();
    final notes = _card['notes']?.toString();
    final lastMessage = _card['lastMessage'] as Map<String, dynamic>?;
    final callStats = _card['callStats'] as Map<String, dynamic>?;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Incoming caller'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      children: [
                        Avatar(name: name, size: 72),
                        const SizedBox(height: 14),
                        Text(
                          name,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          widget.phone,
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
                        ),
                        if (leadStatus != null && leadStatus.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          _Badge(leadStatus),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (!found)
                    _InfoCard(
                      icon: Icons.person_off_outlined,
                      title: 'नया नंबर',
                      subtitle: 'यह नंबर CRM में नहीं मिला',
                    )
                  else ...[
                    if (email != null && email.isNotEmpty)
                      _InfoCard(
                        icon: Icons.email_outlined,
                        title: email,
                        subtitle: 'Email',
                      ),
                    if (lastMessage != null)
                      _InfoCard(
                        icon: Icons.message_outlined,
                        title: lastMessage['content']?.toString() ?? '',
                        subtitle: 'Last message on ${lastMessage['platform']?.toString() ?? ''}',
                      ),
                    if (callStats != null)
                      _InfoCard(
                        icon: Icons.call_outlined,
                        title: '${callStats['totalCalls'] ?? 0} calls',
                        subtitle: 'Total duration: ${_fmtDuration(callStats['totalDurationSeconds'] ?? 0)}',
                      ),
                    if (notes != null && notes.isNotEmpty)
                      _InfoCard(
                        icon: Icons.notes_outlined,
                        title: notes,
                        subtitle: 'Notes',
                      ),
                  ],
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () async {
                            final contactId = _card['contactId']?.toString();
                            if (contactId == null) return;
                            final result = await ApiService().initiateConversation(contactId);
                            if (!mounted) return;
                            final conv = result['conversation'];
                            if (conv is Map<String, dynamic>) {
                              Navigator.push(
                                context,
                                MaterialPageRoute(builder: (_) => ChatScreen(conversation: Conversation.fromJson(conv))),
                              );
                            }
                          },
                          icon: const Icon(Icons.chat_bubble_outline),
                          label: const Text('Chat'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                          },
                          icon: const Icon(Icons.close),
                          label: const Text('Close'),
                        ),
                      ),
                    ],
                  ),
                  if (_error.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                        _error,
                        style: const TextStyle(color: AppColors.danger),
                      ),
                    ),
                ],
              ),
            ),
    );
  }

  String _fmtDuration(int seconds) {
    if (seconds <= 0) return '0s';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    if (m == 0) return '${s}s';
    return '${m}m ${s.toString().padLeft(2, '0')}s';
  }
}

class _Badge extends StatelessWidget {
  final String label;
  const _Badge(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          color: AppColors.accent,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _InfoCard({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.textSecondary, size: 22),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
