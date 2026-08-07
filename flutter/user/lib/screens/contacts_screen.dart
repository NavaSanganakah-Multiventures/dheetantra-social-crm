import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'chat_screen.dart';

class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key});

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  String _query = '';
  String _filter = 'सभी';
  bool _loading = true;
  List<Contact> _allContacts = [];

  static const _filters = ['सभी', 'लीड्स', 'ग्राहक'];

  @override
  void initState() {
    super.initState();
    _loadContacts();
  }

  Future<void> _loadContacts() async {
    setState(() => _loading = true);
    final data = await ApiService().getContacts();
    if (!mounted) return;
    setState(() {
      _allContacts = data.map((j) => Contact.fromJson(j)).toList();
      _loading = false;
    });
  }

  List<Contact> get _contacts {
    var list = _allContacts;
    if (_filter == 'लीड्स') {
      list = list.where((c) => c.isLead).toList();
    } else if (_filter == 'ग्राहक') {
      list = list.where((c) => !c.isLead).toList();
    }
    if (_query.trim().isNotEmpty) {
      list = list
          .where((c) =>
              c.name.toLowerCase().contains(_query.toLowerCase()) ||
              c.phone.contains(_query))
          .toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final contacts = _contacts;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
          child: TextField(
            onChanged: (v) => setState(() => _query = v),
            decoration: const InputDecoration(
              hintText: 'संपर्क खोजें...',
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
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : contacts.isEmpty
                  ? const Center(
                      child: EmptyState(
                        icon: Icons.people_outline_rounded,
                        title: 'कोई संपर्क नहीं मिला',
                        subtitle: 'नया संपर्क जोड़ें या खोज बदलें।',
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadContacts,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                        itemCount: contacts.length,
                        separatorBuilder: (__, ___) => const SizedBox(height: 8),
                        itemBuilder: (context, i) => _ContactTile(contact: contacts[i]),
                      ),
                    ),
        ),
      ],
    );
  }
}

class _ContactTile extends StatelessWidget {
  final Contact contact;

  const _ContactTile({required this.contact});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => _ContactDetailScreen(contact: contact),
            ),
          );
        },
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Avatar(name: contact.name, size: 46),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      contact.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      contact.phone,
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12.5,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    if (contact.tags.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          for (final tag in contact.tags) TagChip(label: tag),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 6),
              IconButton(
                onPressed: () async {
                  final result = await ApiService().initiateConversation(contact.id);
                  if (result['conversation'] != null && context.mounted) {
                    final conv = Conversation.fromJson(result['conversation']);
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => ChatScreen(conversation: conv)),
                    );
                  }
                },
                icon: const Icon(Icons.chat_bubble_outline_rounded,
                    color: AppColors.accent, size: 20),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ContactDetailScreen extends StatelessWidget {
  final Contact contact;

  const _ContactDetailScreen({required this.contact});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('संपर्क विवरण')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: Avatar(name: contact.name, size: 88),
          ),
          const SizedBox(height: 14),
          Center(
            child: Text(
              contact.name,
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              contact.phone,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 14),
            ),
          ),
          if (contact.tags.isNotEmpty) ...[
            const SizedBox(height: 12),
            Center(
              child: Wrap(
                spacing: 8,
                children: [for (final tag in contact.tags) TagChip(label: tag)],
              ),
            ),
          ],
          const SizedBox(height: 28),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: const Text('कॉल'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () async {
                    final result = await ApiService().initiateConversation(contact.id);
                    if (result['conversation'] != null && context.mounted) {
                      final conv = Conversation.fromJson(result['conversation']);
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => ChatScreen(conversation: conv)),
                      );
                    }
                  },
                  icon: const Icon(Icons.chat_outlined, size: 18),
                  label: const Text('चैट'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text(
            'जानकारी',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                _InfoRow(
                  icon: Icons.phone_outlined,
                  label: 'फ़ोन',
                  value: contact.phone,
                ),
                const Divider(height: 1, indent: 50),
                if (contact.email != null) ...[
                  _InfoRow(
                    icon: Icons.mail_outline_rounded,
                    label: 'ईमेल',
                    value: contact.email!,
                  ),
                  const Divider(height: 1, indent: 50),
                ],
                _InfoRow(
                  icon: Icons.person_outline_rounded,
                  label: 'प्रकार',
                  value: contact.isLead ? 'लीड' : 'ग्राहक',
                ),
                if (contact.leadStatus != null) ...[
                  const Divider(height: 1, indent: 50),
                  _InfoRow(
                    icon: Icons.flag_outlined,
                    label: 'स्थिति',
                    value: contact.leadStatus!,
                  ),
                ],
                const Divider(height: 1, indent: 50),
                _InfoRow(
                  icon: Icons.schedule_rounded,
                  label: 'आखिरी गतिविधि',
                  value: contact.lastActive == null
                      ? 'कभी नहीं'
                      : timeLabel(contact.lastActive!),
                ),
              ],
            ),
          ),
          if (contact.notes != null && contact.notes!.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text(
              'नोट्स',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(
                contact.notes!,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icon, color: AppColors.textMuted, size: 18),
          const SizedBox(width: 12),
          Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
