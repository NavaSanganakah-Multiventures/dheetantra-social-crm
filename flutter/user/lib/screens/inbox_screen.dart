import 'package:flutter/material.dart';

import '../data/mock_data.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'chat_screen.dart';

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  String _query = '';
  String _filter = 'à¤¸à¤­à¥€';

  static const _filters = ['à¤¸à¤­à¥€', 'à¤…à¤ªà¤ à¤¿à¤¤', 'à¤¸à¤•à¥à¤°à¤¿à¤¯'];

  List<Conversation> get _conversations {
    var list = mockConversations;
    if (_filter == 'à¤…à¤ªà¤ à¤¿à¤¤') {
      list = list.where((c) => c.unreadCount > 0).toList();
    } else if (_filter == 'à¤¸à¤•à¥à¤°à¤¿à¤¯') {
      list = list.where((c) => c.isActive).toList();
    }
    if (_query.trim().isNotEmpty) {
      list = list
          .where((c) =>
              c.contact.name.toLowerCase().contains(_query.toLowerCase()) ||
              c.contact.phone.contains(_query))
          .toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final conversations = _conversations;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
          child: TextField(
            onChanged: (v) => setState(() => _query = v),
            decoration: const InputDecoration(
              hintText: 'à¤–à¥‹à¤œà¥‡à¤‚...',
              prefixIcon: Icon(Icons.search_rounded, color: AppColors.textMuted),
              contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),
        ),
        SizedBox(
          height: 48,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            scrollDirection: Axis.horizontal,
            itemCount: _filters.length,
            separatorBuilder: (__, ___) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final f = _filters[i];
              final selected = _filter == f;
              return ChoiceChip(
                label: Text(f),
                selected: selected,
                onSelected: (_) => setState(() => _filter = f),
                showCheckmark: false,
              );
            },
          ),
        ),
        Expanded(
          child: conversations.isEmpty
              ? const Center(
                  child: EmptyState(
                    icon: Icons.search_off_rounded,
                    title: 'à¤•à¥‹à¤ˆ à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¥€',
                    subtitle: 'à¤–à¥‹à¤œ à¤¬à¤¦à¤²à¤•à¤° à¤¦à¥‡à¤–à¥‡à¤‚ à¤¯à¤¾ à¤¨à¤¯à¤¾ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤¶à¥à¤°à¥‚ à¤•à¤°à¥‡à¤‚à¥¤',
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                  itemCount: conversations.length,
                  separatorBuilder: (__, ___) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final c = conversations[i];
                    return _ConversationTile(
                      conversation: c,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => ChatScreen(conversation: c)),
                        );
                      },
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _ConversationTile extends StatelessWidget {
  final Conversation conversation;
  final VoidCallback onTap;

  const _ConversationTile({required this.conversation, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final contact = conversation.contact;
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: conversation.isActive ? AppColors.accent.withValues(alpha: 0.4) : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              Avatar(
                name: contact.name,
                size: 50,
                status: conversation.isActive ? 'online' : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            contact.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.textPrimary,
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Text(
                          timeLabel(conversation.lastTime),
                          style: TextStyle(
                            color: conversation.unreadCount > 0
                                ? AppColors.accent
                                : AppColors.textMuted,
                            fontSize: 11,
                            fontWeight: conversation.unreadCount > 0
                                ? FontWeight.w700
                                : FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.lastMessage,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: conversation.unreadCount > 0
                                  ? AppColors.textSecondary
                                  : AppColors.textMuted,
                              fontSize: 13,
                              fontWeight: conversation.unreadCount > 0
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                            ),
                          ),
                        ),
                        if (conversation.unreadCount > 0) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: const BoxDecoration(
                              color: AppColors.accent,
                              borderRadius: BorderRadius.all(Radius.circular(10)),
                            ),
                            child: Text(
                              '${conversation.unreadCount}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
