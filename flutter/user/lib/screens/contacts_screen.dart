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
  String _filter = 'à¤¸à¤­à¥';
  bool _loading = true;
  List<Contact> _allContacts = [];

  static const _filters = ['à¤¸à¤­à¥', 'à¤²à¥à¤¡à¥à¤¸', 'à¤à¥à¤°à¤¾à¤¹à¤'];

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
    if (_filter == 'à¤²à¥à¤¡à¥à¤¸') {
      list = list.where((c) => c.isLead).toList();
    } else if (_filter == 'à¤à¥à¤°à¤¾à¤¹à¤') {
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
                  hintText: 'à¤¸à¤à¤ªà¤°à¥à¤ à¤à¥à¤à¥à¤...',
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
                            title: 'à¤à¥à¤ à¤¸à¤à¤ªà¤°à¥à¤ à¤¨à¤¹à¥à¤ à¤®à¤¿à¤²à¤¾',
                            subtitle: 'à¤¨à¤¯à¤¾ à¤¸à¤à¤ªà¤°à¥à¤ à¤à¥à¤¡à¤¼à¥à¤ à¤¯à¤¾ à¤à¥à¤ à¤¬à¤¦à¤²à¥à¤à¥¤',
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
            label: const Text('à¤¨à¤¯à¤¾ à¤¸à¤à¤ªà¤°à¥à¤', style: TextStyle(fontWeight: FontWeight.w700)),
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
        title: Text(existing == null ? 'à¤¨à¤¯à¤¾ à¤¸à¤à¤ªà¤°à¥à¤' : 'à¤¸à¤à¤ªà¤°à¥à¤ à¤¸à¤à¤ªà¤¾à¤¦à¤¿à¤¤ à¤à¤°à¥à¤'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'à¤¨à¤¾à¤®'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'à¤«à¤¼à¥à¤¨'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'à¤à¤®à¥à¤² (à¤µà¥à¤à¤²à¥à¤ªà¤¿à¤)'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: notesController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'à¤¨à¥à¤à¥à¤¸ (à¤µà¥à¤à¤²à¥à¤ªà¤¿à¤)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('à¤°à¤¦à¥à¤¦ à¤à¤°à¥à¤'),
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
            child: Text(existing == null ? 'à¤à¥à¤¡à¤¼à¥à¤' : 'à¤¸à¥à¤µ à¤à¤°à¥à¤'),
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
        const SnackBar(content: Text('à¤¨à¤¾à¤® à¤à¤¨à¤¿à¤µà¤¾à¤°à¥à¤¯ à¤¹à¥')),
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
      SnackBar(content: Text(existing == null ? 'à¤¸à¤à¤ªà¤°à¥à¤ à¤à¥à¤¡à¤¼à¤¾ à¤à¤¯à¤¾' : 'à¤¸à¤à¤ªà¤°à¥à¤ à¤à¤ªà¤¡à¥à¤ à¤¹à¥à¤')),
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
        title: const Text('à¤¸à¤à¤ªà¤°à¥à¤ à¤¸à¤à¤ªà¤¾à¤¦à¤¿à¤¤ à¤à¤°à¥à¤'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'à¤¨à¤¾à¤®'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'à¤«à¤¼à¥à¤¨'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'à¤à¤®à¥à¤² (à¤µà¥à¤à¤²à¥à¤ªà¤¿à¤)'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: notesController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'à¤¨à¥à¤à¥à¤¸ (à¤µà¥à¤à¤²à¥à¤ªà¤¿à¤)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('à¤°à¤¦à¥à¤¦ à¤à¤°à¥à¤'),
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
            child: const Text('à¤¸à¥à¤µ à¤à¤°à¥à¤'),
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
        SnackBar(content: Text('à¤¤à¥à¤°à¥à¤à¤¿: ${res['error']}')),
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

  Future<void> _initiateTwilioCall(Contact contact) async {
    final configs = await ApiService().getTwilioConfigs();
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
    if (options.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Twilio के लिए कोई सक्रिय नंबर नहीं है')),
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
    if (options.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Plivo के लिए कोई सक्रिय नंबर नहीं है')),
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
        if (res['inApp'] == true) 'conferenceName': res['conferenceName'],
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
                  '$provider से कॉल करने के लिए नंबर चुनें',
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
        title: const Text('à¤¸à¤à¤ªà¤°à¥à¤ à¤¹à¤à¤¾à¤à¤'),
        content: Text('à¤à¥à¤¯à¤¾ à¤à¤ª "${_contact.name}" à¤à¥ à¤¹à¤à¤¾à¤¨à¤¾ à¤à¤¾à¤¹à¤¤à¥ à¤¹à¥à¤?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('à¤°à¤¦à¥à¤¦ à¤à¤°à¥à¤'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('à¤¹à¤à¤¾à¤à¤'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final res = await ApiService().deleteContact(_contact.id);
    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('à¤¤à¥à¤°à¥à¤à¤¿: ${res['error']}')),
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
        title: const Text('à¤¸à¤à¤ªà¤°à¥à¤ à¤µà¤¿à¤µà¤°à¤£'),
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
                        const SnackBar(content: Text('à¤à¥à¤² à¤¶à¥à¤°à¥ à¤à¥ à¤à¤')),
                      );
                    } catch (_) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('à¤à¥à¤² à¤¶à¥à¤°à¥ à¤¨à¤¹à¥à¤ à¤¹à¥ à¤¸à¤à¥')),
                      );
                    }
                  },
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: const Text('à¤à¥à¤²'),
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
                  label: const Text('à¤à¥à¤'),
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
              label: const Text('Twilio à¤à¥à¤²'),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _initiatePlivoCall(contact),
              icon: const Icon(Icons.call_outlined, size: 18),
              label: const Text('Plivo कॉल'),
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'à¤à¤¾à¤¨à¤à¤¾à¤°à¥',
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
                  label: 'à¤«à¤¼à¥à¤¨',
                  value: contact.phone,
                ),
                const Divider(height: 1, indent: 50),
                if (contact.email != null) ...[
                  _InfoRow(
                    icon: Icons.mail_outline_rounded,
                    label: 'à¤à¤®à¥à¤²',
                    value: contact.email!,
                  ),
                  const Divider(height: 1, indent: 50),
                ],
                _InfoRow(
                  icon: Icons.person_outline_rounded,
                  label: 'à¤ªà¥à¤°à¤à¤¾à¤°',
                  value: contact.isLead ? 'à¤²à¥à¤¡' : 'à¤à¥à¤°à¤¾à¤¹à¤',
                ),
                if (contact.leadStatus != null) ...[
                  const Divider(height: 1, indent: 50),
                  _InfoRow(
                    icon: Icons.flag_outlined,
                    label: 'à¤¸à¥à¤¥à¤¿à¤¤à¤¿',
                    value: contact.leadStatus!,
                  ),
                ],
                const Divider(height: 1, indent: 50),
                _InfoRow(
                  icon: Icons.schedule_rounded,
                  label: 'à¤à¤à¤¿à¤°à¥ à¤à¤¤à¤¿à¤µà¤¿à¤§à¤¿',
                  value: contact.lastActive == null
                      ? 'à¤à¤­à¥ à¤¨à¤¹à¥à¤'
                      : timeLabel(contact.lastActive!),
                ),
              ],
            ),
          ),
          if (contact.notes != null && contact.notes!.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text(
              'à¤¨à¥à¤à¥à¤¸',
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
