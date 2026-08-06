import 'package:flutter/material.dart';

import '../data/mock_data.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class ScheduleScreen extends StatelessWidget {
  const ScheduleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final posts = mockScheduledPosts;
    final count = posts.length;
    final next = posts.isEmpty ? null : posts.first.scheduledAt;
    final hours = next == null ? 0 : next.difference(DateTime.now()).inHours;
    return Scaffold(
      appBar: AppBar(
        title: const Text('शेड्यूल्ड पोस्ट्स'),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.add_circle_outline_rounded, color: AppColors.accent),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: AppColors.heroGradient,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                const Icon(Icons.event_available_rounded, color: Colors.white, size: 30),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$count शेड्यूल्ड पोस्ट्स',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        next == null ? 'कोई पोस्ट नहीं' : 'अगला: $hours घंटे बाद',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                  ),
                ),
                FilledButton(
                  onPressed: () {},
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.accentDark,
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  child: const Text('नई पोस्ट'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const SectionHeader(title: 'आने वाली पोस्ट्स'),
          const SizedBox(height: 12),
          for (final post in mockScheduledPosts) ...[
            _PostTile(post: post),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _PostTile extends StatelessWidget {
  final ScheduledPost post;

  const _PostTile({required this.post});

  @override
  Widget build(BuildContext context) {
    final isSoon = post.scheduledAt.difference(DateTime.now()).inHours < 6;
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
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: post.channelIcon == 'whatsapp'
                  ? AppColors.whatsapp.withValues(alpha: 0.12)
                  : AppColors.accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(
              post.channelIcon == 'whatsapp' ? Icons.chat_rounded : Icons.mail_outline_rounded,
              color: post.channelIcon == 'whatsapp' ? AppColors.whatsapp : AppColors.accent,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  post.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  post.audience,
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isSoon
                      ? AppColors.warning.withValues(alpha: 0.12)
                      : AppColors.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  isSoon ? 'जल्द' : 'बाद में',
                  style: TextStyle(
                    color: isSoon ? AppColors.warning : AppColors.accent,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                timeLabel(post.scheduledAt),
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
