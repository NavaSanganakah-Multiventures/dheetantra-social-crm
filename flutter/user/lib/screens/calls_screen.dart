import 'dart:async';

import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'call_detail_screen.dart';

class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key});

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  String _sourceFilter = 'all';
  String _statusFilter = 'all';
  String _search = '';
  bool _loading = true;
  List<Map<String, dynamic>> _allCalls = [];

  static const _sourceOptions = ['all', 'whatsapp', 'gsm', 'twilio', 'plivo'];
  static const _statusOptions = ['all', 'incoming', 'outgoing', 'missed', 'busy', 'ended'];

  @override
  void initState() {
    super.initState();
    _loadCalls();
  }

  Future<void> _loadCalls() async {
    setState(() => _loading = true);
    final data = await ApiService().getUnifiedCalls(
      source: _sourceFilter == 'all' ? null : _sourceFilter,
      search: _search.isEmpty ? null : _search,
      limit: 200,
    );
    if (!mounted) return;
    setState(() {
      _allCalls = data.cast<Map<String, dynamic>>();
      _loading = false;
    });
  }

  List<Map<String, dynamic>> get _calls {
    var list = _allCalls;
    if (_statusFilter != 'all') {
      if (_statusFilter == 'incoming') {
        list = list.where((c) => _str(c['direction']) == 'incoming').toList();
      } else if (_statusFilter == 'outgoing') {
        list = list.where((c) => _str(c['direction']) == 'outgoing').toList();
      } else {
        list = list.where((c) => _str(c['status']) == _statusFilter).toList();
      }
    }
    return list;
  }

  String _str(dynamic v) => (v ?? '').toString().toLowerCase();

  @override
  Widget build(BuildContext context) {
    final calls = _calls;
    return Scaffold(
      appBar: AppBar(
        title: const Text('CRM कॉल लॉग्स'),
        actions: [
          IconButton(
            onPressed: _loadCalls,
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              onSubmitted: (_) => _loadCalls(),
              decoration: InputDecoration(
                filled: true,
                fillColor: AppColors.surface,
                hintText: 'नाम या नंबर से खोजें...',
                prefixIcon: const Icon(Icons.search, color: AppColors.textMuted),
                suffixIcon: _search.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, color: AppColors.textMuted),
                        onPressed: () {
                          setState(() => _search = '');
                          _loadCalls();
                        },
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.border),
                ),
              ),
              style: const TextStyle(color: AppColors.textPrimary),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 36,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              scrollDirection: Axis.horizontal,
              itemCount: _sourceOptions.length,
              separatorBuilder: (__, ___) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final f = _sourceOptions[i];
                return FilterChip(
                  label: Text(_sourceLabel(f)),
                  selected: _sourceFilter == f,
                  onSelected: (_) {
                    setState(() => _sourceFilter = f);
                    _loadCalls();
                  },
                  showCheckmark: false,
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 36,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              scrollDirection: Axis.horizontal,
              itemCount: _statusOptions.length,
              separatorBuilder: (__, ___) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final f = _statusOptions[i];
                return FilterChip(
                  label: Text(_statusLabel(f)),
                  selected: _statusFilter == f,
                  onSelected: (_) {
                    setState(() => _statusFilter = f);
                  },
                  showCheckmark: false,
                );
              },
            ),
          ),
          const SizedBox(height: 6),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : calls.isEmpty
                    ? const Center(
                        child: EmptyState(
                          icon: Icons.call_outlined,
                          title: 'कोई कॉल नहीं मिली',
                          subtitle: 'CRM कॉल लॉग्स यहाँ दिखाई देंगे।',
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadCalls,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                          itemCount: calls.length,
                          separatorBuilder: (__, ___) => const SizedBox(height: 8),
                          itemBuilder: (context, i) => _CallTile(call: calls[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  String _sourceLabel(String s) {
    switch (s) {
      case 'whatsapp': return 'WhatsApp';
      case 'gsm': return 'GSM';
      case 'twilio': return 'Twilio';
      case 'plivo': return 'Plivo';
      default: return 'सभी';
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'incoming': return 'आने वाली';
      case 'outgoing': return 'जाने वाली';
      case 'missed': return 'मिस्ड';
      case 'busy': return 'व्यस्त';
      case 'ended': return 'End हुई';
      default: return 'सभी';
    }
  }
}

class _CallTile extends StatelessWidget {
  final Map<String, dynamic> call;

  const _CallTile({required this.call});

  @override
  Widget build(BuildContext context) {
    final name = (call['contact_name'] ?? call['name'] ?? 'Unknown').toString();
    final phone = (call['phone'] ?? call['caller_number'] ?? '').toString();
    final direction = (call['direction'] ?? 'incoming').toString().toLowerCase();
    final status = (call['status'] ?? '').toString().toLowerCase();
    final source = (call['source'] ?? 'whatsapp').toString().toLowerCase();
    final duration = call['duration'] ?? call['duration_seconds'] ?? 0;
    final hasRecording = call['recording_url'] != null && call['recording_url'].toString().isNotEmpty;
    final hasSummary = call['summary'] != null && call['summary'].toString().isNotEmpty;
    final createdAt = _parseDate(call['created_at'] ?? call['started_at']);
    final missed = status == 'missed';
    final busy = status == 'busy';
    final incoming = direction == 'incoming';

    IconData icon;
    Color iconColor;
    if (missed) {
      icon = Icons.call_missed_rounded;
      iconColor = AppColors.danger;
    } else if (busy) {
      icon = Icons.block_rounded;
      iconColor = AppColors.warning;
    } else if (incoming) {
      icon = Icons.call_received_rounded;
      iconColor = AppColors.success;
    } else {
      icon = Icons.call_made_rounded;
      iconColor = AppColors.accent;
    }

    return InkWell(
      onTap: () {
        final callId = call['id']?.toString();
        if (callId == null) return;
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => CallDetailScreen(callId: callId, source: source)),
        );
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: missed
                ? AppColors.danger.withValues(alpha: 0.35)
                : busy
                    ? AppColors.warning.withValues(alpha: 0.35)
                    : AppColors.border,
          ),
        ),
        child: Row(
          children: [
            Avatar(name: name, size: 46),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 14.5,
                            fontWeight: missed || busy ? FontWeight.w700 : FontWeight.w600,
                          ),
                        ),
                      ),
                      _SourceBadge(source),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(icon, color: iconColor, size: 14),
                      const SizedBox(width: 4),
                      Text(
                        phone,
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      if (hasRecording) ...[
                        Icon(Icons.mic, color: AppColors.accent, size: 14),
                        const SizedBox(width: 4),
                      ],
                      if (hasSummary) ...[
                        Icon(Icons.auto_awesome, color: AppColors.success, size: 14),
                        const SizedBox(width: 4),
                      ],
                      Text(
                        _statusText(status),
                        style: TextStyle(
                          color: missed
                              ? AppColors.danger
                              : busy
                                  ? AppColors.warning
                                  : AppColors.textSecondary,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  createdAt == null ? '' : timeLabel(createdAt),
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5),
                ),
                const SizedBox(height: 4),
                Text(
                  durationLabel(_toInt(duration)),
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
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
    if (v is DateTime) return v;
    final s = v.toString();
    final dt = DateTime.tryParse(s);
    if (dt != null) return dt.toLocal();
    return null;
  }

  String _statusText(String s) {
    switch (s) {
      case 'missed': return 'मिस्ड';
      case 'busy': return 'व्यस्त';
      case 'declined': return 'अस्वीकृत';
      case 'ended': return 'End हुई';
      case 'in_progress': return 'चल रही';
      default: return s;
    }
  }
}

class _SourceBadge extends StatelessWidget {
  final String source;
  const _SourceBadge(this.source);

  String get _label {
    switch (source) {
      case 'gsm': return 'GSM';
      case 'twilio': return 'Twilio';
      case 'plivo': return 'Plivo';
      default: return 'WhatsApp';
    }
  }

  Color get _color {
    switch (source) {
      case 'gsm': return AppColors.accent;
      case 'twilio': return const Color(0xFFF472B6);
      case 'plivo': return const Color(0xFF34D399);
      default: return AppColors.success;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        _label,
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
