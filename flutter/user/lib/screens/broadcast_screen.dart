import 'package:flutter/material.dart';

import '../data/mock_data.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class BroadcastScreen extends StatefulWidget {
  const BroadcastScreen({super.key});

  @override
  State<BroadcastScreen> createState() => _BroadcastScreenState();
}

class _BroadcastScreenState extends State<BroadcastScreen> {
  int _step = 0;
  final _messageController = TextEditingController();
  String _audience = 'सभी संपर्क (1,240)';
  bool _schedule = false;
  int _scheduleMinutes = 60;

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  void _sendBroadcast() {
    if (_messageController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('कृपया संदेश लिखें')),
      );
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _schedule ? 'ब्रॉडकास्ट शेड्यूल हो गया!' : 'ब्रॉडकास्ट भेजा जा रहा है...',
        ),
      ),
    );
    setState(() {
      _step = 0;
      _messageController.clear();
      _audience = 'सभी संपर्क (1,240)';
      _schedule = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      children: [
        Row(
          children: [
            _StepIndicator(active: true, label: '1', title: 'संदेश'),
            const Expanded(child: Divider(color: AppColors.border)),
            _StepIndicator(active: _step >= 1, label: '2', title: 'ऑडियंस'),
            const Expanded(child: Divider(color: AppColors.border)),
            _StepIndicator(active: _step >= 2, label: '3', title: 'शेड्यूल'),
          ],
        ),
        const SizedBox(height: 24),
        if (_step == 0) ...[
          const Text(
            'संदेश लिखें',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'यह संदेश चयनित ऑडियंस को WhatsApp पर भेजा जाएगा।',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12.5),
          ),
          const SizedBox(height: 14),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: TextField(
              controller: _messageController,
              maxLines: 6,
              maxLength: 1000,
              decoration: const InputDecoration(
                hintText: 'अपना ब्रॉडकास्ट संदेश यहाँ लिखें...',
                filled: false,
                border: InputBorder.none,
                contentPadding: EdgeInsets.all(16),
              ),
            ),
          ),
          const SizedBox(height: 4),
          const Row(
            children: [
              Icon(Icons.info_outline_rounded, color: AppColors.textMuted, size: 15),
              SizedBox(width: 6),
              Expanded(
                child: Text(
                  'व्यक्तिगत टेम्पलेट्स के लिए नाम, {नाम} जैसे वेरिएबल्स का उपयोग करें।',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              ),
            ],
          ),
        ] else if (_step == 1) ...[
          const Text(
            'ऑडियंस चुनें',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'ब्रॉडकास्ट किसे भेजना है, चुनें।',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12.5),
          ),
          const SizedBox(height: 14),
          _AudienceOption(
            icon: Icons.people_alt_outlined,
            title: 'सभी संपर्क',
            subtitle: '1,240 संपर्क',
            selected: _audience == 'सभी संपर्क (1,240)',
            onTap: () => setState(() => _audience = 'सभी संपर्क (1,240)'),
          ),
          const SizedBox(height: 10),
          _AudienceOption(
            icon: Icons.bolt_outlined,
            title: 'लीड्स',
            subtitle: '312 लीड्स',
            selected: _audience == 'लीड्स (312)',
            onTap: () => setState(() => _audience = 'लीड्स (312)'),
          ),
          const SizedBox(height: 10),
          _AudienceOption(
            icon: Icons.star_outline_rounded,
            title: 'VIP ग्राहक',
            subtitle: '86 ग्राहक',
            selected: _audience == 'VIP ग्राहक (86)',
            onTap: () => setState(() => _audience = 'VIP ग्राहक (86)'),
          ),
        ] else ...[
          const Text(
            'शेड्यूल सेटिंग्स',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'अभी भेजें या बाद के लिए शेड्यूल करें।',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12.5),
          ),
          const SizedBox(height: 14),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: SwitchListTile(
              value: _schedule,
              onChanged: (v) => setState(() => _schedule = v),
              activeTrackColor: AppColors.accent,
              title: const Text(
                'बाद के लिए शेड्यूल करें',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              subtitle: Text(
                _schedule ? 'शेड्यूल समय सेट करें' : 'अभी तुरंत भेजें',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ),
          ),
          if (_schedule) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'कितने समय में भेजें?',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<int>(
                    initialValue: _scheduleMinutes,
                    dropdownColor: AppColors.surfaceAlt,
                    items: const [
                      DropdownMenuItem(value: 60, child: Text('1 घंटे में')),
                      DropdownMenuItem(value: 180, child: Text('3 घंटे में')),
                      DropdownMenuItem(value: 1440, child: Text('कल (24 घंटे)')),
                      DropdownMenuItem(value: 4320, child: Text('3 दिन में')),
                    ],
                    onChanged: (v) => setState(() => _scheduleMinutes = v ?? 60),
                  ),
                ],
              ),
            ),
          ],
        ],
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: () {
            if (_step < 2) {
              setState(() => _step++);
            } else {
              _sendBroadcast();
            }
          },
          icon: Icon(_step == 2 ? Icons.send_rounded : Icons.arrow_forward_rounded, size: 18),
          label: Text(_step == 2 ? (_schedule ? 'शेड्यूल करें' : 'ब्रॉडकास्ट भेजें') : 'आगे बढ़ें'),
        ),
        if (_step > 0) ...[
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () => setState(() => _step--),
            child: const Text('वापस'),
          ),
        ],
        const SizedBox(height: 28),
        const SectionHeader(title: 'हाल के ब्रॉडकास्ट'),
        const SizedBox(height: 12),
        for (final b in mockBroadcasts) ...[
          _BroadcastTile(broadcast: b),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _StepIndicator extends StatelessWidget {
  final bool active;
  final String label;
  final String title;

  const _StepIndicator({
    required this.active,
    required this.label,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? AppColors.accent : AppColors.surfaceAlt,
            shape: BoxShape.circle,
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? Colors.white : AppColors.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          title,
          style: TextStyle(
            color: active ? AppColors.textPrimary : AppColors.textMuted,
            fontSize: 12,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _AudienceOption extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  const _AudienceOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent.withValues(alpha: 0.1) : AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.border,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: selected ? AppColors.accent : AppColors.textMuted, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: selected ? AppColors.accent : AppColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            Icon(
              selected ? Icons.check_circle_rounded : Icons.circle_outlined,
              color: selected ? AppColors.accent : AppColors.textMuted,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _BroadcastTile extends StatelessWidget {
  final Broadcast broadcast;

  const _BroadcastTile({required this.broadcast});

  @override
  Widget build(BuildContext context) {
    final deliveredPct = (broadcast.delivered / broadcast.recipients * 100).round();
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
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: broadcast.channel == 'WhatsApp'
                      ? AppColors.whatsapp.withValues(alpha: 0.12)
                      : AppColors.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  broadcast.channel == 'WhatsApp'
                      ? Icons.chat_rounded
                      : Icons.mail_outline_rounded,
                  color: broadcast.channel == 'WhatsApp'
                      ? AppColors.whatsapp
                      : AppColors.accent,
                  size: 17,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  broadcast.message,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: deliveredPct / 100,
              minHeight: 6,
              backgroundColor: AppColors.surfaceAlt,
              valueColor: const AlwaysStoppedAnimation(AppColors.success),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text(
                '${broadcast.recipients} प्राप्तकर्ता',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5),
              ),
              const Spacer(),
              const Icon(Icons.done_all_rounded, color: AppColors.success, size: 14),
              const SizedBox(width: 4),
              Text(
                '${broadcast.delivered} डिलीवर्ड',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5),
              ),
              const SizedBox(width: 10),
              Text(
                timeLabel(broadcast.sentAt),
                style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
