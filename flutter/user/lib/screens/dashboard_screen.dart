import 'package:flutter/material.dart';

import '../data/mock_data.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'calls_screen.dart';
import 'chat_screen.dart';
import 'schedule_screen.dart';

class DashboardScreen extends StatelessWidget {
  final VoidCallback onOpenInbox;

  const DashboardScreen({super.key, required this.onOpenInbox});

  @override
  Widget build(BuildContext context) {
    return ListView(
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
        const Row(
          children: [
            Expanded(
              child: StatCard(
                title: 'कुल संपर्क',
                value: '1,240',
                trend: '+12% पिछले सप्ताह से',
                icon: Icons.people_alt_outlined,
              ),
            ),
            SizedBox(width: 12),
            Expanded(
              child: StatCard(
                title: 'खुली बातचीत',
                value: '38',
                trend: 'सक्रिय कनेक्शन',
                icon: Icons.forum_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        const StatCard(
          title: 'ब्रॉडकास्ट भेजे गए',
          value: '156',
          trend: '+5% पिछले महीने से',
          icon: Icons.campaign_outlined,
        ),
        const SizedBox(height: 28),
        _QuickActions(onOpenInbox: onOpenInbox),
        const SizedBox(height: 28),
        SectionHeader(
          title: 'हाल की बातचीत',
          actionLabel: 'सभी देखें',
          onAction: onOpenInbox,
        ),
        const SizedBox(height: 12),
        _RecentChats(onOpenInbox: onOpenInbox),
        const SizedBox(height: 28),
        SectionHeader(
          title: 'आगामी पोस्ट्स',
          actionLabel: 'शेड्यूल करें',
          onAction: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ScheduleScreen()),
            );
          },
        ),
        const SizedBox(height: 12),
        _UpcomingPosts(),
      ],
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
  final VoidCallback onOpenInbox;

  const _RecentChats({required this.onOpenInbox});

  @override
  Widget build(BuildContext context) {
    final recent = mockConversations.take(3).toList();
    if (recent.isEmpty) {
      return const EmptyState(
        icon: Icons.forum_outlined,
        title: 'कोई सक्रिय बातचीत नहीं मिली।',
        subtitle: 'अपना API सिंक करें या संदेश प्राप्त करें।',
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
          for (var i = 0; i < recent.length; i++) ...[
            if (i > 0) const Divider(height: 1, indent: 76),
            _RecentChatTile(
              conversation: recent[i],
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ChatScreen(conversation: recent[i]),
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

class _UpcomingPosts extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final posts = mockScheduledPosts.take(2).toList();
    if (posts.isEmpty) {
      return const EmptyState(
        icon: Icons.event_outlined,
        title: 'कोई पोस्ट शेड्यूल नहीं है।',
        subtitle: 'शेड्यूलिंग टैब पर जाकर नई पोस्ट बनाएं।',
      );
    }
    return Column(
      children: [
        for (final post in posts) ...[
          _ScheduledPostTile(post: post),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _ScheduledPostTile extends StatelessWidget {
  final ScheduledPost post;

  const _ScheduledPostTile({required this.post});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: post.channelIcon == 'whatsapp'
                  ? AppColors.whatsapp.withValues(alpha: 0.12)
                  : AppColors.accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              post.channelIcon == 'whatsapp' ? Icons.chat_rounded : Icons.mail_outline_rounded,
              color: post.channelIcon == 'whatsapp' ? AppColors.whatsapp : AppColors.accent,
              size: 19,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  post.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${post.channel} • ${post.audience}',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            timeLabel(post.scheduledAt),
            style: const TextStyle(
              color: AppColors.accent,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
