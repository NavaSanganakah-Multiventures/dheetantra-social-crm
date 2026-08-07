import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key});

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  String _filter = 'सभी';
  bool _loading = true;
  List<CallLog> _allCalls = [];

  static const _filters = ['सभी', 'आने वाली', 'जाने वाली', 'मिस्ड'];

  @override
  void initState() {
    super.initState();
    _loadCalls();
  }

  Future<void> _loadCalls() async {
    setState(() => _loading = true);
    final data = await ApiService().getCallLogs();
    if (!mounted) return;
    setState(() {
      _allCalls = data.map((j) => CallLog.fromJson(j)).toList();
      _loading = false;
    });
  }

  List<CallLog> get _calls {
    var list = _allCalls;
    switch (_filter) {
      case 'आने वाली':
        list = list.where((c) => c.direction == 'incoming').toList();
        break;
      case 'जाने वाली':
        list = list.where((c) => c.direction == 'outgoing').toList();
        break;
      case 'मिस्ड':
        list = list.where((c) => c.status == 'missed').toList();
        break;
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final calls = _calls;
    return Scaffold(
      appBar: AppBar(
        title: const Text('कॉल लॉग्स'),
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
          SizedBox(
            height: 48,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              scrollDirection: Axis.horizontal,
              itemCount: _filters.length,
              separatorBuilder: (__, ___) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final f = _filters[i];
                return ChoiceChip(
                  label: Text(f),
                  selected: _filter == f,
                  onSelected: (_) => setState(() => _filter = f),
                  showCheckmark: false,
                );
              },
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : calls.isEmpty
                    ? const Center(
                        child: EmptyState(
                          icon: Icons.call_outlined,
                          title: 'कोई कॉल नहीं मिली',
                          subtitle: 'कॉल लॉग्स यहाँ दिखाई देंगे।',
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
}

class _CallTile extends StatelessWidget {
  final CallLog call;

  const _CallTile({required this.call});

  @override
  Widget build(BuildContext context) {
    final missed = call.status == 'missed';
    final incoming = call.direction == 'incoming';
    final connected = call.status == 'connected';

    IconData icon;
    Color iconColor;
    if (missed) {
      icon = Icons.call_missed_rounded;
      iconColor = AppColors.danger;
    } else if (incoming) {
      icon = Icons.call_received_rounded;
      iconColor = AppColors.success;
    } else {
      icon = Icons.call_made_rounded;
      iconColor = AppColors.accent;
    }

    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: missed ? AppColors.danger.withValues(alpha: 0.35) : AppColors.border,
        ),
      ),
      child: Row(
        children: [
          Avatar(name: call.name, size: 46),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  call.name,
                  style: TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 14.5,
                    fontWeight: missed ? FontWeight.w700 : FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    Icon(icon, color: iconColor, size: 14),
                    const SizedBox(width: 4),
                    Text(
                      call.phone,
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12.5,
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
                timeLabel(call.time),
                style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5),
              ),
              const SizedBox(height: 4),
              Text(
                connected ? durationLabel(call.durationSeconds) : _statusLabel(call.status),
                style: TextStyle(
                  color: missed ? AppColors.danger : AppColors.textSecondary,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'missed':
        return 'मिस्ड';
      case 'declined':
        return 'अस्वीकृत';
      default:
        return status;
    }
  }
}
