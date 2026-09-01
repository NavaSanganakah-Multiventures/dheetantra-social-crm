import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class ConversationPickerScreen extends StatefulWidget {
  const ConversationPickerScreen({super.key});

  @override
  State<ConversationPickerScreen> createState() => _ConversationPickerScreenState();
}

class _ConversationPickerScreenState extends State<ConversationPickerScreen> {
  final _noteController = TextEditingController();
  bool _loading = true;
  List<Conversation> _conversations = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final list = await ApiService().getConversations(status: 'open');
    if (!mounted) return;
    setState(() {
      _conversations = list.map((j) => Conversation.fromJson(j)).toList();
      _loading = false;
    });
  }

  Future<void> _select(Conversation conv) async {
    Navigator.of(context).pop({'conversationId': conv.id, 'note': _noteController.text.trim()});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Choose conversation')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _noteController,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Optional note'),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _conversations.isEmpty
                    ? const Center(child: EmptyState(icon: Icons.chat_outlined, title: 'No open conversations', subtitle: 'Start a chat first.'))
                    : ListView.builder(
                        itemCount: _conversations.length,
                        itemBuilder: (context, i) {
                          final c = _conversations[i];
                          return ListTile(
                            leading: Avatar(name: c.contact.name, size: 40),
                            title: Text(c.contact.name, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
                            subtitle: Text(c.contact.phone, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                            trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: AppColors.textMuted),
                            onTap: () => _select(c),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
