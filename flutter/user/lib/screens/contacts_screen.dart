import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'chat_screen.dart';
import 'call_screen.dart';

class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key});

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  String _query = '';
  String _filter = 'All';
  bool _loading = true;
  List<Contact> _allContacts = [];

  static const _filters = ['All', 'Leads', 'Customers'];

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
    if (_filter == 'Leads') {
      list = list.where((c) => c.isLead).toList();
    } else if (_filter == 'Customers') {
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
    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                decoration: const InputDecoration(
                  hintText: 'Search contacts or phone numbers...',
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
                            title: 'No contacts found',
                            subtitle: 'Add a new contact or change the search query.',
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadContacts,
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(20, 6, 20, 88),
                            itemCount: contacts.length,
                            separatorBuilder: (__, ___) => const SizedBox(height: 8),
                            itemBuilder: (context, i) => _ContactTile(
                              contact: contacts[i],
                              onChanged: _loadContacts,
                            ),
                          ),
                        ),
            ),
          ],
        ),
        // New contact FAB
        Positioned(
          right: 20,
          bottom: 20,
          child: FloatingActionButton.extended(
            onPressed: () => _showContactDialog(),
            backgroundColor: AppColors.accent,
            foregroundColor: Colors.white,
            icon: const Icon(Icons.person_add_alt_1_rounded, size: 20),
            label: const Text('New Contact', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }

  Future<void> _showContactDialog({Contact? existing}) async {
    final nameController = TextEditingController(text: existing?.name ?? '');
    final phoneController = TextEditingController(text: existing?.phone ?? '');
    final emailController = TextEditingController(text: existing?.email ?? '');
    final notesController = TextEditingController(text: existing?.notes ?? '');

    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(existing == null ? 'New Contact' : 'Edit Contact'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email (Optional)'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: notesController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Notes (Optional)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop({
                'name': nameController.text.trim(),
                'phone': phoneController.text.trim(),
                'email': emailController.text.trim(),
                'notes': notesController.text.trim(),
              });
            },
            child: Text(existing == null ? 'Add' : 'Save'),
          ),
        ],
      ),
    );

    if (result == null || !mounted) return;
    final data = <String, dynamic>{
      'name': result['name'],
      'phone': result['phone'],
      if (result['email']!.isNotEmpty) 'email': result['email'],
      if (result['notes']!.isNotEmpty) 'notes': result['notes'],
    };
    if (data['name'] == null || data['name'].toString().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name is required')),
      );
      return;
    }

    if (existing == null) {
      await ApiService().createContact(data);
    } else {
      await ApiService().updateContact(existing.id, data);
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(existing == null ? 'Contact added' : 'Contact updated')),
    );
    _loadContacts();
  }
}

class _ContactTile extends StatelessWidget {
  final Contact contact;
  final VoidCallback? onChanged;

  const _ContactTile({required this.contact, this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => _ContactDetailScreen(contact: contact, onChanged: onChanged),
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

class _ContactDetailScreen extends StatefulWidget {
  final Contact contact;
  final VoidCallback? onChanged;

  const _ContactDetailScreen({required this.contact, this.onChanged});

  @override
  State<_ContactDetailScreen> createState() => _ContactDetailScreenState();
}

class _ContactDetailScreenState extends State<_ContactDetailScreen> {
  late Contact _contact = widget.contact;

  Future<void> _edit() async {
    final nameController = TextEditingController(text: _contact.name);
    final phoneController = TextEditingController(text: _contact.phone);
    final emailController = TextEditingController(text: _contact.email ?? '');
    final notesController = TextEditingController(text: _contact.notes ?? '');

    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Contact'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email (Optional)'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: notesController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Notes (Optional)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop({
                'name': nameController.text.trim(),
                'phone': phoneController.text.trim(),
                'email': emailController.text.trim(),
                'notes': notesController.text.trim(),
              });
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (result == null || !mounted) return;
    final data = <String, dynamic>{
      'name': result['name'],
      'phone': result['phone'],
      if (result['email']!.isNotEmpty) 'email': result['email'],
      if (result['notes']!.isNotEmpty) 'notes': result['notes'],
    };
    final res = await ApiService().updateContact(_contact.id, data);
    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${res['error']}')),
      );
      return;
    }
    setState(() {
      _contact = Contact(
        id: _contact.id,
        name: result['name']!,
        phone: result['phone']!,
        tags: _contact.tags,
        isLead: _contact.isLead,
        lastActive: _contact.lastActive,
        email: result['email']!.isEmpty ? null : result['email'],
        notes: result['notes']!.isEmpty ? null : result['notes'],
      );
    });
    widget.onChanged?.call();
  }

  List<Map<String, String>> _buildFromNumberOptions(List<dynamic> configs) {
    final options = <Map<String, String>>[];
    for (final c in configs) {
      final configId = (c['id'] ?? '').toString();
      final configName = (c['name'] ?? '').toString();
      final fromNumbers = (c['fromNumbers'] as List?) ?? const [];
      for (final fn in fromNumbers) {
        final number = (fn['fromNumber'] ?? '').toString();
        if (number.isEmpty) continue;
        if (fn['isActive'] == false) continue;
        options.add({
          'configId': configId,
          'configName': configName,
          'fromNumber': number,
          'isDefault': (fn['isDefault'] == true).toString(),
        });
      }
    }
    return options;
  }

  Future<void> _initiateTwilioCall(Contact contact) async {
    final configs = await ApiService().getTwilioConfigs();
    final options = _buildFromNumberOptions(configs);
    if (options.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No active Twilio number configured')),
        );
      }
      return;
    }
    final picked = await _pickFromNumber('Twilio', options);
    if (picked == null) return;

