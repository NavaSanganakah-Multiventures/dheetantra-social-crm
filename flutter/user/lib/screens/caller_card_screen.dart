import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'after_call_screen.dart';
import 'call_detail_screen.dart';
import 'chat_screen.dart';

class CallerCardScreen extends StatefulWidget {
  final String phone;

  const CallerCardScreen({super.key, required this.phone});

  @override
  State<CallerCardScreen> createState() => _CallerCardScreenState();
}

class _CallerCardScreenState extends State<CallerCardScreen> {
  bool _loading = true;
  Map<String, dynamic> _card = {};
  List<Map<String, dynamic>> _recentCalls = [];
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
    _card = data;
    final calls = await ApiService().getUnifiedCalls(phone: widget.phone, limit: 20);
    if (!mounted) return;
    setState(() {
      _recentCalls = calls.cast<Map<String, dynamic>>();
      _loading = false;
    });
  }

  Future<void> _openChat() async {
    final contactId = _card['contactId']?.toString();
    if (contactId == null || contactId.isEmpty) return;
    final res = await ApiService().initiateConversation(contactId);
    if (!mounted) return;
    final conv = res['conversation'];
    if (conv is Map<String, dynamic>) {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ChatScreen(conversation: Conversation.fromJson(conv))),
      );
    }
  }

  Future<void> _openAfterCall() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AfterCallScreen(phone: widget.phone)),
    );
    if (mounted) _load();
  }

  Future<void> _openCallDetail(Map<String, dynamic> call) async {
    final id = call['id']?.toString();
    final source = (call['source'] ?? 'gsm').toString();
    if (id == null) return;
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => CallDetailScreen(callId: id, source: source)),
    );
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final found = _card['found'] == true;
    final name = found ? (_card['name']?.toString() ?? widget.phone) : widget.phone;
    final phone = _card['phone']?.toString() ?? widget.phone;
    final leadStatus = _card['leadStatus']?.toString();
    final tags = (_card['tags'] as List?)?.map((e) => e.toString()).toList() ?? [];
    final email = _card['email']?.toString();
    final notes = _card['notes']?.toString();
    final lastMessage = _card['lastMessage'] as Map<String, dynamic>?;
    final callStats = _card['callStats'] as Map<String, dynamic>?;
    final totalCalls = callStats?['totalCalls'] ?? 0;
    final totalDuration = callStats?['totalDurationSeconds'] ?? 0;
    final lastCallAt = _parseDate(callStats?['lastCallAt']);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('आने वाला कॉलर'),
        actions: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
      body: SingleChildScrollView(
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
                  Avatar(name: name, size: 80),
                  const SizedBox(height: 16),
                  Text(
                    name,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    phone,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      if (leadStatus != null && leadStatus.isNotEmpty)
                        _Badge(leadStatus),
                      ...tags.map((t) => _Badge(t)),
                      if (!found)
                        const _Badge('नया नंबर', color: AppColors.danger),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _StatCard(label: 'कुल कॉल', value: '$totalCalls'),
                const SizedBox(width: 10),
                _StatCard(label: 'कुल अवधि', value: _fmtDuration(totalDuration)),
                const SizedBox(width: 10),
                _StatCard(
                  label: 'अंतिम कॉल',
                  value: lastCallAt == null ? '-' : timeLabel(lastCallAt),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _openAfterCall,
                    icon: const Icon(Icons.edit_note),
                    label: const Text('नोट्स / CRM जोड़ें'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _openChat,
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const Text('चैट'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            if (email != null && email.isNotEmpty) ...[
              _SectionTitle('ईमेल'),
              _InfoCard(icon: Icons.email_outlined, text: email),
            ],
            if (notes != null && notes.isNotEmpty) ...[
              _SectionTitle('संपर्क नोट्स'),
              _InfoCard(icon: Icons.notes_outlined, text: notes),
            ],
            if (lastMessage != null) ...[
              _SectionTitle('अंतिम संदेश'),
              _InfoCard(
                icon: Icons.message_outlined,
                text: lastMessage['content']?.toString() ?? '',
                subtext: lastMessage['platform']?.toString() ?? '',
              ),
            ],
            _SectionTitle('हाल की कॉल हिस्ट्री'),
            if (_recentCalls.isEmpty)
              const _InfoCard(
                icon: Icons.call_outlined,
                text: 'इस नंबर के लिए कोई कॉल नहीं मिली',
                subtext: '',
              )
            else
              ..._recentCalls.map((c) => _CallHistoryTile(call: c, onTap: () => _openCallDetail(c))),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(_error, style: const TextStyle(color: AppColors.danger)),
              ),
          ],
        ),
      ),
    );
  }

  DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    final dt = DateTime.tryParse(v.toString());
    return dt?.toLocal();
  }
}

class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  const _Badge(this.label, {this.color = AppColors.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  const _StatCard({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle(this.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 20),
      child: Text(
        title,
        style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String text;
  final String subtext;
  const _InfoCard({required this.icon, required this.text, this.subtext = ''});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.textSecondary, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  text,
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                ),
                if (subtext.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(subtext, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CallHistoryTile extends StatelessWidget {
  final Map<String, dynamic> call;
  final VoidCallback onTap;
  const _CallHistoryTile({required this.call, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final direction = (call['direction'] ?? 'incoming').toString();
    final status = (call['status'] ?? '').toString();
    final date = call['created_at'] != null ? DateTime.tryParse(call['created_at'].toString())?.toLocal() : null;
    final duration = call['duration'] ?? call['duration_seconds'] ?? 0;
    final hasRecording = call['recording_url'] != null && call['recording_url'].toString().isNotEmpty;
    final hasSummary = call['summary'] != null && call['summary'].toString().isNotEmpty;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Icon(
              direction == 'outgoing' ? Icons.call_made : Icons.call_received,
              color: AppColors.accent,
              size: 18,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    status.isEmpty ? (direction == 'outgoing' ? 'आउटगोइंग' : 'इनकमिंग') : status,
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    date == null ? '-' : timeLabel(date),
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                  ),
                ],
              ),
            ),
            Row(
              children: [
                if (hasRecording) const Icon(Icons.mic, color: AppColors.accent, size: 14),
                if (hasSummary) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.auto_awesome, color: AppColors.success, size: 14),
                ],
                const SizedBox(width: 8),
                Text(
                  durationLabel(duration),
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _fmtDuration(int seconds) {
  if (seconds <= 0) return '0s';
  final m = seconds ~/ 60;
  final s = seconds % 60;
  if (m == 0) return '${s}s';
  return '${m}m ${s.toString().padLeft(2, '0')}s';
}