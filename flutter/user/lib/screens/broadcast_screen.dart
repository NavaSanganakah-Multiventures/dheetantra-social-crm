import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';


class BroadcastScreen extends StatefulWidget {
  const BroadcastScreen({super.key});

  @override
  State<BroadcastScreen> createState() => _BroadcastScreenState();
}

class _BroadcastScreenState extends State<BroadcastScreen> {
  int _step = 0;
  final _messageController = TextEditingController();
  bool _loading = false;
  bool _sending = false;
  List<Contact> _contacts = [];
  String _audience = 'सभी संपर्क';
  int _audienceCount = 0;

  @override
  void initState() {
    super.initState();
    _loadContacts();
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _loadContacts() async {
    setState(() => _loading = true);
    final data = await ApiService().getContacts();
    if (!mounted) return;
    setState(() {
      _contacts = data.map((j) => Contact.fromJson(j)).toList();
      _audienceCount = _contacts.length;
      _loading = false;
    });
  }

  void _sendBroadcast() async {
    if (_messageController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('कृपया संदेश लिखें')),
      );
      return;
    }

    setState(() => _sending = true);
    final result = await ApiService().sendBroadcast({
      'message': _messageController.text.trim(),
      'audience': _audience,
    });
    if (!mounted) return;
    setState(() => _sending = false);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          result['error'] != null
              ? 'त्रुटि: ${result['error']}'
              : 'ब्रॉडकास्ट भेजा जा रहा है...',
        ),
      ),
    );
    setState(() {
      _step = 0;
      _messageController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final leadsCount = _contacts.where((c) => c.isLead).length;
    final customersCount = _contacts.where((c) => !c.isLead).length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      children: [
        Row(
          children: [
            _StepIndicator(active: true, label: '1', title: 'संदेश'),
            const Expanded(child: Divider(color: AppColors.border)),
            _StepIndicator(active: _step >= 1, label: '2', title: 'ऑडियंस'),
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
        ] else ...[
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
            subtitle: '${_contacts.length} संपर्क',
            selected: _audience == 'सभी संपर्क',
            onTap: () => setState(() {
              _audience = 'सभी संपर्क';
              _audienceCount = _contacts.length;
            }),
          ),
          const SizedBox(height: 10),
          _AudienceOption(
            icon: Icons.bolt_outlined,
            title: 'लीड्स',
            subtitle: '$leadsCount लीड्स',
            selected: _audience == 'लीड्स',
            onTap: () => setState(() {
              _audience = 'लीड्स';
              _audienceCount = leadsCount;
            }),
          ),
          const SizedBox(height: 10),
          _AudienceOption(
            icon: Icons.star_outline_rounded,
            title: 'ग्राहक',
            subtitle: '$customersCount ग्राहक',
            selected: _audience == 'ग्राहक',
            onTap: () => setState(() {
              _audience = 'ग्राहक';
              _audienceCount = customersCount;
            }),
          ),
        ],
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: _sending
              ? null
              : () {
                  if (_step < 1) {
                    setState(() => _step++);
                  } else {
                    _sendBroadcast();
                  }
                },
          icon: Icon(_step == 1 ? Icons.send_rounded : Icons.arrow_forward_rounded, size: 18),
          label: Text(
            _sending
                ? 'भेज रहे हैं...'
                : _step == 1
                    ? 'ब्रॉडकास्ट भेजें ($_audienceCount)'
                    : 'आगे बढ़ें',
          ),
        ),
        if (_step > 0) ...[
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () => setState(() => _step--),
            child: const Text('वापस'),
          ),
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