    final res = await ApiService().initiateTwilioCall(
      to: contact.phone,
      contactId: contact.id,
      twilioConfigId: picked['configId'],
      fromNumber: picked['fromNumber'],
    );
    if (!mounted) return;
    if (res['success'] == true) {
      CallScreen.push(context, {
        'id': res['callId'],
        'source': 'twilio',
        'conferenceName': res['conferenceName'],
        'callerName': contact.name,
        'callerNumber': contact.phone,
        'phone': contact.phone,
        'contact_name': contact.name,
        'status': 'connecting',
      });
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Twilio call failed: ${res['error']}')),
      );
    }
  }

  Future<void> _initiatePlivoCall(Contact contact) async {
    final configs = await ApiService().getPlivoConfigs();
    final options = _buildFromNumberOptions(configs);
    if (options.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No active Plivo number configured')),
        );
      }
      return;
    }
    final picked = await _pickFromNumber('Plivo', options);
    if (picked == null) return;

    final res = await ApiService().initiatePlivoCall(
      to: contact.phone,
      contactId: contact.id,
      plivoConfigId: picked['configId'],
      fromNumber: picked['fromNumber'],
    );
    if (!mounted) return;
    if (res['success'] == true) {
      CallScreen.push(context, {
        'id': res['callId'],
        'source': 'plivo',
        'direction': 'outgoing',
        'dialUri': res['dialUri'],
        'plivoConfigId': res['plivoConfigId'],
        'callerName': contact.name,
        'callerNumber': contact.phone,
        'phone': contact.phone,
        'contact_name': contact.name,
        'status': 'connecting',
      });
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Plivo call failed: ${res['error']}')),
      );
    }
  }

  Future<Map<String, String>?> _pickFromNumber(
    String provider,
    List<Map<String, String>> options,
  ) async {
    if (options.length == 1) return options.first;
    final selected = await showModalBottomSheet<Map<String, String>>(
      context: context,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Select $provider Outbound Number',
                  style: Theme.of(ctx).textTheme.titleMedium,
                ),
              ),
              for (final o in options)
                ListTile(
                  leading: const Icon(Icons.phone_outlined),
                  title: Text(o['fromNumber']!),
                  subtitle: o['configName']!.isEmpty
                      ? null
                      : Text(o['configName']!),
                  trailing: o['isDefault'] == 'true'
                      ? const Icon(Icons.star, size: 18)
                      : null,
                  onTap: () => Navigator.of(ctx).pop(o),
                ),
            ],
          ),
        );
      },
    );
    return selected;
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Contact'),
        content: Text('Are you sure you want to delete "${_contact.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final res = await ApiService().deleteContact(_contact.id);
    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${res['error']}')),
      );
      return;
    }
    widget.onChanged?.call();
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final contact = _contact;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Contact Details'),
        actions: [
          IconButton(
            onPressed: _edit,
            icon: const Icon(Icons.edit_outlined, color: AppColors.textSecondary),
          ),
          IconButton(
            onPressed: _delete,
            icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
          ),
          const SizedBox(width: 4),
        ],
      ),
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
                  onPressed: () async {
                    try {
                      await ApiService().dio.post('/api/whatsapp/calls', data: {
                        'contactId': contact.id,
                        'type': 'voice',
                        'direction': 'outgoing',
                        'status': 'ringing',
                      });
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('WhatsApp Call initiated')),
                      );
                    } catch (_) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Could not start call')),
                      );
                    }
                  },
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: const Text('Call'),
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
                  label: const Text('Chat'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _initiateTwilioCall(contact),
              icon: const Icon(Icons.phone_forwarded, size: 18),
              label: const Text('Twilio Call'),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _initiatePlivoCall(contact),
              icon: const Icon(Icons.call_outlined, size: 18),
              label: const Text('Plivo Call'),
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Information',
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
                  label: 'Phone',
                  value: contact.phone,
                ),
                const Divider(height: 1, indent: 50),
                if (contact.email != null) ...[
                  _InfoRow(
                    icon: Icons.mail_outline_rounded,
                    label: 'Email',
                    value: contact.email!,
                  ),
                  const Divider(height: 1, indent: 50),
                ],
                _InfoRow(
                  icon: Icons.person_outline_rounded,
                  label: 'Type',
                  value: contact.isLead ? 'Lead' : 'Customer',
                ),
                if (contact.leadStatus != null) ...[
                  const Divider(height: 1, indent: 50),
                  _InfoRow(
                    icon: Icons.flag_outlined,
                    label: 'Status',
                    value: contact.leadStatus!,
                  ),
                ],
                const Divider(height: 1, indent: 50),
                _InfoRow(
                  icon: Icons.schedule_rounded,
                  label: 'Last Active',
                  value: contact.lastActive == null
                      ? 'Never'
                      : timeLabel(contact.lastActive!),
                ),
              ],
            ),
          ),
          if (contact.notes != null && contact.notes!.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text(
              'Notes',
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
