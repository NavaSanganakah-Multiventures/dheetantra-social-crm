import 'dart:async';

import 'package:flutter/material.dart';

import '../models/models.dart' as models;
import '../services/api_service.dart';
import '../services/notification_center.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'chat_screen.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  StreamSubscription? _sub;

  @override
  void initState() {
    super.initState();
    _sub = NotificationCenter().onChanged.listen((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _onTap(Map<String, dynamic> item) async {
    final data = item['data'] as Map<String, dynamic>? ?? const {};
    final type = item['type'] ?? 'system';
    if (type == 'message') {
      final convId = data['conversation_id'] ?? '';
      final phone = data['from'] ?? '';
      if (convId.isNotEmpty) {
        final result = await ApiService().getMessages(convId);
        if (!mounted) return;
        final conv = result['conversation'];
        if (conv is Map) {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ChatScreen(
                conversation: models.Conversation(
                  id: convId,
                  contact: models.Contact(
                    id: conv['contact_id'] ?? '',
                    name: conv['contact_name'] ?? 'Unknown',
                    phone: conv['phone'] ?? '',
                  ),
                  messages: const [],
                ),
              ),
            ),
          );
        }
      } else if (phone.isNotEmpty) {
        final data = await ApiService().getConversations();
        if (!mounted) return;
        for (final j in data) {
          final conv = models.Conversation.fromJson(j);
          if (conv.contact.phone.replaceAll('+', '') == phone.replaceAll('+', '')) {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => ChatScreen(conversation: conv)),
            );
            return;
          }
        }
      }
    } else if (type == 'call') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('कॉल विवरण के लिए कॉल लॉग्स देखें।')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = NotificationCenter().items;
    return Scaffold(
      appBar: AppBar(
        title: const Text('सूचनाएं'),
        actions: [
          if (items.isNotEmpty)
            TextButton(
              onPressed: () => setState(() => NotificationCenter().clear()),
              child: const Text(
                'साफ करें',
                style: TextStyle(color: AppColors.accent, fontSize: 13),
              ),
            ),
          const SizedBox(width: 8),
        ],
      ),
      body: items.isEmpty
          ? const Center(
              child: EmptyState(
                icon: Icons.notifications_none_rounded,
                title: 'कोई सूचना नहीं',
                subtitle: 'नए संदेश, कॉल्स और अपडेट्स यहाँ दिखेंगे।',
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final item = items[i];
                return _NotificationTile(item: item, onTap: () => _onTap(item));
              },
            ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;

  const _NotificationTile({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final type = item['type'] ?? 'system';
    final IconData icon;
    final Color color;
    switch (type) {
      case 'message':
        icon = Icons.chat_bubble_outline_rounded;
        color = AppColors.accent;
        break;
      case 'call':
        icon = Icons.call_outlined;
        color = AppColors.danger;
        break;
      default:
        icon = Icons.info_outline_rounded;
        color = AppColors.warning;
    }

    final time = item['time'] as DateTime? ?? DateTime.now();
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['title'] ?? '',
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      item['body'] ?? '',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                timeLabel(time),
                style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
