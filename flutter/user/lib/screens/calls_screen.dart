import 'package:flutter/material.dart';

import '../data/mock_data.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key});

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  String _filter = 'à¤¸à¤­à¥€';

  static const _filters = ['à¤¸à¤­à¥€', 'à¤†à¤¨à¥‡ à¤µà¤¾à¤²à¥€', 'à¤œà¤¾à¤¨à¥‡ à¤µà¤¾à¤²à¥€', 'à¤®à¤¿à¤¸à¥à¤¡'];

  List<CallLog> get _calls {
    var list = mockCallLogs;
    switch (_filter) {
      case 'à¤†à¤¨à¥‡ à¤µà¤¾à¤²à¥€':
        list = list.where((c) => c.direction == 'incoming').toList();
      case 'à¤œà¤¾à¤¨à¥‡ à¤µà¤¾à¤²à¥€':
        list = list.where((c) => c.direction == 'outgoing').toList();
      case 'à¤®à¤¿à¤¸à¥à¤¡':
        list = list.where((c) => c.status == 'missed').toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final calls = _calls;
    return Scaffold(
      appBar: AppBar(
        title: const Text('à¤•à¥‰à¤² à¤²à¥‰à¤—à¥à¤¸'),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.call_outlined, color: AppColors.success),
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
            child: calls.isEmpty
                ? const Center(
                    child: EmptyState(
                      icon: Icons.call_outlined,
                      title: 'à¤•à¥‹à¤ˆ à¤•à¥‰à¤² à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¥€',
                      subtitle: 'à¤•à¥‰à¤² à¤²à¥‰à¤—à¥à¤¸ à¤¯à¤¹à¤¾à¤ à¤¦à¤¿à¤–à¤¾à¤ˆ à¤¦à¥‡à¤‚à¤—à¥‡à¥¤',
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                    itemCount: calls.length,
                    separatorBuilder: (__, ___) => const SizedBox(height: 8),
                    itemBuilder: (context, i) => _CallTile(call: calls[i]),
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
        return 'à¤®à¤¿à¤¸à¥à¤¡';
      case 'declined':
        return 'à¤…à¤¸à¥à¤µà¥€à¤•à¥ƒà¤¤';
      default:
        return status;
    }
  }
}
