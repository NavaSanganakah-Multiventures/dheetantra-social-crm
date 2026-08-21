import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _campaigns = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final data = await ApiService().getBroadcasts();
    if (!mounted) return;
    setState(() {
      _campaigns = data.map((j) => Map<String, dynamic>.from(j)).toList();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ब्रॉडकास्ट कैंपेन'),
        actions: [
          IconButton(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
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
                        const Icon(Icons.campaign_rounded, color: Colors.white, size: 30),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${_campaigns.length} कैंपेन',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 3),
                              const Text(
                                'आपके सभी ब्रॉडकास्ट कैंपेन और उनकी स्थिति',
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: 12.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  const SectionHeader(title: 'कैंपेन इतिहास'),
                  const SizedBox(height: 12),
                  if (_campaigns.isEmpty)
                    const EmptyState(
                      icon: Icons.campaign_outlined,
                      title: 'कोई कैंपेन नहीं',
                      subtitle: 'जब आप ब्रॉडकास्ट भेजेंगे तो कैंपेन यहाँ दिखेंगे।',
                    )
                  else
                    for (final campaign in _campaigns) ...[
                      _CampaignTile(campaign: campaign),
                      const SizedBox(height: 10),
                    ],
                ],
              ),
            ),
    );
  }
}

class _CampaignTile extends StatelessWidget {
  final Map<String, dynamic> campaign;

  const _CampaignTile({required this.campaign});

  @override
  Widget build(BuildContext context) {
    final status = (campaign['status'] ?? 'processing').toString();
    final total = campaign['total_recipients'] ?? 0;
    final sent = campaign['successful_sends'] ?? 0;
    final failed = campaign['failed_sends'] ?? 0;
    final pending = total - sent - failed;

    final Color statusColor;
    final String statusLabel;
    switch (status) {
      case 'completed':
        statusColor = AppColors.success;
        statusLabel = 'पूर्ण';
        break;
      case 'failed':
        statusColor = AppColors.danger;
        statusLabel = 'विफल';
        break;
      default:
        statusColor = AppColors.warning;
        statusLabel = 'प्रोसेसिंग';
    }

    final createdAt = DateTime.tryParse(campaign['created_at'] ?? '')?.toLocal();
    final progress = total > 0 ? (sent + failed) / total : 0.0;

    return Container(
      padding: const EdgeInsets.all(14),
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
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const Icon(Icons.campaign_rounded, color: AppColors.accent, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      campaign['name'] ?? 'ब्रॉडकास्ट',
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
                      '$total प्राप्तकर्ता • $sent भेजे गए${failed > 0 ? ' • $failed विफल' : ''}',
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
                      color: statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  if (createdAt != null)
                    Text(
                      timeLabel(createdAt),
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
          if (status == 'processing' && total > 0) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 5,
                backgroundColor: AppColors.surfaceAlt,
                valueColor: const AlwaysStoppedAnimation(AppColors.accent),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$pending बाकी',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}
