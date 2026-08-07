import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
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
  String _filter = 'सभी';
  bool _loading = true;
  List<Conversation> _allConversations = [];

  static const _filters = ['सभी', 'खुली', 'बंद'];

  @override
  void initState() {
    super.initState();
    _loadConversations();
  }

  Future<void> _loadConversations() async {
    setState(() => _loading = true);
    final api = ApiService();

    String? statusFilter;
    if (_filter == 'खुली') statusFilter = 'open';
    if (_filter == 'बंद') statusFilter = 'closed';

    final data = await api.getConversations(status: statusFilter);
    if (!mounted) return;

    setState(() {
      _allConversations = data.map((j) => Conversation.fromJson(j)).toList();
      _loading = false;
    });
  }

  List<Conversation> get _conversations {
    if (_query.trim().isEmpty) return _allConversations;
    return _allConversations
        .where((c) =>
            c.contact.name.toLowerCase().contains(_query.toLowerCase()) ||
            c.contact.phone.contains(_query))
        .toList();
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
              hintText: 'खोजें...',
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
                onSelected: (_) {
                  setState(() => _filter = f);
                  _loadConversations();
                },
                showCheckmark: false,
              );
            },
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : conversations.isEmpty
                  ? const Center(
                      child: EmptyState(
                        icon: Icons.search_off_rounded,
                        title: 'कोई बातचीत नहीं मिली',
                        subtitle: 'जब ग्राहक संदेश भेजेंगे तो यहाँ दिखेगा।',
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadConversations,
                      child: ListView.separated(
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
                          style: const TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      conversation.lastMessage,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 13,
                      ),
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
