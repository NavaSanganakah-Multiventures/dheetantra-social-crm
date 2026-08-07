import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'calls_screen.dart';
import 'chat_screen.dart';
import 'schedule_screen.dart';

class DashboardScreen extends StatefulWidget {
  final VoidCallback onOpenInbox;

  const DashboardScreen({super.key, required this.onOpenInbox});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _loading = true;
  int _totalContacts = 0;
  int _openConversations = 0;
  List<Conversation> _recentChats = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final api = ApiService();
    final stats = await api.getDashboardStats();
    if (!mounted) return;

    final convList = (stats['conversations'] as List)
        .map((j) => Conversation.fromJson(j))
        .toList();

    setState(() {
      _totalContacts = stats['totalContacts'] ?? 0;
      _openConversations = stats['openConversations'] ?? 0;
      _recentChats = convList.take(3).toList();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
        children: [
          const Text(
            'आपका स्वागत है! 👋',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 22,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'यहाँ आपके वर्कस्पेस का अवलोकन है।',
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: StatCard(
                  title: 'कुल संपर्क',
                  value: '$_totalContacts',
                  trend: 'CRM डेटा',
                  icon: Icons.people_alt_outlined,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  title: 'खुली बातचीत',
                  value: '$_openConversations',
                  trend: 'सक्रिय कनेक्शन',
                  icon: Icons.forum_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          _QuickActions(onOpenInbox: widget.onOpenInbox),
          const SizedBox(height: 28),
          SectionHeader(
            title: 'हाल की बातचीत',
            actionLabel: 'सभी देखें',
            onAction: widget.onOpenInbox,
          ),
          const SizedBox(height: 12),
          _RecentChats(conversations: _recentChats, onOpenInbox: widget.onOpenInbox),
        ],
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  final VoidCallback onOpenInbox;

  const _QuickActions({required this.onOpenInbox});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'क्विक एक्शन्स'),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _QuickActionCard(
                icon: Icons.chat_outlined,
                label: 'इनबॉक्स',
                onTap: onOpenInbox,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _QuickActionCard(
                icon: Icons.call_outlined,
                label: 'कॉल लॉग्स',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const CallsScreen()),
                  );
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _QuickActionCard(
                icon: Icons.event_outlined,
                label: 'शेड्यूल',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const ScheduleScreen()),
                  );
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _QuickActionCard(
                icon: Icons.campaign_outlined,
                label: 'ब्रॉडकास्ट',
                onTap: () {},
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickActionCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            Icon(icon, color: AppColors.accent, size: 22),
            const SizedBox(height: 6),
            Text(
              label,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecentChats extends StatelessWidget {
  final List<Conversation> conversations;
  final VoidCallback onOpenInbox;

  const _RecentChats({required this.conversations, required this.onOpenInbox});

  @override
  Widget build(BuildContext context) {
    if (conversations.isEmpty) {
      return const EmptyState(
        icon: Icons.forum_outlined,
        title: 'कोई सक्रिय बातचीत नहीं मिली।',
        subtitle: 'जब ग्राहक संदेश भेजेंगे तो यहाँ दिखेगा।',
      );
    }
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < conversations.length; i++) ...[
            if (i > 0) const Divider(height: 1, indent: 76),
            _RecentChatTile(
              conversation: conversations[i],
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ChatScreen(conversation: conversations[i]),
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _RecentChatTile extends StatelessWidget {
  final Conversation conversation;
  final VoidCallback onTap;

  const _RecentChatTile({required this.conversation, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Avatar(
              name: conversation.contact.name,
              size: 44,
              status: conversation.isActive ? 'online' : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    conversation.contact.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    conversation.lastMessage,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              timeLabel(conversation.lastTime),
              style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
