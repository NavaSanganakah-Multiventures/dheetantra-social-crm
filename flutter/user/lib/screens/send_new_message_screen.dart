import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'chat_screen.dart';

class SendNewMessageScreen extends StatefulWidget {
  const SendNewMessageScreen({super.key});

  @override
  State<SendNewMessageScreen> createState() => _SendNewMessageScreenState();
}

class _SendNewMessageScreenState extends State<SendNewMessageScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _messageController = TextEditingController();
  bool _sending = false;

  Future<void> _send() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final text = _messageController.text.trim();

    if (name.isEmpty || phone.isEmpty || text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in name, phone and message')),
      );
      return;
    }

    setState(() => _sending = true);
    final res = await ApiService().sendWhatsAppToNewNumber(
      name: name,
      phone: phone,
      text: text,
    );
    setState(() => _sending = false);

    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${res['error']}')),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Message sent')),
    );

    final conversationId = res['data']?['conversation_id'] ?? res['conversation_id'];
    if (conversationId != null) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            conversation: Conversation(
              id: conversationId.toString(),
              contact: Contact(id: '', name: name, phone: phone),
              messages: const [],
              platform: 'whatsapp',
            ),
          ),
        ),
      );
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp to a new number'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(
            controller: _nameController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Contact name',
              hintText: 'e.g. Rahul Kumar',
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone number',
              hintText: '+919876543210',
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _messageController,
            maxLines: 5,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Message',
              hintText: 'Write here...',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _sending ? null : _send,
            child: _sending
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Send'),
          ),
        ],
      ),
    );
  }
}
