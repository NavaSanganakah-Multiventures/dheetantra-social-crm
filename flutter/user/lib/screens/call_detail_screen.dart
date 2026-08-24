import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'chat_screen.dart';

class CallDetailScreen extends StatefulWidget {
  final String callId;
  final String source;

  const CallDetailScreen({
    super.key,
    required this.callId,
    required this.source,
  });

  @override
  State<CallDetailScreen> createState() => _CallDetailScreenState();
}

class _CallDetailScreenState extends State<CallDetailScreen> {
  bool _loading = true;
  Map<String, dynamic> _call = {};
  final TextEditingController _notesController = TextEditingController();
  bool _saving = false;
  final AudioPlayer _player = AudioPlayer();
  bool _isPlaying = false;
  bool _audioLoading = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
    _player.onPlayerStateChanged.listen((s) {
      if (mounted) setState(() => _isPlaying = s == PlayerState.playing);
    });
  }

  @override
  void dispose() {
    _player.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final data = await ApiService().getCallDetail(widget.callId);
    if (!mounted) return;
    if (data['error'] != null) {
      setState(() { _error = data['error'].toString(); _loading = false; });
      return;
    }
    final call = (data['call'] ?? {}) as Map<String, dynamic>;
    _notesController.text = (call['notes'] ?? '').toString();
    setState(() { _call = call; _loading = false; });
  }

  Future<void> _saveNotes() async {
    setState(() => _saving = true);
    final res = await ApiService().updateCallNotes(widget.callId, _notesController.text);
    if (!mounted) return;
    setState(() => _saving = false);
    if (res['success'] == true) {
      _showSnack('Notes saved');
      _load();
    } else {
      _showSnack('Failed to save notes');
    }
  }

  Future<void> _togglePlayback() async {
    if (_isPlaying) {
      await _player.pause();
      return;
    }
    final hasUrl = _call['recording_url'] != null && _call['recording_url'].toString().isNotEmpty;
    if (!hasUrl) return;
    setState(() => _audioLoading = true);
    try {
      final url = '${ApiService.baseUrl}/api/calls/${widget.callId}/recording';
      final headers = <String, String>{
        'x-workspace-id': ApiService().workspaceId ?? '',
        if (ApiService().sessionId != null)
          'Cookie': 'auth_session=${ApiService().sessionId}',
      };
      await _player.setSourceUrl(url, headers: headers);
      await _player.resume();
    } catch (e) {
      if (mounted) _showSnack('Recording play failed: $e');
    } finally {
      if (mounted) setState(() => _audioLoading = false);
    }
  }

  Future<void> _openChat() async {
    final contactId = _call['contact_id']?.toString();
    if (contactId == null) return;
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

  void _showSnack(String msg) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final name = (_call['contact_name'] ?? _call['name'] ?? 'Unknown').toString();
    final phone = (_call['phone'] ?? _call['caller_number'] ?? '').toString();
    final direction = (_call['direction'] ?? 'incoming').toString();
    final status = (_call['status'] ?? '').toString();
    final duration = _toInt(_call['duration'] ?? _call['duration_seconds'] ?? 0);
    final createdAt = _parseDate(_call['created_at'] ?? _call['started_at']);
    final hasRecording = _call['recording_url'] != null && _call['recording_url'].toString().isNotEmpty;
    final summary = _call['summary']?.toString();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Call Detail'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _HeaderCard(
              name: name,
              phone: phone,
              source: widget.source,
              direction: direction,
              status: status,
              duration: duration,
              createdAt: createdAt,
            ),
            const SizedBox(height: 20),
            if (hasRecording)
              _ActionCard(
                icon: _audioLoading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Icon(_isPlaying ? Icons.pause : Icons.play_arrow, color: AppColors.accent),
                title: _isPlaying ? 'Pause recording' : 'Play recording',
                subtitle: 'Tap to listen to the attached recording',
                onTap: _audioLoading ? null : _togglePlayback,
              ),
            if (summary != null && summary.isNotEmpty) ...[
              const SizedBox(height: 12),
              _SummaryCard(summary),
            ],
            const SizedBox(height: 20),
            const Text(
              'Notes',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _notesController,
              maxLines: 5,
              decoration: InputDecoration(
                filled: true,
                fillColor: AppColors.surface,
                hintText: 'Call notes / follow-ups...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.border),
                ),
              ),
              style: const TextStyle(color: AppColors.textPrimary),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: _saving ? null : _saveNotes,
                    child: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Save Notes'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _openChat,
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const Text('Open Chat'),
                  ),
                ),
              ],
            ),
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

  int _toInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    return int.tryParse(v.toString()) ?? 0;
  }

  DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    final dt = DateTime.tryParse(v.toString());
    return dt?.toLocal();
  }
}

class _HeaderCard extends StatelessWidget {
  final String name;
  final String phone;
  final String source;
  final String direction;
  final String status;
  final int duration;
  final DateTime? createdAt;

  const _HeaderCard({
    required this.name,
    required this.phone,
    required this.source,
    required this.direction,
    required this.status,
    required this.duration,
    required this.createdAt,
  });

  @override
  Widget build(BuildContext context) {
    final isGsm = source == 'gsm';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isGsm
                      ? AppColors.accent.withValues(alpha: 0.12)
                      : AppColors.success.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  isGsm ? 'GSM' : 'WhatsApp',
                  style: TextStyle(
                    color: isGsm ? AppColors.accent : AppColors.success,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
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
          Text(phone, style: const TextStyle(color: AppColors.textSecondary, fontSize: 16)),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _DetailItem(
                icon: direction == 'outgoing' ? Icons.call_made : Icons.call_received,
                label: direction == 'outgoing' ? 'Outgoing' : 'Incoming',
              ),
              _DetailItem(
                icon: Icons.timer_outlined,
                label: durationLabel(duration),
              ),
              _DetailItem(
                icon: Icons.info_outline,
                label: status.toUpperCase(),
              ),
            ],
          ),
          if (createdAt != null) ...[
            const SizedBox(height: 12),
            Text(
              '${createdAt.toLocal()}',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailItem extends StatelessWidget {
  final IconData icon;
  final String label;
  const _DetailItem({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: AppColors.accent, size: 18),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
        ),
      ],
    );
  }
}

class _ActionCard extends StatelessWidget {
  final Widget icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            icon,
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
                  Text(
                    subtitle,
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String summary;
  const _SummaryCard(this.summary);

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome, color: AppColors.success, size: 18),
              const SizedBox(width: 8),
              const Text(
                'AI Summary',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            summary,
            style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
          ),
        ],
      ),
    );
  }
}