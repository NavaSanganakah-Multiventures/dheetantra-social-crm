import 'package:flutter/material.dart';

import '../data/mock_data.dart';
import '../models/models.dart';
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
  String _filter = 'à¤¸à¤­à¥€';

  static const _filters = ['à¤¸à¤­à¥€', 'à¤²à¥€à¤¡à¥à¤¸', 'à¤—à¥à¤°à¤¾à¤¹à¤•'];

  List<Contact> get _contacts {
    var list = mockContacts;
    if (_filter == 'à¤²à¥€à¤¡à¥à¤¸') {
      list = list.where((c) => c.isLead).toList();
    } else if (_filter == 'à¤—à¥à¤°à¤¾à¤¹à¤•') {
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
              hintText: 'à¤¸à¤‚à¤ªà¤°à¥à¤• à¤–à¥‹à¤œà¥‡à¤‚...',
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
          child: contacts.isEmpty
              ? const Center(
                  child: EmptyState(
                    icon: Icons.people_outline_rounded,
                    title: 'à¤•à¥‹à¤ˆ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾',
                    subtitle: 'à¤¨à¤¯à¤¾ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤œà¥‹à¤¡à¤¼à¥‡à¤‚ à¤¯à¤¾ à¤–à¥‹à¤œ à¤¬à¤¦à¤²à¥‡à¤‚à¥¤',
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                  itemCount: contacts.length,
                  separatorBuilder: (__, ___) => const SizedBox(height: 8),
                  itemBuilder: (context, i) => _ContactTile(contact: contacts[i]),
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
                onPressed: () {},
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
      appBar: AppBar(title: const Text('à¤¸à¤‚à¤ªà¤°à¥à¤• à¤µà¤¿à¤µà¤°à¤£')),
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
                  label: const Text('à¤•à¥‰à¤²'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ChatScreen(
                          conversation: Conversation(
                            contact: contact,
                            messages: const [],
                          ),
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.chat_outlined, size: 18),
                  label: const Text('à¤šà¥ˆà¤Ÿ'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text(
            'à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€',
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
                  label: 'à¤«à¤¼à¥‹à¤¨',
                  value: contact.phone,
                ),
                const Divider(height: 1, indent: 50),
                _InfoRow(
                  icon: Icons.person_outline_rounded,
                  label: 'à¤ªà¥à¤°à¤•à¤¾à¤°',
                  value: contact.isLead ? 'à¤²à¥€à¤¡' : 'à¤—à¥à¤°à¤¾à¤¹à¤•',
                ),
                const Divider(height: 1, indent: 50),
                _InfoRow(
                  icon: Icons.schedule_rounded,
                  label: 'à¤†à¤–à¤¿à¤°à¥€ à¤—à¤¤à¤¿à¤µà¤¿à¤§à¤¿',
                  value: contact.lastActive == null
                      ? 'à¤•à¤­à¥€ à¤¨à¤¹à¥€à¤‚'
                      : timeLabel(contact.lastActive!),
                ),
              ],
            ),
          ),
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
          Text(
            value,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
